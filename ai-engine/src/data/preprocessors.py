#!/usr/bin/env python3
"""
Data preprocessing utilities for AdMetrics AI Engine
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime, timedelta
import logging
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler
from sklearn.impute import SimpleImputer, KNNImputer

logger = logging.getLogger(__name__)


class DataPreprocessor:
    """Preprocess data for AI models"""
    
    def __init__(self):
        self.scalers = {}
        self.imputers = {}
        self.column_stats = {}
        self.outlier_thresholds = {}
    
    def preprocess_campaign_data(self, df: pd.DataFrame, 
                               training: bool = True) -> pd.DataFrame:
        """Main preprocessing pipeline for campaign data"""
        logger.info(f"Preprocessing {len(df)} rows of campaign data")
        
        # Create copy to avoid modifying original
        df = df.copy()
        
        # 1. Handle data types
        df = self._fix_data_types(df)
        
        # 2. Handle missing values
        df = self._handle_missing_values(df, training)
        
        # 3. Remove duplicates
        df = self._remove_duplicates(df)
        
        # 4. Handle outliers
        df = self._handle_outliers(df, training)
        
        # 5. Normalize numerical features
        df = self._normalize_features(df, training)
        
        # 6. Handle categorical variables
        df = self._encode_categoricals(df)
        
        # 7. Create derived metrics
        df = self._create_derived_metrics(df)
        
        # 8. Sort by date
        if 'date' in df.columns:
            df = df.sort_values('date')
        
        logger.info(f"Preprocessing complete. Final shape: {df.shape}")
        return df
    
    def _fix_data_types(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fix data types for columns"""
        # Date columns
        date_columns = ['date', 'created_at', 'updated_at', 'start_date', 'end_date']
        for col in date_columns:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors='coerce')
        
        # Numeric columns
        numeric_columns = [
            'impressions', 'clicks', 'spend', 'conversions', 'revenue',
            'reach', 'frequency', 'video_views', 'engagements', 'leads'
        ]
        for col in numeric_columns:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # String columns
        string_columns = ['campaign_id', 'campaign_name', 'platform', 'status']
        for col in string_columns:
            if col in df.columns:
                df[col] = df[col].astype(str)
        
        return df
    
    def _handle_missing_values(self, df: pd.DataFrame, 
                             training: bool = True) -> pd.DataFrame:
        """Handle missing values with appropriate strategies"""
        # Strategy by column type
        strategies = {
            'impressions': 'zero',
            'clicks': 'zero',
            'spend': 'zero',
            'conversions': 'zero',
            'revenue': 'zero',
            'reach': 'forward_fill',
            'frequency': 'mean',
            'video_views': 'zero',
            'engagements': 'zero',
            'leads': 'zero',
            'ctr': 'calculate',
            'cvr': 'calculate',
            'cpc': 'calculate',
            'cpa': 'calculate',
            'roas': 'calculate'
        }
        
        for col, strategy in strategies.items():
            if col not in df.columns:
                continue
            
            if strategy == 'zero':
                df[col] = df[col].fillna(0)
            
            elif strategy == 'mean':
                if training:
                    self.column_stats[f'{col}_mean'] = df[col].mean()
                df[col] = df[col].fillna(self.column_stats.get(f'{col}_mean', 0))
            
            elif strategy == 'median':
                if training:
                    self.column_stats[f'{col}_median'] = df[col].median()
                df[col] = df[col].fillna(self.column_stats.get(f'{col}_median', 0))
            
            elif strategy == 'forward_fill':
                df[col] = df[col].fillna(method='ffill')
                df[col] = df[col].fillna(0)  # Fill remaining with 0
            
            elif strategy == 'calculate':
                # These will be recalculated
                pass
        
        # Handle missing categorical values
        categorical_cols = ['platform', 'status', 'campaign_name']
        for col in categorical_cols:
            if col in df.columns:
                df[col] = df[col].fillna('unknown')
        
        return df
    
    def _remove_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        """Remove duplicate records"""
        # Identify unique key columns
        key_columns = []
        if 'campaign_id' in df.columns:
            key_columns.append('campaign_id')
        if 'date' in df.columns:
            key_columns.append('date')
        if 'platform' in df.columns:
            key_columns.append('platform')
        
        if key_columns:
            initial_rows = len(df)
            df = df.drop_duplicates(subset=key_columns, keep='last')
            removed_rows = initial_rows - len(df)
            if removed_rows > 0:
                logger.warning(f"Removed {removed_rows} duplicate rows")
        
        return df
    
    def _handle_outliers(self, df: pd.DataFrame, 
                        training: bool = True,
                        method: str = 'clip') -> pd.DataFrame:
        """Handle outliers in numerical columns"""
        numerical_cols = [
            'impressions', 'clicks', 'spend', 'conversions',
            'ctr', 'cvr', 'cpc', 'cpa', 'roas'
        ]
        
        for col in numerical_cols:
            if col not in df.columns:
                continue
            
            if training:
                # Calculate thresholds
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR
                
                # Store thresholds
                self.outlier_thresholds[col] = {
                    'lower': lower_bound,
                    'upper': upper_bound
                }
            
            # Apply outlier handling
            if col in self.outlier_thresholds:
                bounds = self.outlier_thresholds[col]
                
                if method == 'clip':
                    df[col] = df[col].clip(
                        lower=max(0, bounds['lower']),  # Ensure non-negative
                        upper=bounds['upper']
                    )
                elif method == 'remove':
                    mask = (df[col] >= bounds['lower']) & (df[col] <= bounds['upper'])
                    df = df[mask]
                elif method == 'nan':
                    mask = (df[col] < bounds['lower']) | (df[col] > bounds['upper'])
                    df.loc[mask, col] = np.nan
        
        return df
    
    def _normalize_features(self, df: pd.DataFrame, 
                          training: bool = True,
                          method: str = 'standard') -> pd.DataFrame:
        """Normalize numerical features"""
        # Features to normalize
        normalize_cols = [
            'impressions', 'clicks', 'spend', 'conversions',
            'reach', 'frequency', 'video_views', 'engagements'
        ]
        
        for col in normalize_cols:
            if col not in df.columns:
                continue
            
            if training:
                if method == 'standard':
                    self.scalers[col] = StandardScaler()
                elif method == 'minmax':
                    self.scalers[col] = MinMaxScaler()
                elif method == 'robust':
                    self.scalers[col] = RobustScaler()
                
                # Fit and transform
                df[f'{col}_normalized'] = self.scalers[col].fit_transform(
                    df[[col]].values.reshape(-1, 1)
                )
            else:
                # Transform using existing scaler
                if col in self.scalers:
                    df[f'{col}_normalized'] = self.scalers[col].transform(
                        df[[col]].values.reshape(-1, 1)
                    )
        
        return df
    
    def _encode_categoricals(self, df: pd.DataFrame) -> pd.DataFrame:
        """Encode categorical variables"""
        # Platform encoding
        if 'platform' in df.columns:
            platform_mapping = {
                'GOOGLE_ADS': 0,
                'FACEBOOK_ADS': 1,
                'INSTAGRAM_ADS': 2,
                'TIKTOK_ADS': 3,
                'LINKEDIN_ADS': 4,
                'TWITTER_ADS': 5,
                'YOUTUBE_ADS': 6,
                'PINTEREST_ADS': 7,
                'SNAPCHAT_ADS': 8
            }
            df['platform_encoded'] = df['platform'].map(platform_mapping).fillna(9)
        
        # Status encoding
        if 'status' in df.columns:
            status_mapping = {
                'ACTIVE': 1,
                'PAUSED': 0,
                'COMPLETED': -1,
                'DRAFT': -2,
                'SCHEDULED': 2
            }
            df['status_encoded'] = df['status'].map(status_mapping).fillna(0)
        
        return df
    
    def _create_derived_metrics(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create derived metrics that may be missing"""
        # CTR (Click-through Rate)
        if 'clicks' in df.columns and 'impressions' in df.columns:
            df['ctr'] = np.where(
                df['impressions'] > 0,
                df['clicks'] / df['impressions'],
                0
            )
        
        # CVR (Conversion Rate)
        if 'conversions' in df.columns and 'clicks' in df.columns:
            df['cvr'] = np.where(
                df['clicks'] > 0,
                df['conversions'] / df['clicks'],
                0
            )
        
        # CPC (Cost Per Click)
        if 'spend' in df.columns and 'clicks' in df.columns:
            df['cpc'] = np.where(
                df['clicks'] > 0,
                df['spend'] / df['clicks'],
                0
            )
        
        # CPA (Cost Per Acquisition)
        if 'spend' in df.columns and 'conversions' in df.columns:
            df['cpa'] = np.where(
                df['conversions'] > 0,
                df['spend'] / df['conversions'],
                0
            )
        
        # CPM (Cost Per Mille)
        if 'spend' in df.columns and 'impressions' in df.columns:
            df['cpm'] = np.where(
                df['impressions'] > 0,
                (df['spend'] / df['impressions']) * 1000,
                0
            )
        
        # ROAS (Return on Ad Spend)
        if 'revenue' in df.columns and 'spend' in df.columns:
            df['roas'] = np.where(
                df['spend'] > 0,
                df['revenue'] / df['spend'],
                0
            )
        elif 'conversions' in df.columns and 'spend' in df.columns:
            # Assume $100 per conversion if revenue not available
            df['roas'] = np.where(
                df['spend'] > 0,
                (df['conversions'] * 100) / df['spend'],
                0
            )
        
        return df
    
    def preprocess_time_series(self, df: pd.DataFrame,
                             date_col: str = 'date',
                             value_col: str = 'spend') -> pd.DataFrame:
        """Preprocess data for time series analysis"""
        df = df.copy()
        
        # Ensure date column is datetime
        df[date_col] = pd.to_datetime(df[date_col])
        
        # Sort by date
        df = df.sort_values(date_col)
        
        # Handle missing dates by reindexing
        date_range = pd.date_range(
            start=df[date_col].min(),
            end=df[date_col].max(),
            freq='D'
        )
        
        df = df.set_index(date_col).reindex(date_range)
        
        # Forward fill missing values
        df[value_col] = df[value_col].fillna(method='ffill')
        
        # Handle remaining NaN values
        df[value_col] = df[value_col].fillna(0)
        
        # Reset index
        df = df.reset_index()
        df.rename(columns={'index': date_col}, inplace=True)
        
        return df
    
    def aggregate_by_time_period(self, df: pd.DataFrame,
                               period: str = 'D',
                               agg_func: str = 'sum') -> pd.DataFrame:
        """Aggregate data by time period"""
        df = df.copy()
        
        # Set date as index
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df = df.set_index('date')
        
        # Define aggregation functions
        agg_dict = {}
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_cols:
            if col in ['ctr', 'cvr', 'cpc', 'cpa', 'roas', 'frequency']:
                agg_dict[col] = 'mean'  # Average for rates
            else:
                agg_dict[col] = agg_func  # Sum for counts
        
        # Perform aggregation
        df_agg = df.resample(period).agg(agg_dict)
        
        # Recalculate derived metrics
        df_agg = self._create_derived_metrics(df_agg)
        
        return df_agg.reset_index()
    
    def prepare_for_training(self, df: pd.DataFrame,
                           target_col: str,
                           feature_cols: Optional[List[str]] = None) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare data for model training"""
        if feature_cols is None:
            # Use all numeric columns except target
            feature_cols = [col for col in df.select_dtypes(include=[np.number]).columns
                          if col != target_col]
        
        # Extract features and target
        X = df[feature_cols].values
        y = df[target_col].values
        
        # Handle any remaining NaN values
        X = np.nan_to_num(X, nan=0.0)
        y = np.nan_to_num(y, nan=0.0)
        
        return X, y