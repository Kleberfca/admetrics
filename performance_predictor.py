"""
Performance Predictor Model
This module implements time series forecasting for advertising campaign performance prediction.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import logging

# Machine Learning imports
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split, TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import lightgbm as lgb
from prophet import Prophet
import joblib

# Deep Learning imports
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

# Statistical imports
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.seasonal import seasonal_decompose
from statsmodels.tsa.stattools import adfuller

logger = logging.getLogger(__name__)

class PerformancePredictor:
    """
    Advanced time series forecasting model for advertising campaign performance.
    Supports multiple algorithms including Prophet, LSTM, ARIMA, and ensemble methods.
    """
    
    def __init__(self, model_type: str = 'ensemble'):
        """
        Initialize the Performance Predictor.
        
        Args:
            model_type: Type of model to use ('prophet', 'lstm', 'arima', 'ensemble')
        """
        self.model_type = model_type
        self.models = {}
        self.scalers = {}
        self.feature_importance = {}
        self.is_trained = False
        
        # Model configurations
        self.prophet_config = {
            'seasonality_mode': 'multiplicative',
            'yearly_seasonality': True,
            'weekly_seasonality': True,
            'daily_seasonality': False,
            'holidays_prior_scale': 10.0,
            'seasonality_prior_scale': 10.0,
            'changepoint_prior_scale': 0.05
        }
        
        self.lstm_config = {
            'sequence_length': 30,
            'lstm_units': [128, 64, 32],
            'dropout_rate': 0.3,
            'batch_size': 32,
            'epochs': 100,
            'learning_rate': 0.001
        }
        
        self.ensemble_weights = {
            'prophet': 0.3,
            'lstm': 0.35,
            'lightgbm': 0.25,
            'arima': 0.1
        }

    def prepare_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare features for time series forecasting.
        
        Args:
            data: DataFrame with time series data
            
        Returns:
            DataFrame with engineered features
        """
        df = data.copy()
        
        # Ensure datetime index
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
        
        # Basic time features
        df['year'] = df.index.year
        df['month'] = df.index.month
        df['day'] = df.index.day
        df['day_of_week'] = df.index.dayofweek
        df['week_of_year'] = df.index.week
        df['quarter'] = df.index.quarter
        
        # Cyclical features
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        df['day_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
        df['day_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
        
        # Weekend indicator
        df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
        
        # Month-end/start indicators
        df['is_month_start'] = df.index.is_month_start.astype(int)
        df['is_month_end'] = df.index.is_month_end.astype(int)
        
        # Lag features
        for metric in ['spend', 'clicks', 'conversions', 'impressions']:
            if metric in df.columns:
                for lag in [1, 3, 7, 14, 30]:
                    df[f'{metric}_lag_{lag}'] = df[metric].shift(lag)
                
                # Rolling statistics
                for window in [3, 7, 14, 30]:
                    df[f'{metric}_rolling_mean_{window}'] = df[metric].rolling(window).mean()
                    df[f'{metric}_rolling_std_{window}'] = df[metric].rolling(window).std()
                    df[f'{metric}_rolling_min_{window}'] = df[metric].rolling(window).min()
                    df[f'{metric}_rolling_max_{window}'] = df[metric].rolling(window).max()
        
        # Derived metrics
        if 'spend' in df.columns and 'clicks' in df.columns:
            df['cpc'] = df['spend'] / df['clicks'].replace(0, np.nan)
            df['cpc'] = df['cpc'].fillna(df['cpc'].median())
        
        if 'clicks' in df.columns and 'impressions' in df.columns:
            df['ctr'] = df['clicks'] / df['impressions'].replace(0, np.nan)
            df['ctr'] = df['ctr'].fillna(df['ctr'].median())
        
        if 'conversions' in df.columns and 'clicks' in df.columns:
            df['conversion_rate'] = df['conversions'] / df['clicks'].replace(0, np.nan)
            df['conversion_rate'] = df['conversion_rate'].fillna(df['conversion_rate'].median())
        
        # Platform-specific features
        if 'platform' in df.columns:
            platform_encoder = LabelEncoder()
            df['platform_encoded'] = platform_encoder.fit_transform(df['platform'])
            
            # Platform performance history
            for platform in df['platform'].unique():
                platform_mask = df['platform'] == platform
                df.loc[platform_mask, 'platform_avg_cpc'] = df.loc[platform_mask, 'cpc'].mean()
                df.loc[platform_mask, 'platform_avg_ctr'] = df.loc[platform_mask, 'ctr'].mean()
        
        # External factors (holidays, seasonality)
        df['is_holiday'] = self._identify_holidays(df.index)
        df['seasonality_index'] = self._calculate_seasonality_index(df.index)
        
        # Competition index (simulated - would be replaced with real data)
        df['competition_index'] = np.random.normal(1.0, 0.1, len(df))
        
        return df

    def _identify_holidays(self, dates: pd.DatetimeIndex) -> pd.Series:
        """Identify major holidays that might affect ad performance."""
        # Simple holiday detection - would be enhanced with actual holiday calendar
        holidays = []
        for date in dates:
            if (date.month == 12 and date.day in [24, 25, 31]) or \
               (date.month == 1 and date.day == 1) or \
               (date.month == 11 and date.day >= 22 and date.day <= 28 and date.dayofweek == 3):  # Thanksgiving
                holidays.append(1)
            else:
                holidays.append(0)
        return pd.Series(holidays, index=dates)

    def _calculate_seasonality_index(self, dates: pd.DatetimeIndex) -> pd.Series:
        """Calculate seasonality index for advertising performance."""
        # Shopping seasons
        seasonality = []
        for date in dates:
            if date.month in [11, 12]:  # Holiday shopping season
                seasonality.append(1.3)
            elif date.month in [6, 7, 8]:  # Summer season
                seasonality.append(1.1)
            elif date.month in [1, 2]:  # Post-holiday
                seasonality.append(0.8)
            else:
                seasonality.append(1.0)
        return pd.Series(seasonality, index=dates)

    def train_prophet_model(self, data: pd.DataFrame, target_metric: str) -> Prophet:
        """Train Prophet model for time series forecasting."""
        prophet_data = data.reset_index()[['date', target_metric]].rename(
            columns={'date': 'ds', target_metric: 'y'}
        )
        
        # Remove any missing values
        prophet_data = prophet_data.dropna()
        
        model = Prophet(**self.prophet_config)
        
        # Add custom seasonalities
        model.add_seasonality(name='monthly', period=30.5, fourier_order=5)
        
        # Add holidays (placeholder - would use real holiday data)
        holidays = pd.DataFrame({
            'holiday': 'holiday',
            'ds': pd.to_datetime(['2023-12-25', '2024-01-01', '2024-11-28']),
            'lower_window': 0,
            'upper_window': 1,
        })
        model.holidays = holidays
        
        model.fit(prophet_data)
        return model

    def train_lstm_model(self, data: pd.DataFrame, target_metric: str) -> tf.keras.Model:
        """Train LSTM model for time series forecasting."""
        # Prepare sequences
        scaler = StandardScaler()
        scaled_data = scaler.fit_transform(data[[target_metric]])
        
        def create_sequences(data, seq_length):
            X, y = [], []
            for i in range(len(data) - seq_length):
                X.append(data[i:(i + seq_length), 0])
                y.append(data[i + seq_length, 0])
            return np.array(X), np.array(y)
        
        X, y = create_sequences(scaled_data, self.lstm_config['sequence_length'])
        X = X.reshape((X.shape[0], X.shape[1], 1))
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, shuffle=False
        )
        
        # Build model
        model = Sequential([
            LSTM(self.lstm_config['lstm_units'][0], return_sequences=True, 
                 input_shape=(self.lstm_config['sequence_length'], 1)),
            Dropout(self.lstm_config['dropout_rate']),
            BatchNormalization(),
            
            LSTM(self.lstm_config['lstm_units'][1], return_sequences=True),
            Dropout(self.lstm_config['dropout_rate']),
            BatchNormalization(),
            
            LSTM(self.lstm_config['lstm_units'][2], return_sequences=False),
            Dropout(self.lstm_config['dropout_rate']),
            BatchNormalization(),
            
            Dense(50, activation='relu'),
            Dropout(self.lstm_config['dropout_rate']),
            Dense(1)
        ])
        
        model.compile(
            optimizer=Adam(learning_rate=self.lstm_config['learning_rate']),
            loss='mse',
            metrics=['mae']
        )
        
        # Callbacks
        callbacks = [
            EarlyStopping(patience=10, restore_best_weights=True),
            ReduceLROnPlateau(patience=5, factor=0.5)
        ]
        
        # Train model
        model.fit(
            X_train, y_train,
            batch_size=self.lstm_config['batch_size'],
            epochs=self.lstm_config['epochs'],
            validation_data=(X_test, y_test),
            callbacks=callbacks,
            verbose=0
        )
        
        # Store scaler for later use
        self.scalers[f'{target_metric}_lstm'] = scaler
        
        return model

    def train_lightgbm_model(self, data: pd.DataFrame, target_metric: str) -> lgb.LGBMRegressor:
        """Train LightGBM model for time series forecasting."""
        feature_cols = [col for col in data.columns if col != target_metric and not col.startswith('target')]
        X = data[feature_cols].fillna(0)
        y = data[target_metric]
        
        # Remove rows with missing target
        mask = ~y.isna()
        X, y = X[mask], y[mask]
        
        # Time series split
        tscv = TimeSeriesSplit(n_splits=5)
        
        model = lgb.LGBMRegressor(
            n_estimators=1000,
            learning_rate=0.05,
            max_depth=8,
            num_leaves=31,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            objective='regression',
            metric='rmse',
            verbosity=-1
        )
        
        # Train with time series validation
        for train_idx, val_idx in tscv.split(X):
            X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
            y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]
            
            model.fit(
                X_train, y_train,
                eval_set=[(X_val, y_val)],
                callbacks=[lgb.early_stopping(50), lgb.log_evaluation(0)]
            )
        
        # Store feature importance
        self.feature_importance[f'{target_metric}_lightgbm'] = dict(
            zip(feature_cols, model.feature_importances_)
        )
        
        return model

    def train_arima_model(self, data: pd.DataFrame, target_metric: str) -> ARIMA:
        """Train ARIMA model for time series forecasting."""
        series = data[target_metric].dropna()
        
        # Check stationarity
        adf_result = adfuller(series)
        
        # Difference the series if not stationary
        if adf_result[1] > 0.05:
            series = series.diff().dropna()
        
        # Auto ARIMA parameter selection (simplified)
        best_aic = float('inf')
        best_order = (1, 1, 1)
        
        for p in range(3):
            for d in range(2):
                for q in range(3):
                    try:
                        model = ARIMA(series, order=(p, d, q))
                        fitted_model = model.fit()
                        if fitted_model.aic < best_aic:
                            best_aic = fitted_model.aic
                            best_order = (p, d, q)
                    except:
                        continue
        
        # Train final model
        model = ARIMA(series, order=best_order)
        fitted_model = model.fit()
        
        return fitted_model

    def train(self, data: pd.DataFrame, target_metrics: List[str]) -> Dict[str, Any]:
        """
        Train the performance prediction models.
        
        Args:
            data: Training data with time series
            target_metrics: List of metrics to predict
            
        Returns:
            Training results and model performance
        """
        logger.info(f"Training {self.model_type} models for {len(target_metrics)} metrics")
        
        # Prepare features
        processed_data = self.prepare_features(data)
        
        training_results = {}
        
        for metric in target_metrics:
            if metric not in processed_data.columns:
                logger.warning(f"Metric {metric} not found in data, skipping")
                continue
            
            metric_results = {}
            
            try:
                if self.model_type in ['prophet', 'ensemble']:
                    prophet_model = self.train_prophet_model(processed_data, metric)
                    self.models[f'{metric}_prophet'] = prophet_model
                    metric_results['prophet'] = 'trained'
                
                if self.model_type in ['lstm', 'ensemble']:
                    lstm_model = self.train_lstm_model(processed_data, metric)
                    self.models[f'{metric}_lstm'] = lstm_model
                    metric_results['lstm'] = 'trained'
                
                if self.model_type in ['lightgbm', 'ensemble']:
                    lgb_model = self.train_lightgbm_model(processed_data, metric)
                    self.models[f'{metric}_lightgbm'] = lgb_model
                    metric_results['lightgbm'] = 'trained'
                
                if self.model_type in ['arima', 'ensemble']:
                    arima_model = self.train_arima_model(processed_data, metric)
                    self.models[f'{metric}_arima'] = arima_model
                    metric_results['arima'] = 'trained'
                
                training_results[metric] = metric_results
                
            except Exception as e:
                logger.error(f"Error training models for {metric}: {str(e)}")
                training_results[metric] = {'error': str(e)}
        
        self.is_trained = True
        logger.info("Model training completed")
        
        return training_results

    def predict(self, data: pd.DataFrame, campaign_id: str, prediction_days: int) -> Dict[str, Any]:
        """
        Generate predictions for campaign performance.
        
        Args:
            data: Historical data for prediction
            campaign_id: Campaign identifier
            prediction_days: Number of days to predict
            
        Returns:
            Predictions with confidence intervals
        """
        if not self.is_trained:
            raise ValueError("Models must be trained before making predictions")
        
        # Prepare features
        processed_data = self.prepare_features(data)
        
        # Generate future dates
        last_date = processed_data.index.max()
        future_dates = pd.date_range(
            start=last_date + timedelta(days=1),
            periods=prediction_days,
            freq='D'
        )
        
        predictions = {}
        
        for metric in ['spend', 'clicks', 'conversions', 'impressions']:
            if f'{metric}_prophet' not in self.models:
                continue
            
            metric_predictions = []
            
            # Prophet predictions
            if f'{metric}_prophet' in self.models:
                prophet_model = self.models[f'{metric}_prophet']
                future_df = prophet_model.make_future_dataframe(periods=prediction_days)
                prophet_forecast = prophet_model.predict(future_df)
                prophet_pred = prophet_forecast[['yhat', 'yhat_lower', 'yhat_upper']].tail(prediction_days)
                metric_predictions.append(('prophet', prophet_pred['yhat'].values))
            
            # Ensemble prediction
            if self.model_type == 'ensemble' and len(metric_predictions) > 1:
                ensemble_pred = np.zeros(prediction_days)
                for model_name, pred in metric_predictions:
                    weight = self.ensemble_weights.get(model_name, 0.25)
                    ensemble_pred += weight * pred
                
                predictions[metric] = {
                    'values': ensemble_pred.tolist(),
                    'dates': future_dates.tolist(),
                    'confidence_lower': (ensemble_pred * 0.9).tolist(),
                    'confidence_upper': (ensemble_pred * 1.1).tolist(),
                    'model_type': 'ensemble'
                }
            elif len(metric_predictions) > 0:
                pred_values = metric_predictions[0][1]
                predictions[metric] = {
                    'values': pred_values.tolist(),
                    'dates': future_dates.tolist(),
                    'confidence_lower': (pred_values * 0.9).tolist(),
                    'confidence_upper': (pred_values * 1.1).tolist(),
                    'model_type': metric_predictions[0][0]
                }
        
        return {
            'campaign_id': campaign_id,
            'predictions': predictions,
            'prediction_horizon': prediction_days,
            'generated_at': datetime.utcnow().isoformat()
        }

    def calculate_confidence_intervals(self, predictions: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate confidence intervals for predictions."""
        confidence_intervals = {}
        
        for metric, pred_data in predictions.get('predictions', {}).items():
            values = np.array(pred_data['values'])
            
            # Calculate percentile-based confidence intervals
            confidence_intervals[metric] = {
                'ci_95_lower': np.percentile(values, 2.5).tolist(),
                'ci_95_upper': np.percentile(values, 97.5).tolist(),
                'ci_80_lower': np.percentile(values, 10).tolist(),
                'ci_80_upper': np.percentile(values, 90).tolist(),
                'median': np.median(values).tolist(),
                'std': np.std(values).tolist()
            }
        
        return confidence_intervals

    def save_models(self, filepath: str) -> None:
        """Save trained models to disk."""
        model_data = {
            'models': self.models,
            'scalers': self.scalers,
            'feature_importance': self.feature_importance,
            'model_type': self.model_type,
            'is_trained': self.is_trained,
            'config': {
                'prophet_config': self.prophet_config,
                'lstm_config': self.lstm_config,
                'ensemble_weights': self.ensemble_weights
            }
        }
        
        joblib.dump(model_data, filepath)
        logger.info(f"Models saved to {filepath}")

    def load_models(self, filepath: str) -> None:
        """Load trained models from disk."""
        model_data = joblib.load(filepath)
        
        self.models = model_data['models']
        self.scalers = model_data['scalers']
        self.feature_importance = model_data['feature_importance']
        self.model_type = model_data['model_type']
        self.is_trained = model_data['is_trained']
        
        if 'config' in model_data:
            self.prophet_config = model_data['config']['prophet_config']
            self.lstm_config = model_data['config']['lstm_config']
            self.ensemble_weights = model_data['config']['ensemble_weights']
        
        logger.info(f"Models loaded from {filepath}")

    def get_feature_importance(self, metric: str) -> Dict[str, float]:
        """Get feature importance for a specific metric."""
        return self.feature_importance.get(f'{metric}_lightgbm', {})