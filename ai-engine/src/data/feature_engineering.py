#!/usr/bin/env python3
"""
Feature engineering utilities for AdMetrics AI Engine
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import logging
from sklearn.preprocessing import StandardScaler, MinMaxScaler, LabelEncoder
from sklearn.feature_extraction.text import TfidfVectorizer

logger = logging.getLogger(__name__)


class FeatureEngineer:
    """Feature engineering for campaign data"""
    
    def __init__(self):
        self.scalers = {}
        self.encoders = {}
        self.tfidf_vectorizers = {}
    
    def create_time_features(self, df: pd.DataFrame, date_col: str = 'date') -> pd.DataFrame:
        """Create time-based features"""
        if date_col not in df.columns:
            logger.warning(f"Date column '{date_col}' not found")
            return df
        
        df = df.copy()
        df[date_col] = pd.to_datetime(df[date_col])
        
        # Basic time features
        df['year'] = df[date_col].dt.year
        df['month'] = df[date_col].dt.month
        df['day'] = df[date_col].dt.day
        df['day_of_week'] = df[date_col].dt.dayofweek
        df['day_of_year'] = df[date_col].dt.dayofyear
        df['week_of_year'] = df[date_col].dt.isocalendar().week
        df['quarter'] = df[date_col].dt.quarter
        df['is_weekend'] = df[date_col].dt.dayofweek.isin([5, 6]).astype(int)
        df['is_month_start'] = df[date_col].dt.is_month_start.astype(int)
        df['is_month_end'] = df[date_col].dt.is_month_end.astype(int)
        df['is_quarter_start'] = df[date_col].dt.is_quarter_start.astype(int)
        df['is_quarter_end'] = df[date_col].dt.is_quarter_end.astype(int)
        
        # Hour features if timestamp includes time
        if df[date_col].dt.hour.nunique() > 1:
            df['hour'] = df[date_col].dt.hour
            df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
            df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
        
        # Cyclical encoding for periodic features
        df['day_sin'] = np.sin(2 * np.pi * df['day'] / 31)
        df['day_cos'] = np.cos(2 * np.pi * df['day'] / 31)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        df['dayofweek_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
        df['dayofweek_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
        
        # Holiday features (US holidays as example)
        df['is_holiday'] = self._is_holiday(df[date_col])
        df['days_to_holiday'] = self._days_to_nearest_holiday(df[date_col])
        
        return df
    
    def create_lag_features(self, df: pd.DataFrame, columns: List[str], 
                          lags: List[int] = [1, 7, 14, 30]) -> pd.DataFrame:
        """Create lag features for specified columns"""
        df = df.copy()
        
        for col in columns:
            if col not in df.columns:
                continue
            
            for lag in lags:
                df[f'{col}_lag_{lag}'] = df[col].shift(lag)
                
                # Moving averages
                df[f'{col}_ma_{lag}'] = df[col].rolling(window=lag, min_periods=1).mean()
                df[f'{col}_ma_std_{lag}'] = df[col].rolling(window=lag, min_periods=1).std()
                
                # Difference features
                df[f'{col}_diff_{lag}'] = df[col] - df[col].shift(lag)
                
                # Percentage change
                df[f'{col}_pct_change_{lag}'] = df[col].pct_change(lag)
        
        return df
    
    def create_interaction_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create interaction features between metrics"""
        df = df.copy()
        
        # CTR (Click-through Rate)
        if 'clicks' in df.columns and 'impressions' in df.columns:
            df['ctr'] = df.apply(
                lambda row: row['clicks'] / row['impressions'] if row['impressions'] > 0 else 0,
                axis=1
            )
        
        # CVR (Conversion Rate)
        if 'conversions' in df.columns and 'clicks' in df.columns:
            df['cvr'] = df.apply(
                lambda row: row['conversions'] / row['clicks'] if row['clicks'] > 0 else 0,
                axis=1
            )
        
        # CPC (Cost Per Click)
        if 'spend' in df.columns and 'clicks' in df.columns:
            df['cpc'] = df.apply(
                lambda row: row['spend'] / row['clicks'] if row['clicks'] > 0 else 0,
                axis=1
            )
        
        # CPA (Cost Per Acquisition)
        if 'spend' in df.columns and 'conversions' in df.columns:
            df['cpa'] = df.apply(
                lambda row: row['spend'] / row['conversions'] if row['conversions'] > 0 else 0,
                axis=1
            )
        
        # ROAS (Return on Ad Spend)
        if 'revenue' in df.columns and 'spend' in df.columns:
            df['roas'] = df.apply(
                lambda row: row['revenue'] / row['spend'] if row['spend'] > 0 else 0,
                axis=1
            )
        
        # CPM (Cost Per Mille)
        if 'spend' in df.columns and 'impressions' in df.columns:
            df['cpm'] = df.apply(
                lambda row: (row['spend'] / row['impressions']) * 1000 if row['impressions'] > 0 else 0,
                axis=1
            )
        
        # Engagement Rate
        if 'engagements' in df.columns and 'impressions' in df.columns:
            df['engagement_rate'] = df.apply(
                lambda row: row['engagements'] / row['impressions'] if row['impressions'] > 0 else 0,
                axis=1
            )
        
        # Quality Score approximation
        if all(col in df.columns for col in ['ctr', 'cvr', 'spend']):
            df['quality_score'] = (
                df['ctr'] * 0.4 + 
                df['cvr'] * 0.4 + 
                (1 / (df['spend'] + 1)) * 0.2
            )
        
        return df
    
    def create_aggregation_features(self, df: pd.DataFrame, 
                                  group_cols: List[str],
                                  agg_cols: List[str],
                                  agg_funcs: List[str] = ['mean', 'sum', 'std']) -> pd.DataFrame:
        """Create aggregation features"""
        df = df.copy()
        
        for group_col in group_cols:
            if group_col not in df.columns:
                continue
            
            for agg_col in agg_cols:
                if agg_col not in df.columns:
                    continue
                
                for func in agg_funcs:
                    feature_name = f'{agg_col}_{func}_by_{group_col}'
                    agg_df = df.groupby(group_col)[agg_col].agg(func).reset_index()
                    agg_df.columns = [group_col, feature_name]
                    df = df.merge(agg_df, on=group_col, how='left')
        
        return df
    
    def create_trend_features(self, df: pd.DataFrame, columns: List[str], 
                            windows: List[int] = [7, 14, 30]) -> pd.DataFrame:
        """Create trend features"""
        df = df.copy()
        
        for col in columns:
            if col not in df.columns:
                continue
            
            for window in windows:
                # Trend slope
                df[f'{col}_trend_{window}'] = df[col].rolling(window=window).apply(
                    lambda x: np.polyfit(np.arange(len(x)), x, 1)[0] if len(x) > 1 else 0
                )
                
                # Volatility
                df[f'{col}_volatility_{window}'] = df[col].rolling(window=window).std()
                
                # Min/Max in window
                df[f'{col}_min_{window}'] = df[col].rolling(window=window).min()
                df[f'{col}_max_{window}'] = df[col].rolling(window=window).max()
                
                # Position in range
                df[f'{col}_range_position_{window}'] = (
                    (df[col] - df[f'{col}_min_{window}']) / 
                    (df[f'{col}_max_{window}'] - df[f'{col}_min_{window}'] + 1e-6)
                )
        
        return df
    
    def encode_categorical_features(self, df: pd.DataFrame, 
                                  categorical_cols: List[str],
                                  method: str = 'label') -> pd.DataFrame:
        """Encode categorical features"""
        df = df.copy()
        
        for col in categorical_cols:
            if col not in df.columns:
                continue
            
            if method == 'label':
                if col not in self.encoders:
                    self.encoders[col] = LabelEncoder()
                    df[f'{col}_encoded'] = self.encoders[col].fit_transform(df[col].fillna('missing'))
                else:
                    df[f'{col}_encoded'] = self.encoders[col].transform(df[col].fillna('missing'))
            
            elif method == 'onehot':
                dummies = pd.get_dummies(df[col], prefix=col, dummy_na=True)
                df = pd.concat([df, dummies], axis=1)
            
            elif method == 'target':
                # Target encoding (requires target variable)
                pass
        
        return df
    
    def scale_features(self, df: pd.DataFrame, 
                      columns: List[str],
                      method: str = 'standard') -> pd.DataFrame:
        """Scale numerical features"""
        df = df.copy()
        
        for col in columns:
            if col not in df.columns:
                continue
            
            if method == 'standard':
                if col not in self.scalers:
                    self.scalers[col] = StandardScaler()
                    df[f'{col}_scaled'] = self.scalers[col].fit_transform(df[[col]])
                else:
                    df[f'{col}_scaled'] = self.scalers[col].transform(df[[col]])
            
            elif method == 'minmax':
                if col not in self.scalers:
                    self.scalers[col] = MinMaxScaler()
                    df[f'{col}_scaled'] = self.scalers[col].fit_transform(df[[col]])
                else:
                    df[f'{col}_scaled'] = self.scalers[col].transform(df[[col]])
            
            elif method == 'robust':
                # Robust scaling (less sensitive to outliers)
                median = df[col].median()
                mad = np.median(np.abs(df[col] - median))
                df[f'{col}_scaled'] = (df[col] - median) / (mad + 1e-6)
        
        return df
    
    def create_text_features(self, df: pd.DataFrame, text_cols: List[str]) -> pd.DataFrame:
        """Create features from text columns"""
        df = df.copy()
        
        for col in text_cols:
            if col not in df.columns:
                continue
            
            # Basic text statistics
            df[f'{col}_length'] = df[col].str.len()
            df[f'{col}_word_count'] = df[col].str.split().str.len()
            df[f'{col}_unique_words'] = df[col].str.split().apply(lambda x: len(set(x)) if x else 0)
            
            # TF-IDF features
            if col not in self.tfidf_vectorizers:
                self.tfidf_vectorizers[col] = TfidfVectorizer(max_features=50)
                tfidf_features = self.tfidf_vectorizers[col].fit_transform(df[col].fillna(''))
            else:
                tfidf_features = self.tfidf_vectorizers[col].transform(df[col].fillna(''))
            
            # Add top TF-IDF features
            feature_names = [f'{col}_tfidf_{i}' for i in range(tfidf_features.shape[1])]
            tfidf_df = pd.DataFrame(tfidf_features.toarray(), columns=feature_names, index=df.index)
            df = pd.concat([df, tfidf_df], axis=1)
        
        return df
    
    def _is_holiday(self, dates: pd.Series) -> pd.Series:
        """Check if dates are holidays (simplified US holidays)"""
        holidays = [
            # New Year's Day
            lambda d: (d.month == 1 and d.day == 1),
            # Independence Day
            lambda d: (d.month == 7 and d.day == 4),
            # Christmas
            lambda d: (d.month == 12 and d.day == 25),
            # Thanksgiving (4th Thursday of November)
            lambda d: (d.month == 11 and d.day > 21 and d.day < 29 and d.dayofweek == 3),
            # Black Friday
            lambda d: (d.month == 11 and d.day > 22 and d.day < 30 and d.dayofweek == 4),
            # Cyber Monday
            lambda d: (d.month == 11 and d.day > 24 and d.dayofweek == 0) or 
                     (d.month == 12 and d.day < 3 and d.dayofweek == 0)
        ]
        
        is_holiday = pd.Series(False, index=dates.index)
        for holiday_func in holidays:
            is_holiday |= dates.apply(holiday_func)
        
        return is_holiday.astype(int)
    
    def _days_to_nearest_holiday(self, dates: pd.Series) -> pd.Series:
        """Calculate days to nearest major holiday"""
        # Simplified implementation
        days_to_holiday = pd.Series(30, index=dates.index)  # Default to 30 days
        
        for idx, date in dates.items():
            # Check major shopping holidays
            if date.month == 11 and date.day < 25:  # Before Black Friday
                black_friday = datetime(date.year, 11, 25)  # Approximate
                days_to_holiday[idx] = (black_friday - date).days
            elif date.month == 12 and date.day < 25:  # Before Christmas
                christmas = datetime(date.year, 12, 25)
                days_to_holiday[idx] = (christmas - date).days
        
        return days_to_holiday
    
    def create_campaign_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create campaign-specific features"""
        df = df.copy()
        
        # Campaign age
        if 'campaign_start_date' in df.columns and 'date' in df.columns:
            df['campaign_age_days'] = (df['date'] - df['campaign_start_date']).dt.days
        
        # Campaign performance ratios
        if 'campaign_id' in df.columns:
            # Campaign average metrics
            campaign_means = df.groupby('campaign_id')[['ctr', 'cvr', 'cpc']].mean()
            campaign_means.columns = [f'campaign_avg_{col}' for col in campaign_means.columns]
            df = df.merge(campaign_means, left_on='campaign_id', right_index=True, how='left')
            
            # Performance relative to campaign average
            for metric in ['ctr', 'cvr', 'cpc']:
                if metric in df.columns and f'campaign_avg_{metric}' in df.columns:
                    df[f'{metric}_vs_campaign_avg'] = (
                        df[metric] / (df[f'campaign_avg_{metric}'] + 1e-6)
                    )
        
        return df