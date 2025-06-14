#!/usr/bin/env python3
"""
Anomaly detection model for campaign metrics
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple, Union
import logging
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

logger = logging.getLogger(__name__)


class AnomalyDetector:
    """Detect anomalies in campaign metrics and prevent fraud"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize anomaly detector"""
        self.config = config or self._get_default_config()
        self.models = {}
        self.scalers = {}
        self.thresholds = {}
        self.historical_data = {}
        
    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration"""
        return {
            'algorithm': 'isolation_forest',
            'contamination': 0.1,
            'n_estimators': 100,
            'max_samples': 'auto',
            'threshold_multiplier': 2.5,
            'min_samples': 30,
            'seasonality_period': 7,  # Weekly seasonality
            'metrics': ['clicks', 'impressions', 'spend', 'conversions', 'ctr', 'cpc'],
            'random_state': 42
        }
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return len(self.models) > 0
    
    def detect(self, metrics_data: pd.DataFrame, 
               metric_type: str = 'all') -> Dict[str, List[Dict[str, Any]]]:
        """Detect anomalies in metrics data"""
        try:
            if metrics_data.empty:
                return self._get_empty_result()
            
            # Prepare data
            prepared_data = self._prepare_data(metrics_data)
            
            # Detect anomalies for each metric
            anomalies = {
                'critical': [],
                'warning': [],
                'info': []
            }
            
            metrics_to_check = self.config['metrics'] if metric_type == 'all' else [metric_type]
            
            for metric in metrics_to_check:
                if metric not in prepared_data.columns:
                    continue
                
                metric_anomalies = self._detect_metric_anomalies(prepared_data, metric)
                
                # Classify anomalies by severity
                for anomaly in metric_anomalies:
                    severity = self._classify_anomaly_severity(anomaly)
                    anomalies[severity].append(anomaly)
            
            # Detect multi-metric anomalies
            multi_anomalies = self._detect_multi_metric_anomalies(prepared_data)
            anomalies['critical'].extend(multi_anomalies)
            
            # Detect fraud patterns
            fraud_anomalies = self._detect_fraud_patterns(prepared_data)
            anomalies['critical'].extend(fraud_anomalies)
            
            # Generate insights
            insights = self._generate_anomaly_insights(anomalies, prepared_data)
            
            return {
                'anomalies': anomalies,
                'total_anomalies': sum(len(v) for v in anomalies.values()),
                'insights': insights,
                'metrics_analyzed': list(metrics_to_check),
                'time_range': {
                    'start': prepared_data['date'].min().isoformat() if 'date' in prepared_data else None,
                    'end': prepared_data['date'].max().isoformat() if 'date' in prepared_data else None
                }
            }
            
        except Exception as e:
            logger.error(f"Error detecting anomalies: {e}")
            return self._get_error_result(str(e))
    
    def train_models(self, historical_data: pd.DataFrame):
        """Train anomaly detection models on historical data"""
        try:
            logger.info("Training anomaly detection models")
            
            # Prepare data
            prepared_data = self._prepare_data(historical_data)
            
            # Train model for each metric
            for metric in self.config['metrics']:
                if metric not in prepared_data.columns:
                    continue
                
                # Extract features for the metric
                features = self._extract_features_for_metric(prepared_data, metric)
                
                if len(features) < self.config['min_samples']:
                    logger.warning(f"Insufficient data for training {metric} model")
                    continue
                
                # Scale features
                scaler = StandardScaler()
                features_scaled = scaler.fit_transform(features)
                self.scalers[metric] = scaler
                
                # Train isolation forest
                model = IsolationForest(
                    n_estimators=self.config['n_estimators'],
                    max_samples=self.config['max_samples'],
                    contamination=self.config['contamination'],
                    random_state=self.config['random_state']
                )
                model.fit(features_scaled)
                self.models[metric] = model
                
                # Calculate thresholds
                self._calculate_thresholds(prepared_data, metric)
            
            # Store historical data for reference
            self.historical_data = prepared_data
            
            logger.info(f"Trained models for {len(self.models)} metrics")
            
        except Exception as e:
            logger.error(f"Error training anomaly detection models: {e}")
            raise
    
    def _prepare_data(self, data: pd.DataFrame) -> pd.DataFrame:
        """Prepare data for anomaly detection"""
        df = data.copy()
        
        # Ensure date column
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')
        
        # Fill missing values
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        df[numeric_columns] = df[numeric_columns].fillna(0)
        
        # Calculate derived metrics if not present
        if 'ctr' not in df.columns and all(col in df.columns for col in ['clicks', 'impressions']):
            df['ctr'] = np.where(df['impressions'] > 0, df['clicks'] / df['impressions'], 0)
        
        if 'cpc' not in df.columns and all(col in df.columns for col in ['spend', 'clicks']):
            df['cpc'] = np.where(df['clicks'] > 0, df['spend'] / df['clicks'], 0)
        
        if 'cvr' not in df.columns and all(col in df.columns for col in ['conversions', 'clicks']):
            df['cvr'] = np.where(df['clicks'] > 0, df['conversions'] / df['clicks'], 0)
        
        return df
    
    def _detect_metric_anomalies(self, data: pd.DataFrame, metric: str) -> List[Dict[str, Any]]:
        """Detect anomalies for a specific metric"""
        anomalies = []
        
        # Statistical anomaly detection