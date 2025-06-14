#!/usr/bin/env python3
"""
Data validation utilities for AdMetrics AI Engine
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class DataValidator:
    """Validates input data for AI models"""
    
    def __init__(self):
        self.required_columns = {
            'campaign': ['campaign_id', 'date', 'impressions', 'clicks', 'spend'],
            'prediction': ['campaign_id', 'historical_data'],
            'optimization': ['campaign_ids', 'total_budget', 'optimization_goal'],
            'audience': ['user_attributes', 'interaction_data']
        }
        
        self.metric_ranges = {
            'impressions': (0, float('inf')),
            'clicks': (0, float('inf')),
            'spend': (0, float('inf')),
            'conversions': (0, float('inf')),
            'ctr': (0, 1),
            'cvr': (0, 1),
            'cpc': (0, float('inf')),
            'cpa': (0, float('inf')),
            'roas': (0, float('inf'))
        }
    
    def validate_campaign_data(self, data: pd.DataFrame) -> Tuple[bool, List[str]]:
        """Validate campaign data"""
        errors = []
        
        # Check required columns
        missing_cols = set(self.required_columns['campaign']) - set(data.columns)
        if missing_cols:
            errors.append(f"Missing required columns: {missing_cols}")
        
        # Check data types
        if 'date' in data.columns:
            try:
                pd.to_datetime(data['date'])
            except:
                errors.append("Invalid date format in 'date' column")
        
        # Check numeric columns
        numeric_cols = ['impressions', 'clicks', 'spend', 'conversions']
        for col in numeric_cols:
            if col in data.columns:
                if not pd.api.types.is_numeric_dtype(data[col]):
                    errors.append(f"Column '{col}' must be numeric")
                elif data[col].min() < 0:
                    errors.append(f"Column '{col}' contains negative values")
        
        # Check data consistency
        if 'clicks' in data.columns and 'impressions' in data.columns:
            invalid_rows = data[data['clicks'] > data['impressions']]
            if not invalid_rows.empty:
                errors.append(f"Found {len(invalid_rows)} rows where clicks > impressions")
        
        # Check for missing values
        if data.isnull().any().any():
            null_counts = data.isnull().sum()
            null_cols = null_counts[null_counts > 0]
            errors.append(f"Missing values found: {null_cols.to_dict()}")
        
        is_valid = len(errors) == 0
        return is_valid, errors
    
    def validate_prediction_input(self, data: Dict[str, Any]) -> bool:
        """Validate prediction API input"""
        required_fields = ['campaign_id']
        
        for field in required_fields:
            if field not in data:
                logger.error(f"Missing required field: {field}")
                return False
        
        # Validate campaign_id format
        if not isinstance(data['campaign_id'], str) or not data['campaign_id']:
            logger.error("Invalid campaign_id format")
            return False
        
        # Validate prediction_days if present
        if 'prediction_days' in data:
            if not isinstance(data['prediction_days'], int) or data['prediction_days'] < 1:
                logger.error("prediction_days must be a positive integer")
                return False
        
        return True
    
    def validate_optimization_input(self, data: Dict[str, Any]) -> bool:
        """Validate optimization API input"""
        required_fields = ['total_budget', 'campaign_ids']
        
        for field in required_fields:
            if field not in data:
                logger.error(f"Missing required field: {field}")
                return False
        
        # Validate total_budget
        if not isinstance(data['total_budget'], (int, float)) or data['total_budget'] <= 0:
            logger.error("total_budget must be a positive number")
            return False
        
        # Validate campaign_ids
        if not isinstance(data['campaign_ids'], list) or len(data['campaign_ids']) == 0:
            logger.error("campaign_ids must be a non-empty list")
            return False
        
        # Validate optimization_goal if present
        valid_goals = ['conversions', 'clicks', 'impressions', 'roas']
        if 'optimization_goal' in data:
            if data['optimization_goal'] not in valid_goals:
                logger.error(f"Invalid optimization_goal. Must be one of: {valid_goals}")
                return False
        
        return True
    
    def clean_campaign_data(self, data: pd.DataFrame) -> pd.DataFrame:
        """Clean and preprocess campaign data"""
        df = data.copy()
        
        # Convert date column
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
        
        # Handle missing values
        numeric_cols = ['impressions', 'clicks', 'spend', 'conversions']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                df[col] = df[col].fillna(0)
        
        # Remove duplicate entries
        if 'campaign_id' in df.columns and 'date' in df.columns:
            df = df.drop_duplicates(subset=['campaign_id', 'date'], keep='last')
        
        # Sort by date
        if 'date' in df.columns:
            df = df.sort_values('date')
        
        # Calculate derived metrics
        if 'clicks' in df.columns and 'impressions' in df.columns:
            df['ctr'] = df.apply(
                lambda row: row['clicks'] / row['impressions'] if row['impressions'] > 0 else 0,
                axis=1
            )
        
        if 'conversions' in df.columns and 'clicks' in df.columns:
            df['cvr'] = df.apply(
                lambda row: row['conversions'] / row['clicks'] if row['clicks'] > 0 else 0,
                axis=1
            )
        
        if 'spend' in df.columns and 'clicks' in df.columns:
            df['cpc'] = df.apply(
                lambda row: row['spend'] / row['clicks'] if row['clicks'] > 0 else 0,
                axis=1
            )
        
        if 'spend' in df.columns and 'conversions' in df.columns:
            df['cpa'] = df.apply(
                lambda row: row['spend'] / row['conversions'] if row['conversions'] > 0 else 0,
                axis=1
            )
        
        return df
    
    def validate_time_series_data(self, data: pd.DataFrame, date_col: str = 'date') -> Tuple[bool, List[str]]:
        """Validate time series data for forecasting"""
        errors = []
        
        if date_col not in data.columns:
            errors.append(f"Date column '{date_col}' not found")
            return False, errors
        
        # Convert to datetime
        try:
            dates = pd.to_datetime(data[date_col])
        except:
            errors.append("Invalid date format")
            return False, errors
        
        # Check for duplicate dates
        if dates.duplicated().any():
            errors.append("Duplicate dates found")
        
        # Check for gaps in time series
        date_range = pd.date_range(start=dates.min(), end=dates.max(), freq='D')
        missing_dates = set(date_range) - set(dates)
        if missing_dates:
            errors.append(f"Missing {len(missing_dates)} dates in time series")
        
        # Check minimum data points
        if len(data) < 7:
            errors.append("Insufficient data points (minimum 7 required)")
        
        is_valid = len(errors) == 0
        return is_valid, errors
    
    def validate_audience_data(self, data: List[Dict]) -> Tuple[bool, List[str]]:
        """Validate audience segmentation data"""
        errors = []
        
        if not isinstance(data, list) or len(data) == 0:
            errors.append("Audience data must be a non-empty list")
            return False, errors
        
        required_fields = ['user_id', 'attributes']
        
        for i, record in enumerate(data):
            for field in required_fields:
                if field not in record:
                    errors.append(f"Record {i}: Missing required field '{field}'")
            
            if 'attributes' in record and not isinstance(record['attributes'], dict):
                errors.append(f"Record {i}: 'attributes' must be a dictionary")
        
        is_valid = len(errors) == 0
        return is_valid, errors
    
    def validate_metrics_range(self, metrics: Dict[str, float]) -> Tuple[bool, List[str]]:
        """Validate if metrics are within expected ranges"""
        errors = []
        
        for metric, value in metrics.items():
            if metric in self.metric_ranges:
                min_val, max_val = self.metric_ranges[metric]
                if not (min_val <= value <= max_val):
                    errors.append(f"{metric} value {value} is out of range [{min_val}, {max_val}]")
        
        is_valid = len(errors) == 0
        return is_valid, errors
    
    def detect_outliers(self, data: pd.DataFrame, column: str, method: str = 'iqr') -> np.ndarray:
        """Detect outliers in a column"""
        if column not in data.columns:
            return np.array([])
        
        values = data[column].values
        
        if method == 'iqr':
            Q1 = np.percentile(values, 25)
            Q3 = np.percentile(values, 75)
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            outliers = (values < lower_bound) | (values > upper_bound)
        elif method == 'zscore':
            from scipy import stats
            z_scores = np.abs(stats.zscore(values))
            outliers = z_scores > 3
        else:
            outliers = np.zeros(len(values), dtype=bool)
        
        return outliers