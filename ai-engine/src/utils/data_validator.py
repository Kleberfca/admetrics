#!/usr/bin/env python3
"""
Data validation utilities for ML pipelines
"""

import logging
from typing import Dict, List, Any, Optional, Tuple
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class DataValidator:
    """Validate data for ML models"""
    
    def __init__(self):
        self.required_columns = {
            'performance_predictor': [
                'date', 'campaign_id', 'impressions', 
                'clicks', 'conversions', 'spend'
            ],
            'budget_optimizer': [
                'campaign_id', 'spend', 'conversions', 
                'clicks', 'revenue'
            ],
            'audience_segmenter': [
                'user_id'  # At minimum
            ],
            'anomaly_detector': [
                'date', 'campaign_id'  # Plus at least one metric
            ]
        }
        
        self.metric_columns = [
            'impressions', 'clicks', 'conversions', 
            'spend', 'revenue', 'ctr', 'cvr', 'cpa', 'roas'
        ]
    
    def validate_training_data(self, 
                             df: pd.DataFrame, 
                             model_type: str) -> Dict[str, Any]:
        """Validate training data for specific model type"""
        
        errors = []
        warnings = []
        
        # Check if DataFrame is empty
        if df.empty:
            errors.append("DataFrame is empty")
            return {'valid': False, 'errors': errors, 'warnings': warnings}
        
        # Check required columns
        required = self.required_columns.get(model_type, [])
        missing_columns = set(required) - set(df.columns)
        
        if missing_columns:
            errors.append(f"Missing required columns: {missing_columns}")
        
        # Model-specific validation
        if model_type == 'performance_predictor':
            errors.extend(self._validate_time_series_data(df))
        elif model_type == 'budget_optimizer':
            errors.extend(self._validate_campaign_data(df))
        elif model_type == 'audience_segmenter':
            errors.extend(self._validate_audience_data(df))
        elif model_type == 'anomaly_detector':
            errors.extend(self._validate_anomaly_data(df))
        
        # Check for data quality issues
        quality_issues = self._check_data_quality(df)
        warnings.extend(quality_issues['warnings'])
        errors.extend(quality_issues['errors'])
        
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'statistics': self._get_data_statistics(df)
        }
    
    def _validate_time_series_data(self, df: pd.DataFrame) -> List[str]:
        """Validate time series data"""
        errors = []
        
        # Check date column
        if 'date' in df.columns:
            try:
                df['date'] = pd.to_datetime(df['date'])
            except:
                errors.append("Date column cannot be parsed as datetime")
                return errors
            
            # Check for gaps in time series
            date_range = pd.date_range(
                start=df['date'].min(), 
                end=df['date'].max(), 
                freq='D'
            )
            missing_dates = set(date_range) - set(df['date'])
            
            if len(missing_dates) > len(date_range) * 0.1:
                errors.append(f"Too many missing dates: {len(missing_dates)} gaps found")
            
            # Check if data is too old
            if df['date'].max() < datetime.now() - timedelta(days=30):
                errors.append("Data is too old (more than 30 days)")
        
        # Check minimum data points
        if len(df) < 30:
            errors.append("Insufficient data points for time series (minimum 30 required)")
        
        return errors
    
    def _validate_campaign_data(self, df: pd.DataFrame) -> List[str]:
        """Validate campaign data"""
        errors = []
        
        # Check for negative values
        numeric_columns = ['spend', 'clicks', 'conversions', 'revenue']
        for col in numeric_columns:
            if col in df.columns and (df[col] < 0).any():
                errors.append(f"Negative values found in {col}")
        
        # Check for logical inconsistencies
        if 'clicks' in df.columns and 'impressions' in df.columns:
            if (df['clicks'] > df['impressions']).any():
                errors.append("Clicks exceed impressions for some records")
        
        if 'conversions' in df.columns and 'clicks' in df.columns:
            if (df['conversions'] > df['clicks']).any():
                errors.append("Conversions exceed clicks for some records")
        
        return errors
    
    def _validate_audience_data(self, df: pd.DataFrame) -> List[str]:
        """Validate audience data"""
        errors = []
        
        # Check for user identification
        if 'user_id' not in df.columns and 'email' not in df.columns:
            errors.append("No user identification column found (user_id or email)")
        
        # Check minimum audience size
        if len(df) < 100:
            errors.append("Audience too small for segmentation (minimum 100 users)")
        
        return errors
    
    def _validate_anomaly_data(self, df: pd.DataFrame) -> List[str]:
        """Validate anomaly detection data"""
        errors = []
        
        # Need at least one metric column
        metric_cols = [col for col in self.metric_columns if col in df.columns]
        if not metric_cols:
            errors.append("No metric columns found for anomaly detection")
        
        # Check for sufficient variation
        for col in metric_cols:
            if df[col].std() == 0:
                errors.append(f"No variation in {col} - cannot detect anomalies")
        
        return errors
    
    def _check_data_quality(self, df: pd.DataFrame) -> Dict[str, List[str]]:
        """Check general data quality issues"""
        errors = []
        warnings = []
        
        # Check for missing values
        missing_percentages = (df.isnull().sum() / len(df)) * 100
        high_missing = missing_percentages[missing_percentages > 50]
        
        if not high_missing.empty:
            for col, pct in high_missing.items():
                warnings.append(f"Column {col} has {pct:.1f}% missing values")
        
        # Check for duplicate rows
        duplicate_count = df.duplicated().sum()
        if duplicate_count > 0:
            warnings.append(f"Found {duplicate_count} duplicate rows")
        
        # Check for outliers in numeric columns
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_columns:
            if col in df.columns:
                q1 = df[col].quantile(0.25)
                q3 = df[col].quantile(0.75)
                iqr = q3 - q1
                
                outliers = ((df[col] < (q1 - 3 * iqr)) | (df[col] > (q3 + 3 * iqr))).sum()
                
                if outliers > len(df) * 0.05:
                    warnings.append(f"Column {col} has {outliers} potential outliers")
        
        # Check for constant columns
        for col in df.columns:
            if df[col].nunique() == 1:
                warnings.append(f"Column {col} has constant value")
        
        return {'errors': errors, 'warnings': warnings}
    
    def _get_data_statistics(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Get basic statistics about the data"""
        stats = {
            'row_count': len(df),
            'column_count': len(df.columns),
            'memory_usage': df.memory_usage(deep=True).sum() / 1024 / 1024,  # MB
            'dtypes': df.dtypes.value_counts().to_dict()
        }
        
        # Date range if available
        if 'date' in df.columns:
            try:
                dates = pd.to_datetime(df['date'])
                stats['date_range'] = {
                    'start': dates.min().isoformat(),
                    'end': dates.max().isoformat(),
                    'days': (dates.max() - dates.min()).days
                }
            except:
                pass
        
        # Numeric column statistics
        numeric_stats = {}
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_columns[:10]:  # Limit to first 10
            numeric_stats[col] = {
                'mean': float(df[col].mean()),
                'std': float(df[col].std()),
                'min': float(df[col].min()),
                'max': float(df[col].max()),
                'nulls': int(df[col].isnull().sum())
            }
        
        stats['numeric_columns'] = numeric_stats
        
        return stats
    
    def validate_prediction_input(self, 
                                input_data: Dict[str, Any], 
                                model_type: str) -> Tuple[bool, List[str]]:
        """Validate input for prediction"""
        errors = []
        
        # Check required fields based on model type
        if model_type == 'performance_predictor':
            required = ['campaign_id', 'historical_data']
            if 'historical_data' in input_data:
                if len(input_data['historical_data']) < 7:
                    errors.append("Need at least 7 days of historical data")
                    
        elif model_type == 'budget_optimizer':
            required = ['campaigns', 'total_budget']
            if 'total_budget' in input_data and input_data['total_budget'] <= 0:
                errors.append("Total budget must be positive")
                
        elif model_type == 'audience_segmenter':
            required = ['audience_data']
            
        elif model_type == 'anomaly_detector':
            required = ['metrics_data']
        
        # Check for required fields
        missing = [field for field in required if field not in input_data]
        if missing:
            errors.append(f"Missing required fields: {missing}")
        
        return len(errors) == 0, errors