#!/usr/bin/env python3
"""
Training service for managing ML model training pipelines
"""

import logging
import asyncio
import json
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import mlflow
import mlflow.sklearn

from src.models.prediction.performance_predictor import PerformancePredictor
from src.models.optimization.budget_optimizer import BudgetOptimizer
from src.models.optimization.audience_segmenter import AudienceSegmenter
from src.models.prediction.anomaly_detector import AnomalyDetector
from src.utils.data_validator import DataValidator
from src.utils.model_utils import ModelManager

logger = logging.getLogger(__name__)


class TrainingService:
    """Service for managing model training pipelines"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.model_manager = ModelManager(config)
        self.data_validator = DataValidator()
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Initialize MLflow
        mlflow.set_tracking_uri(config.get('mlflow', {}).get('tracking_uri', 'sqlite:///mlflow.db'))
        mlflow.set_experiment(config.get('mlflow', {}).get('experiment_name', 'admetrics_models'))
        
    async def train_model(self,
                         model_type: str,
                         training_data: pd.DataFrame,
                         parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Train a specific model type"""
        
        try:
            # Validate data
            validation_result = self.data_validator.validate_training_data(
                training_data, 
                model_type
            )
            
            if not validation_result['valid']:
                return {
                    'success': False,
                    'errors': validation_result['errors']
                }
            
            # Start MLflow run
            with mlflow.start_run(run_name=f"{model_type}_training_{datetime.now().isoformat()}"):
                # Log parameters
                if parameters:
                    mlflow.log_params(parameters)
                
                # Train model based on type
                if model_type == 'performance_predictor':
                    result = await self._train_performance_predictor(training_data, parameters)
                elif model_type == 'budget_optimizer':
                    result = await self._train_budget_optimizer(training_data, parameters)
                elif model_type == 'audience_segmenter':
                    result = await self._train_audience_segmenter(training_data, parameters)
                elif model_type == 'anomaly_detector':
                    result = await self._train_anomaly_detector(training_data, parameters)
                else:
                    return {
                        'success': False,
                        'error': f'Unknown model type: {model_type}'
                    }
                
                # Log metrics
                if result['success']:
                    mlflow.log_metrics(result.get('metrics', {}))
                    
                    # Save model
                    model_path = await self.model_manager.save_model(
                        result['model'],
                        model_type,
                        result.get('version')
                    )
                    
                    result['model_path'] = model_path
                
                return result
                
        except Exception as e:
            logger.error(f"Training failed for {model_type}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _train_performance_predictor(self,
                                         training_data: pd.DataFrame,
                                         parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Train performance prediction model"""
        
        # Initialize model
        config = self.config['models']['performance_predictor']
        if parameters:
            config.update(parameters)
            
        predictor = PerformancePredictor(config)
        
        # Train in executor
        loop = asyncio.get_event_loop()
        
        def train():
            # Group by campaign for training
            campaign_groups = training_data.groupby('campaign_id')
            
            models_trained = 0
            all_metrics = []
            
            for campaign_id, campaign_data in campaign_groups:
                if len(campaign_data) < 30:  # Need minimum data
                    continue
                    
                # Train model
                predictor.train(campaign_data, target_metric='conversions')
                models_trained += 1
                
                # Evaluate on last 20% of data
                split_idx = int(len(campaign_data) * 0.8)
                train_data = campaign_data.iloc[:split_idx]
                test_data = campaign_data.iloc[split_idx:]
                
                # Make predictions
                predictions = predictor.predict(
                    train_data, 
                    target_metric='conversions',
                    horizon_days=len(test_data)
                )
                
                if 'ensemble' in predictions:
                    # Calculate metrics
                    y_true = test_data['conversions'].values
                    y_pred = predictions['ensemble']['predictions'][:len(y_true)]
                    
                    metrics = predictor.evaluate(y_true, y_pred)
                    all_metrics.append(metrics)
            
            # Average metrics
            if all_metrics:
                avg_metrics = {
                    key: np.mean([m[key] for m in all_metrics])
                    for key in all_metrics[0].keys()
                }
            else:
                avg_metrics = {}
            
            return {
                'models_trained': models_trained,
                'metrics': avg_metrics,
                'model': predictor
            }
        
        result = await loop.run_in_executor(self.executor, train)
        
        return {
            'success': True,
            'model': result['model'],
            'metrics': result['metrics'],
            'models_trained': result['models_trained'],
            'version': datetime.now().strftime('%Y%m%d_%H%M%S')
        }
    
    async def _train_budget_optimizer(self,
                                    training_data: pd.DataFrame,
                                    parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Train budget optimization model"""
        
        # Initialize model
        config = self.config['models']['budget_optimizer']
        if parameters:
            config.update(parameters)
            
        optimizer = BudgetOptimizer(config)
        
        # Prepare campaign performance data
        campaign_performance = training_data.groupby('campaign_id').agg({
            'spend': 'sum',
            'clicks': 'sum',
            'conversions': 'sum',
            'revenue': 'sum',
            'date': ['min', 'max']
        }).reset_index()
        
        # Calculate days active
        campaign_performance['days_active'] = (
            campaign_performance[('date', 'max')] - campaign_performance[('date', 'min')]
        ).dt.days + 1
        
        # Flatten column names
        campaign_performance.columns = [
            f'{col[0]}_{col[1]}' if col[1] else col[0] 
            for col in campaign_performance.columns
        ]
        
        # No training needed for optimization algorithms
        # But we can validate the optimizer works
        
        test_budget = campaign_performance['spend_sum'].sum()
        
        result = optimizer.optimize_budget(
            campaign_performance.to_dict('records'),
            test_budget,
            objective='conversions'
        )
        
        return {
            'success': True,
            'model': optimizer,
            'metrics': {
                'test_optimization_success': result['success'],
                'campaigns_optimized': len(campaign_performance)
            },
            'version': datetime.now().strftime('%Y%m%d_%H%M%S')
        }
    
    async def _train_audience_segmenter(self,
                                      training_data: pd.DataFrame,
                                      parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Train audience segmentation model"""
        
        # Initialize model
        config = self.config['models']['audience_segmenter']
        if parameters:
            config.update(parameters)
            
        segmenter = AudienceSegmenter(config)
        
        # Segment audience
        result = segmenter.segment_audience(training_data)
        
        if result['success']:
            return {
                'success': True,
                'model': segmenter,
                'metrics': result['metrics'],
                'n_segments': result['n_segments'],
                'version': datetime.now().strftime('%Y%m%d_%H%M%S')
            }
        else:
            return {
                'success': False,
                'error': result.get('message', 'Segmentation failed')
            }
    
    async def _train_anomaly_detector(self,
                                    training_data: pd.DataFrame,
                                    parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Train anomaly detection model"""
        
        # Initialize model
        config = self.config['models']['anomaly_detector']
        if parameters:
            config.update(parameters)
            
        detector = AnomalyDetector(config)
        
        # Detect anomalies
        result = detector.detect_anomalies(training_data)
        
        if result['success']:
            return {
                'success': True,
                'model': detector,
                'metrics': {
                    'total_anomalies': result['total_anomalies'],
                    'anomaly_rate': result['total_anomalies'] / len(training_data)
                },
                'version': datetime.now().strftime('%Y%m%d_%H%M%S')
            }
        else:
            return {
                'success': False,
                'error': result.get('message', 'Anomaly detection failed')
            }
    
    async def schedule_training(self,
                              model_type: str,
                              schedule: str,
                              data_source: Dict[str, Any]) -> Dict[str, Any]:
        """Schedule periodic model training"""
        
        # This would integrate with a task scheduler like Celery
        # For now, return scheduling configuration
        
        return {
            'success': True,
            'scheduled': {
                'model_type': model_type,
                'schedule': schedule,
                'data_source': data_source,
                'next_run': datetime.now() + timedelta(hours=24)
            }
        }
    
    async def get_training_history(self,
                                 model_type: Optional[str] = None,
                                 limit: int = 10) -> List[Dict[str, Any]]:
        """Get training history from MLflow"""
        
        experiment = mlflow.get_experiment_by_name(
            self.config.get('mlflow', {}).get('experiment_name', 'admetrics_models')
        )
        
        if not experiment:
            return []
        
        # Get runs
        runs = mlflow.search_runs(
            experiment_ids=[experiment.experiment_id],
            order_by=["start_time DESC"],
            max_results=limit
        )
        
        history = []
        for _, run in runs.iterrows():
            if model_type and not run['tags.mlflow.runName'].startswith(model_type):
                continue
                
            history.append({
                'run_id': run['run_id'],
                'model_type': run['tags.mlflow.runName'].split('_')[0],
                'start_time': run['start_time'],
                'end_time': run['end_time'],
                'status': run['status'],
                'metrics': {
                    k.replace('metrics.', ''): v 
                    for k, v in run.items() 
                    if k.startswith('metrics.')
                },
                'parameters': {
                    k.replace('params.', ''): v 
                    for k, v in run.items() 
                    if k.startswith('params.')
                }
            })
        
        return history