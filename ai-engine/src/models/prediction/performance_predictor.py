#!/usr/bin/env python3
"""
Performance prediction models for AdMetrics
Combines Prophet, LSTM, and LightGBM for ensemble predictions
"""

import logging
from typing import Dict, List, Any, Optional, Tuple
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from prophet import Prophet
import lightgbm as lgb
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import TimeSeriesSplit
import joblib
import warnings

warnings.filterwarnings('ignore')
logger = logging.getLogger(__name__)


class PerformancePredictor:
    """Ensemble model for campaign performance prediction"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.models = {}
        self.scalers = {}
        self.feature_columns = []
        self.lookback_days = config.get('lookback_days', 90)
        self.prediction_horizons = config.get('prediction_horizons', [7, 14, 30])
        
    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for modeling"""
        df = df.copy()
        
        # Ensure datetime index
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
        
        # Add time-based features
        df['day_of_week'] = df.index.dayofweek
        df['day_of_month'] = df.index.day
        df['month'] = df.index.month
        df['quarter'] = df.index.quarter
        df['is_weekend'] = (df.index.dayofweek >= 5).astype(int)
        
        # Add lag features
        for col in ['spend', 'clicks', 'conversions', 'impressions']:
            if col in df.columns:
                for lag in [1, 7, 14, 30]:
                    df[f'{col}_lag_{lag}'] = df[col].shift(lag)
                    
                # Rolling statistics
                for window in [7, 14, 30]:
                    df[f'{col}_rolling_mean_{window}'] = df[col].rolling(window).mean()
                    df[f'{col}_rolling_std_{window}'] = df[col].rolling(window).std()
        
        # Calculate ratios
        if 'clicks' in df.columns and 'impressions' in df.columns:
            df['ctr'] = df['clicks'] / (df['impressions'] + 1e-6)
        
        if 'conversions' in df.columns and 'clicks' in df.columns:
            df['cvr'] = df['conversions'] / (df['clicks'] + 1e-6)
        
        if 'spend' in df.columns and 'conversions' in df.columns:
            df['cpa'] = df['spend'] / (df['conversions'] + 1e-6)
        
        # Drop rows with NaN values from lag features
        df.dropna(inplace=True)
        
        return df
    
    def train_prophet(self, df: pd.DataFrame, target_column: str) -> Prophet:
        """Train Prophet model"""
        # Prepare data for Prophet
        prophet_df = pd.DataFrame({
            'ds': df.index,
            'y': df[target_column]
        })
        
        # Add regressors if available
        regressor_columns = ['spend', 'is_weekend']
        for col in regressor_columns:
            if col in df.columns and col != target_column:
                prophet_df[col] = df[col].values
        
        # Initialize and configure Prophet
        model = Prophet(
            daily_seasonality=True,
            weekly_seasonality=True,
            yearly_seasonality=True,
            changepoint_prior_scale=0.05,
            seasonality_prior_scale=10.0
        )
        
        # Add regressors
        for col in regressor_columns:
            if col in prophet_df.columns:
                model.add_regressor(col)
        
        # Fit the model
        model.fit(prophet_df)
        
        return model
    
    def train_lightgbm(self, 
                      X_train: pd.DataFrame, 
                      y_train: pd.Series,
                      X_val: Optional[pd.DataFrame] = None,
                      y_val: Optional[pd.Series] = None) -> lgb.LGBMRegressor:
        """Train LightGBM model"""
        params = {
            'objective': 'regression',
            'metric': 'rmse',
            'boosting_type': 'gbdt',
            'num_leaves': 31,
            'learning_rate': 0.05,
            'feature_fraction': 0.9,
            'bagging_fraction': 0.8,
            'bagging_freq': 5,
            'verbose': -1,
            'random_state': 42
        }
        
        model = lgb.LGBMRegressor(**params)
        
        eval_set = [(X_val, y_val)] if X_val is not None and y_val is not None else None
        
        model.fit(
            X_train, y_train,
            eval_set=eval_set,
            eval_metric='rmse',
            callbacks=[lgb.early_stopping(50), lgb.log_evaluation(0)]
        )
        
        return model
    
    def train(self, campaign_data: pd.DataFrame, target_metric: str = 'conversions'):
        """Train ensemble model"""
        logger.info(f"Training performance predictor for {target_metric}")
        
        # Prepare features
        df = self.prepare_features(campaign_data)
        
        # Store feature columns
        self.feature_columns = [col for col in df.columns 
                               if col not in ['conversions', 'revenue', 'clicks', 'impressions']]
        
        # Train Prophet
        logger.info("Training Prophet model...")
        self.models[f'prophet_{target_metric}'] = self.train_prophet(df, target_metric)
        
        # Prepare data for LightGBM
        feature_cols = [col for col in self.feature_columns if col != target_metric]
        X = df[feature_cols]
        y = df[target_metric]
        
        # Scale features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        self.scalers[target_metric] = scaler
        
        # Time series split
        tscv = TimeSeriesSplit(n_splits=3)
        
        for train_idx, val_idx in tscv.split(X_scaled):
            X_train, X_val = X_scaled[train_idx], X_scaled[val_idx]
            y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]
        
        # Train LightGBM
        logger.info("Training LightGBM model...")
        self.models[f'lgb_{target_metric}'] = self.train_lightgbm(
            pd.DataFrame(X_train, columns=feature_cols),
            y_train,
            pd.DataFrame(X_val, columns=feature_cols),
            y_val
        )
        
        logger.info("Model training completed")
    
    def predict(self, 
                campaign_data: pd.DataFrame,
                target_metric: str = 'conversions',
                horizon_days: int = 30) -> Dict[str, Any]:
        """Generate predictions using ensemble"""
        
        # Prepare features
        df = self.prepare_features(campaign_data)
        
        predictions = {}
        
        # Prophet predictions
        if f'prophet_{target_metric}' in self.models:
            prophet_model = self.models[f'prophet_{target_metric}']
            
            # Create future dataframe
            future = prophet_model.make_future_dataframe(periods=horizon_days)
            
            # Add regressors
            for col in ['spend', 'is_weekend']:
                if col in df.columns:
                    # Simple forward fill for demo
                    future[col] = df[col].reindex(future.index).fillna(method='ffill').fillna(0)
            
            prophet_forecast = prophet_model.predict(future)
            predictions['prophet'] = prophet_forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail(horizon_days)
        
        # LightGBM predictions
        if f'lgb_{target_metric}' in self.models and target_metric in self.scalers:
            lgb_model = self.models[f'lgb_{target_metric}']
            scaler = self.scalers[target_metric]
            
            # For demo, use last known features
            feature_cols = [col for col in self.feature_columns if col != target_metric]
            last_features = df[feature_cols].iloc[-1:].values
            
            # Scale features
            last_features_scaled = scaler.transform(last_features)
            
            # Simple prediction (would need more sophisticated approach for multi-step)
            lgb_predictions = []
            for _ in range(horizon_days):
                pred = lgb_model.predict(last_features_scaled)[0]
                lgb_predictions.append(pred)
            
            predictions['lightgbm'] = lgb_predictions
        
        # Ensemble predictions (simple average)
        if 'prophet' in predictions and 'lightgbm' in predictions:
            prophet_preds = predictions['prophet']['yhat'].values
            lgb_preds = predictions['lightgbm']
            
            ensemble_preds = (prophet_preds + lgb_preds) / 2
            
            predictions['ensemble'] = {
                'dates': predictions['prophet']['ds'].tolist(),
                'predictions': ensemble_preds.tolist(),
                'lower_bound': predictions['prophet']['yhat_lower'].tolist(),
                'upper_bound': predictions['prophet']['yhat_upper'].tolist()
            }
        
        return predictions
    
    def evaluate(self, y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
        """Evaluate model performance"""
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
        
        return {
            'mae': mean_absolute_error(y_true, y_pred),
            'rmse': np.sqrt(mean_squared_error(y_true, y_pred)),
            'mape': np.mean(np.abs((y_true - y_pred) / (y_true + 1e-6))) * 100,
            'r2': r2_score(y_true, y_pred)
        }
    
    def save_model(self, path: str):
        """Save trained models"""
        model_data = {
            'models': self.models,
            'scalers': self.scalers,
            'feature_columns': self.feature_columns,
            'config': self.config
        }
        joblib.dump(model_data, path)
        logger.info(f"Model saved to {path}")
    
    def load_model(self, path: str):
        """Load trained models"""
        model_data = joblib.load(path)
        self.models = model_data['models']
        self.scalers = model_data['scalers']
        self.feature_columns = model_data['feature_columns']
        self.config = model_data['config']
        logger.info(f"Model loaded from {path}")