"""
Performance Predictor Model
Predicts advertising campaign performance metrics using time series analysis and machine learning
"""

import os
import logging
import warnings
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split, cross_val_score, TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

# Time series libraries
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    warnings.warn("Prophet not available, using alternative time series methods")

try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.seasonal import seasonal_decompose
    from statsmodels.tsa.stattools import adfuller
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False
    warnings.warn("Statsmodels not available, using simplified time series methods")

# Set up logging
logger = logging.getLogger(__name__)

class PerformancePredictor:
    """
    Advanced performance prediction model using multiple algorithms
    """
    
    def __init__(self, model_type: str = 'auto'):
        """
        Initialize the Performance Predictor
        
        Args:
            model_type: Type of model to use ('prophet', 'arima', 'ml', 'auto')
        """
        self.model_type = model_type
        self.models = {}
        self.scalers = {}
        self.feature_importance = {}
        self.model_performance = {}
        
        # Available metrics for prediction
        self.supported_metrics = [
            'spend', 'clicks', 'impressions', 'conversions', 
            'conversion_value', 'ctr', 'cpc', 'cpm', 'roas',
            'cost_per_conversion', 'conversion_rate'
        ]
        
        # Model configurations
        self.model_configs = {
            'random_forest': {
                'n_estimators': 100,
                'max_depth': 10,
                'min_samples_split': 5,
                'random_state': 42
            },
            'gradient_boosting': {
                'n_estimators': 100,
                'learning_rate': 0.1,
                'max_depth': 6,
                'random_state': 42
            },
            'prophet': {
                'changepoint_prior_scale': 0.05,
                'seasonality_prior_scale': 10,
                'holidays_prior_scale': 10,
                'seasonality_mode': 'multiplicative'
            }
        }
    
    def prepare_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare features for machine learning models
        
        Args:
            data: Historical campaign data
            
        Returns:
            DataFrame with engineered features
        """
        df = data.copy()
        
        # Ensure date column is datetime
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')
        
        # Time-based features
        df['day_of_week'] = df['date'].dt.dayofweek
        df['month'] = df['date'].dt.month
        df['quarter'] = df['date'].dt.quarter
        df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
        df['days_since_start'] = (df['date'] - df['date'].min()).dt.days
        
        # Lag features (previous values)
        lag_features = ['spend', 'clicks', 'impressions', 'conversions']
        for feature in lag_features:
            if feature in df.columns:
                for lag in [1, 2, 3, 7, 14]:
                    df[f'{feature}_lag_{lag}'] = df[feature].shift(lag)
        
        # Rolling statistics
        rolling_windows = [3, 7, 14, 30]
        for feature in lag_features:
            if feature in df.columns:
                for window in rolling_windows:
                    df[f'{feature}_rolling_mean_{window}'] = df[feature].rolling(window=window).mean()
                    df[f'{feature}_rolling_std_{window}'] = df[feature].rolling(window=window).std()
                    df[f'{feature}_rolling_min_{window}'] = df[feature].rolling(window=window).min()
                    df[f'{feature}_rolling_max_{window}'] = df[feature].rolling(window=window).max()
        
        # Ratio features
        if 'spend' in df.columns and 'clicks' in df.columns:
            df['spend_per_click'] = df['spend'] / (df['clicks'] + 1e-6)
        
        if 'conversions' in df.columns and 'clicks' in df.columns:
            df['conversion_rate_calc'] = df['conversions'] / (df['clicks'] + 1e-6)
        
        if 'conversion_value' in df.columns and 'spend' in df.columns:
            df['roas_calc'] = df['conversion_value'] / (df['spend'] + 1e-6)
        
        # Trend features
        for feature in lag_features:
            if feature in df.columns:
                df[f'{feature}_trend'] = df[feature].pct_change()
                df[f'{feature}_momentum'] = df[feature] - df[feature].shift(7)
        
        # Cyclical features for seasonality
        df['day_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
        df['day_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        
        # Fill NaN values
        df = df.fillna(method='ffill').fillna(method='bfill').fillna(0)
        
        return df
    
    def train_ml_model(self, data: pd.DataFrame, target_metric: str) -> Dict[str, Any]:
        """
        Train machine learning models for prediction
        
        Args:
            data: Training data
            target_metric: Metric to predict
            
        Returns:
            Training results and model performance
        """
        if target_metric not in data.columns:
            raise ValueError(f"Target metric '{target_metric}' not found in data")
        
        # Prepare features
        feature_data = self.prepare_features(data)
        
        # Select feature columns (exclude date and target)
        feature_cols = [col for col in feature_data.columns 
                       if col not in ['date', target_metric] and 
                       not col.startswith('target_')]
        
        X = feature_data[feature_cols]
        y = feature_data[target_metric]
        
        # Remove rows with NaN in target
        mask = ~np.isnan(y)
        X = X[mask]
        y = y[mask]
        
        if len(X) < 10:
            raise ValueError("Insufficient data for training (need at least 10 samples)")
        
        # Scale features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Time series split for validation
        tscv = TimeSeriesSplit(n_splits=3)
        
        # Train multiple models
        models = {
            'random_forest': RandomForestRegressor(**self.model_configs['random_forest']),
            'gradient_boosting': GradientBoostingRegressor(**self.model_configs['gradient_boosting']),
            'linear_regression': LinearRegression()
        }
        
        best_model = None
        best_score = -np.inf
        model_scores = {}
        
        for name, model in models.items():
            try:
                # Cross-validation
                scores = cross_val_score(model, X_scaled, y, cv=tscv, scoring='neg_mean_absolute_error')
                avg_score = scores.mean()
                model_scores[name] = avg_score
                
                if avg_score > best_score:
                    best_score = avg_score
                    best_model = model
                    best_model_name = name
                
                logger.info(f"Model {name} CV MAE: {-avg_score:.4f}")
                
            except Exception as e:
                logger.error(f"Error training model {name}: {e}")
                continue
        
        if best_model is None:
            raise ValueError("No models could be trained successfully")
        
        # Train the best model on all data
        best_model.fit(X_scaled, y)
        
        # Store the model and scaler
        self.models[target_metric] = best_model
        self.scalers[target_metric] = scaler
        
        # Feature importance (if available)
        if hasattr(best_model, 'feature_importances_'):
            importance = dict(zip(feature_cols, best_model.feature_importances_))
            self.feature_importance[target_metric] = sorted(
                importance.items(), key=lambda x: x[1], reverse=True
            )
        
        # Calculate metrics on training data
        y_pred = best_model.predict(X_scaled)
        training_metrics = {
            'mae': mean_absolute_error(y, y_pred),
            'mse': mean_squared_error(y, y_pred),
            'r2': r2_score(y, y_pred),
            'cv_score': best_score
        }
        
        self.model_performance[target_metric] = training_metrics
        
        return {
            'best_model': best_model_name,
            'model_scores': model_scores,
            'training_metrics': training_metrics,
            'feature_importance': self.feature_importance.get(target_metric, []),
            'n_features': len(feature_cols),
            'n_samples': len(X)
        }
    
    def train_prophet_model(self, data: pd.DataFrame, target_metric: str) -> Dict[str, Any]:
        """
        Train Prophet model for time series prediction
        
        Args:
            data: Training data
            target_metric: Metric to predict
            
        Returns:
            Training results
        """
        if not PROPHET_AVAILABLE:
            raise ImportError("Prophet is not available. Install with: pip install prophet")
        
        if target_metric not in data.columns:
            raise ValueError(f"Target metric '{target_metric}' not found in data")
        
        # Prepare data for Prophet
        prophet_data = data[['date', target_metric]].copy()
        prophet_data.columns = ['ds', 'y']
        prophet_data = prophet_data.dropna()
        
        if len(prophet_data) < 10:
            raise ValueError("Insufficient data for Prophet training")
        
        # Initialize and configure Prophet
        model = Prophet(**self.model_configs['prophet'])
        
        # Add custom seasonalities
        model.add_seasonality(name='monthly', period=30.5, fourier_order=5)
        
        # Fit the model
        model.fit(prophet_data)
        
        # Store the model
        self.models[f"{target_metric}_prophet"] = model
        
        # Evaluate model performance
        cv_horizon = min(30, len(prophet_data) // 4)  # Use 25% of data for validation
        if cv_horizon > 7:
            from prophet.diagnostics import cross_validation, performance_metrics
            
            df_cv = cross_validation(
                model, 
                horizon=f'{cv_horizon} days',
                period=f'{cv_horizon // 2} days',
                initial=f'{len(prophet_data) - cv_horizon} days'
            )
            df_performance = performance_metrics(df_cv)
            
            training_metrics = {
                'mae': df_performance['mae'].mean(),
                'mse': df_performance['mse'].mean(),
                'mape': df_performance['mape'].mean()
            }
        else:
            training_metrics = {'mae': 0, 'mse': 0, 'mape': 0}
        
        self.model_performance[f"{target_metric}_prophet"] = training_metrics
        
        return {
            'model_type': 'prophet',
            'training_metrics': training_metrics,
            'n_samples': len(prophet_data)
        }
    
    def predict(self, 
                historical_data: pd.DataFrame, 
                metric: str, 
                days: int,
                confidence_level: float = 0.95) -> Dict[str, Any]:
        """
        Make predictions for a specific metric
        
        Args:
            historical_data: Historical campaign data
            metric: Metric to predict
            days: Number of days to predict
            confidence_level: Confidence level for prediction intervals
            
        Returns:
            Prediction results with values, dates, and confidence intervals
        """
        if metric not in self.supported_metrics:
            raise ValueError(f"Metric '{metric}' not supported. Available: {self.supported_metrics}")
        
        # Choose prediction method based on model type and availability
        if self.model_type == 'prophet' and PROPHET_AVAILABLE:
            return self._predict_prophet(historical_data, metric, days, confidence_level)
        elif self.model_type == 'arima' and STATSMODELS_AVAILABLE:
            return self._predict_arima(historical_data, metric, days, confidence_level)
        elif self.model_type == 'ml' or metric in self.models:
            return self._predict_ml(historical_data, metric, days, confidence_level)
        else:
            # Auto mode: try Prophet first, then ML, then simple methods
            try:
                if PROPHET_AVAILABLE:
                    return self._predict_prophet(historical_data, metric, days, confidence_level)
            except Exception as e:
                logger.warning(f"Prophet prediction failed: {e}")
            
            try:
                return self._predict_ml(historical_data, metric, days, confidence_level)
            except Exception as e:
                logger.warning(f"ML prediction failed: {e}")
            
            # Fallback to simple trend prediction
            return self._predict_simple_trend(historical_data, metric, days)
    
    def _predict_prophet(self, data: pd.DataFrame, metric: str, days: int, confidence_level: float) -> Dict[str, Any]:
        """Prophet-based prediction"""
        model_key = f"{metric}_prophet"
        
        if model_key not in self.models:
            # Train Prophet model if not available
            self.train_prophet_model(data, metric)
        
        model = self.models[model_key]
        
        # Create future dataframe
        future = model.make_future_dataframe(periods=days)
        
        # Make prediction
        forecast = model.predict(future)
        
        # Extract prediction results
        last_historical_date = pd.to_datetime(data['date']).max()
        future_forecast = forecast[forecast['ds'] > last_historical_date]
        
        prediction_values = future_forecast['yhat'].values
        prediction_dates = future_forecast['ds'].dt.strftime('%Y-%m-%d').values
        
        # Confidence intervals
        lower_bound = future_forecast['yhat_lower'].values
        upper_bound = future_forecast['yhat_upper'].values
        
        confidence_intervals = [
            {'lower': float(lower), 'upper': float(upper)}
            for lower, upper in zip(lower_bound, upper_bound)
        ]
        
        return {
            'values': prediction_values.tolist(),
            'dates': prediction_dates.tolist(),
            'confidence_intervals': confidence_intervals,
            'method': 'prophet',
            'accuracy': self.model_performance.get(model_key, {}).get('mape', 0)
        }
    
    def _predict_ml(self, data: pd.DataFrame, metric: str, days: int, confidence_level: float) -> Dict[str, Any]:
        """Machine learning based prediction"""
        if metric not in self.models:
            # Train ML model if not available
            self.train_ml_model(data, metric)
        
        model = self.models[metric]
        scaler = self.scalers[metric]
        
        # Prepare features for prediction
        feature_data = self.prepare_features(data)
        
        # Get the last row as base for prediction
        last_row = feature_data.iloc[-1:].copy()
        
        predictions = []
        prediction_dates = []
        
        current_date = pd.to_datetime(data['date']).max()
        
        for day in range(1, days + 1):
            # Update date-related features
            future_date = current_date + timedelta(days=day)
            last_row['day_of_week'] = future_date.weekday()
            last_row['month'] = future_date.month
            last_row['quarter'] = future_date.quarter
            last_row['is_weekend'] = int(future_date.weekday() >= 5)
            last_row['days_since_start'] = (future_date - pd.to_datetime(data['date']).min()).days
            
            # Cyclical features
            last_row['day_sin'] = np.sin(2 * np.pi * last_row['day_of_week'] / 7)
            last_row['day_cos'] = np.cos(2 * np.pi * last_row['day_of_week'] / 7)
            last_row['month_sin'] = np.sin(2 * np.pi * last_row['month'] / 12)
            last_row['month_cos'] = np.cos(2 * np.pi * last_row['month'] / 12)
            
            # Select feature columns
            feature_cols = [col for col in last_row.columns 
                           if col not in ['date', metric] and 
                           not col.startswith('target_')]
            
            X = last_row[feature_cols]
            X_scaled = scaler.transform(X)
            
            # Make prediction
            pred = model.predict(X_scaled)[0]
            predictions.append(max(0, pred))  # Ensure non-negative predictions
            prediction_dates.append(future_date.strftime('%Y-%m-%d'))
            
            # Update lag features for next prediction
            last_row[metric] = pred
            for lag in [1, 2, 3, 7, 14]:
                if f'{metric}_lag_{lag}' in last_row.columns:
                    # Shift lag features
                    if lag == 1:
                        last_row[f'{metric}_lag_{lag}'] = pred
                    else:
                        last_row[f'{metric}_lag_{lag}'] = last_row.get(f'{metric}_lag_{lag-1}', pred)
        
        # Simple confidence intervals based on historical variance
        historical_values = data[metric].dropna()
        if len(historical_values) > 1:
            std_dev = historical_values.std()
            z_score = 1.96 if confidence_level == 0.95 else 2.58  # 95% or 99%
            
            confidence_intervals = [
                {
                    'lower': max(0, pred - z_score * std_dev),
                    'upper': pred + z_score * std_dev
                }
                for pred in predictions
            ]
        else:
            confidence_intervals = [
                {'lower': pred * 0.8, 'upper': pred * 1.2}
                for pred in predictions
            ]
        
        return {
            'values': predictions,
            'dates': prediction_dates,
            'confidence_intervals': confidence_intervals,
            'method': 'machine_learning',
            'accuracy': self.model_performance.get(metric, {}).get('r2', 0)
        }
    
    def _predict_simple_trend(self, data: pd.DataFrame, metric: str, days: int) -> Dict[str, Any]:
        """Simple trend-based prediction as fallback"""
        if metric not in data.columns:
            raise ValueError(f"Metric '{metric}' not found in data")
        
        # Get recent values
        values = data[metric].dropna()
        if len(values) < 2:
            raise ValueError("Insufficient data for prediction")
        
        # Calculate simple trend
        recent_values = values.tail(min(14, len(values)))  # Last 14 days or all available
        trend = (recent_values.iloc[-1] - recent_values.iloc[0]) / len(recent_values)
        
        # Generate predictions
        last_value = values.iloc[-1]
        predictions = []
        prediction_dates = []
        
        current_date = pd.to_datetime(data['date']).max()
        
        for day in range(1, days + 1):
            future_date = current_date + timedelta(days=day)
            predicted_value = max(0, last_value + trend * day)
            
            predictions.append(predicted_value)
            prediction_dates.append(future_date.strftime('%Y-%m-%d'))
        
        # Simple confidence intervals
        std_dev = values.std()
        confidence_intervals = [
            {
                'lower': max(0, pred - 1.96 * std_dev),
                'upper': pred + 1.96 * std_dev
            }
            for pred in predictions
        ]
        
        return {
            'values': predictions,
            'dates': prediction_dates,
            'confidence_intervals': confidence_intervals,
            'method': 'simple_trend',
            'accuracy': 0.5  # Conservative estimate
        }
    
    def save_model(self, filepath: str) -> None:
        """Save trained models to disk"""
        model_data = {
            'models': self.models,
            'scalers': self.scalers,
            'feature_importance': self.feature_importance,
            'model_performance': self.model_performance,
            'model_type': self.model_type,
            'supported_metrics': self.supported_metrics
        }
        
        joblib.dump(model_data, filepath)
        logger.info(f"Models saved to {filepath}")
    
    def load_model(self, filepath: str) -> None:
        """Load trained models from disk"""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Model file not found: {filepath}")
        
        model_data = joblib.load(filepath)
        
        self.models = model_data.get('models', {})
        self.scalers = model_data.get('scalers', {})
        self.feature_importance = model_data.get('feature_importance', {})
        self.model_performance = model_data.get('model_performance', {})
        self.model_type = model_data.get('model_type', 'auto')
        self.supported_metrics = model_data.get('supported_metrics', self.supported_metrics)
        
        logger.info(f"Models loaded from {filepath}")
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about trained models"""
        return {
            'trained_metrics': list(self.models.keys()),
            'model_performance': self.model_performance,
            'feature_importance': self.feature_importance,
            'model_type': self.model_type,
            'supported_metrics': self.supported_metrics
        }