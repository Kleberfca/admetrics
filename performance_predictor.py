"""
Performance Predictor Model
Predicts future campaign performance based on historical data
"""

import os
import pickle
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split, cross_val_score, TimeSeriesSplit
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import lightgbm as lgb
from prophet import Prophet
import joblib

logger = logging.getLogger(__name__)

class PerformancePredictor:
    """
    AI model for predicting campaign performance metrics
    """
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or 'models/performance_predictor'
        self.models = {}
        self.scalers = {}
        self.feature_columns = []
        self.target_metrics = ['spend', 'clicks', 'conversions', 'impressions']
        self.is_trained = False
        self.model_version = "1.0.0"
        self.last_trained = None
        self.accuracy_metrics = {}
        
        # Model configurations
        self.model_configs = {
            'random_forest': {
                'n_estimators': 100,
                'max_depth': 20,
                'min_samples_split': 5,
                'min_samples_leaf': 2,
                'random_state': 42
            },
            'gradient_boosting': {
                'n_estimators': 100,
                'learning_rate': 0.1,
                'max_depth': 8,
                'min_samples_split': 5,
                'random_state': 42
            },
            'lightgbm': {
                'n_estimators': 100,
                'learning_rate': 0.1,
                'max_depth': 8,
                'num_leaves': 31,
                'feature_fraction': 0.8,
                'bagging_fraction': 0.8,
                'bagging_freq': 5,
                'random_state': 42,
                'verbose': -1
            }
        }
        
        # Ensure model directory exists
        os.makedirs(self.model_path, exist_ok=True)
    
    def prepare_features(self, data: List[Dict]) -> pd.DataFrame:
        """
        Prepare features from raw campaign data
        """
        try:
            df = pd.DataFrame(data)
            
            if df.empty:
                raise ValueError("No data provided for feature preparation")
            
            # Convert date column
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date').reset_index(drop=True)
            
            # Create time-based features
            df['day_of_week'] = df['date'].dt.dayofweek
            df['day_of_month'] = df['date'].dt.day
            df['month'] = df['date'].dt.month
            df['quarter'] = df['date'].dt.quarter
            df['week_of_year'] = df['date'].dt.isocalendar().week
            df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
            
            # Create lag features (previous day performance)
            for metric in self.target_metrics:
                if metric in df.columns:
                    df[f'{metric}_lag_1'] = df[metric].shift(1)
                    df[f'{metric}_lag_3'] = df[metric].shift(3)
                    df[f'{metric}_lag_7'] = df[metric].shift(7)
            
            # Create rolling averages
            for metric in self.target_metrics:
                if metric in df.columns:
                    df[f'{metric}_rolling_3'] = df[metric].rolling(window=3, min_periods=1).mean()
                    df[f'{metric}_rolling_7'] = df[metric].rolling(window=7, min_periods=1).mean()
                    df[f'{metric}_rolling_14'] = df[metric].rolling(window=14, min_periods=1).mean()
            
            # Create trend features
            for metric in self.target_metrics:
                if metric in df.columns:
                    df[f'{metric}_trend_3'] = df[metric].rolling(window=3).apply(
                        lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) > 1 else 0
                    )
                    df[f'{metric}_trend_7'] = df[metric].rolling(window=7).apply(
                        lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) > 1 else 0
                    )
            
            # Create ratio features
            if 'clicks' in df.columns and 'impressions' in df.columns:
                df['ctr_calculated'] = np.where(df['impressions'] > 0, 
                                              df['clicks'] / df['impressions'], 0)
            
            if 'spend' in df.columns and 'clicks' in df.columns:
                df['cpc_calculated'] = np.where(df['clicks'] > 0, 
                                              df['spend'] / df['clicks'], 0)
            
            if 'spend' in df.columns and 'conversions' in df.columns:
                df['cpa_calculated'] = np.where(df['conversions'] > 0, 
                                              df['spend'] / df['conversions'], 0)
            
            # Add campaign characteristics if available
            if 'platform' in df.columns:
                # Encode platform
                le_platform = LabelEncoder()
                df['platform_encoded'] = le_platform.fit_transform(df['platform'].astype(str))
            
            # Fill NaN values
            df = df.fillna(0)
            
            return df
            
        except Exception as e:
            logger.error(f"Error preparing features: {e}")
            raise
    
    def train(self, training_data: List[Dict], validation_split: float = 0.2) -> Dict[str, Any]:
        """
        Train the performance prediction models
        """
        try:
            logger.info("Starting performance predictor training...")
            
            # Prepare features
            df = self.prepare_features(training_data)
            
            if len(df) < 10:
                raise ValueError("Insufficient training data (minimum 10 records required)")
            
            # Define feature columns (exclude date and target metrics)
            feature_cols = [col for col in df.columns 
                          if col not in ['date'] + self.target_metrics]
            self.feature_columns = feature_cols
            
            X = df[feature_cols].values
            
            # Train models for each target metric
            training_results = {}
            
            for metric in self.target_metrics:
                if metric not in df.columns:
                    logger.warning(f"Metric {metric} not found in training data, skipping...")
                    continue
                
                y = df[metric].values
                
                # Split data for training and validation
                # Use time series split to maintain temporal order
                tscv = TimeSeriesSplit(n_splits=3)
                
                # Scale features
                scaler = StandardScaler()
                X_scaled = scaler.fit_transform(X)
                self.scalers[metric] = scaler
                
                # Train multiple models and ensemble them
                models = {}
                scores = {}
                
                # Random Forest
                rf_model = RandomForestRegressor(**self.model_configs['random_forest'])
                rf_scores = cross_val_score(rf_model, X_scaled, y, cv=tscv, scoring='neg_mean_squared_error')
                rf_model.fit(X_scaled, y)
                models['random_forest'] = rf_model
                scores['random_forest'] = -rf_scores.mean()
                
                # Gradient Boosting
                gb_model = GradientBoostingRegressor(**self.model_configs['gradient_boosting'])
                gb_scores = cross_val_score(gb_model, X_scaled, y, cv=tscv, scoring='neg_mean_squared_error')
                gb_model.fit(X_scaled, y)
                models['gradient_boosting'] = gb_model
                scores['gradient_boosting'] = -gb_scores.mean()
                
                # LightGBM
                lgb_model = lgb.LGBMRegressor(**self.model_configs['lightgbm'])
                lgb_scores = cross_val_score(lgb_model, X_scaled, y, cv=tscv, scoring='neg_mean_squared_error')
                lgb_model.fit(X_scaled, y)
                models['lightgbm'] = lgb_model
                scores['lightgbm'] = -lgb_scores.mean()
                
                # Store models and select best performing one
                self.models[metric] = models
                best_model_name = min(scores, key=scores.get)
                
                # Calculate accuracy metrics on validation set
                X_train, X_val, y_train, y_val = train_test_split(
                    X_scaled, y, test_size=validation_split, 
                    shuffle=False  # Maintain temporal order
                )
                
                best_model = models[best_model_name]
                y_pred = best_model.predict(X_val)
                
                self.accuracy_metrics[metric] = {
                    'mse': mean_squared_error(y_val, y_pred),
                    'mae': mean_absolute_error(y_val, y_pred),
                    'r2': r2_score(y_val, y_pred),
                    'best_model': best_model_name,
                    'cv_scores': scores
                }
                
                training_results[metric] = {
                    'best_model': best_model_name,
                    'mse': self.accuracy_metrics[metric]['mse'],
                    'mae': self.accuracy_metrics[metric]['mae'],
                    'r2': self.accuracy_metrics[metric]['r2']
                }
                
                logger.info(f"Trained {metric} predictor - Best: {best_model_name}, R²: {self.accuracy_metrics[metric]['r2']:.3f}")
            
            self.is_trained = True
            self.last_trained = datetime.utcnow()
            
            # Save models
            self.save_model()
            
            logger.info("Performance predictor training completed successfully")
            
            return {
                'success': True,
                'metrics_trained': list(training_results.keys()),
                'results': training_results,
                'feature_count': len(self.feature_columns),
                'training_samples': len(df)
            }
            
        except Exception as e:
            logger.error(f"Error training performance predictor: {e}")
            raise
    
    def predict(self, historical_data: List[Dict], prediction_days: int = 30, 
                metrics: List[str] = None) -> Dict[str, List[float]]:
        """
        Predict future performance metrics
        """
        try:
            if not self.is_trained and not self.load_model():
                raise ValueError("Model not trained. Please train the model first.")
            
            if metrics is None:
                metrics = list(self.models.keys())
            
            # Prepare features from historical data
            df = self.prepare_features(historical_data)
            
            if df.empty:
                raise ValueError("No valid historical data provided")
            
            predictions = {}
            
            for metric in metrics:
                if metric not in self.models:
                    logger.warning(f"No trained model found for metric: {metric}")
                    continue
                
                # Get the last known values for generating future predictions
                last_row = df.iloc[-1:][self.feature_columns].values
                
                # Scale features
                scaler = self.scalers[metric]
                last_row_scaled = scaler.transform(last_row)
                
                # Generate predictions using ensemble of models
                metric_models = self.models[metric]
                ensemble_predictions = []
                
                for model_name, model in metric_models.items():
                    model_predictions = []
                    current_features = last_row_scaled.copy()
                    
                    for day in range(prediction_days):
                        pred = model.predict(current_features)[0]
                        model_predictions.append(max(0, pred))  # Ensure non-negative predictions
                        
                        # Update features for next prediction (simple approach)
                        # In practice, you'd want more sophisticated feature updating
                        current_features = current_features.copy()
                    
                    ensemble_predictions.append(model_predictions)
                
                # Average ensemble predictions
                predictions[metric] = np.mean(ensemble_predictions, axis=0).tolist()
            
            return predictions
            
        except Exception as e:
            logger.error(f"Error making predictions: {e}")
            raise
    
    def predict_with_prophet(self, historical_data: List[Dict], 
                           metric: str, prediction_days: int = 30) -> Dict[str, Any]:
        """
        Use Facebook Prophet for time series prediction (alternative method)
        """
        try:
            df = pd.DataFrame(historical_data)
            df['date'] = pd.to_datetime(df['date'])
            
            if metric not in df.columns:
                raise ValueError(f"Metric {metric} not found in data")
            
            # Prepare data for Prophet
            prophet_df = df[['date', metric]].rename(columns={'date': 'ds', metric: 'y'})
            prophet_df = prophet_df.dropna()
            
            # Create and fit Prophet model
            model = Prophet(
                daily_seasonality=True,
                weekly_seasonality=True,
                yearly_seasonality=False,
                changepoint_prior_scale=0.05
            )
            
            model.fit(prophet_df)
            
            # Make future predictions
            future = model.make_future_dataframe(periods=prediction_days)
            forecast = model.predict(future)
            
            # Extract predictions for future dates only
            future_predictions = forecast.tail(prediction_days)
            
            return {
                'predictions': future_predictions['yhat'].tolist(),
                'lower_bound': future_predictions['yhat_lower'].tolist(),
                'upper_bound': future_predictions['yhat_upper'].tolist(),
                'dates': future_predictions['ds'].dt.strftime('%Y-%m-%d').tolist()
            }
            
        except Exception as e:
            logger.error(f"Error with Prophet prediction: {e}")
            raise
    
    def calculate_confidence_intervals(self, predictions: Dict[str, List[float]], 
                                     confidence_level: float = 0.95) -> Dict[str, Dict[str, List[float]]]:
        """
        Calculate confidence intervals for predictions
        """
        try:
            confidence_intervals = {}
            z_score = 1.96 if confidence_level == 0.95 else 2.576  # 95% or 99%
            
            for metric, preds in predictions.items():
                if metric not in self.accuracy_metrics:
                    continue
                
                # Use historical error to estimate uncertainty
                mse = self.accuracy_metrics[metric]['mse']
                std_error = np.sqrt(mse)
                
                lower_bound = [max(0, p - z_score * std_error) for p in preds]
                upper_bound = [p + z_score * std_error for p in preds]
                
                confidence_intervals[metric] = {
                    'lower_bound': lower_bound,
                    'upper_bound': upper_bound,
                    'confidence_level': confidence_level
                }
            
            return confidence_intervals
            
        except Exception as e:
            logger.error(f"Error calculating confidence intervals: {e}")
            return {}
    
    def save_model(self) -> bool:
        """
        Save the trained model to disk
        """
        try:
            model_data = {
                'models': self.models,
                'scalers': self.scalers,
                'feature_columns': self.feature_columns,
                'target_metrics': self.target_metrics,
                'model_version': self.model_version,
                'last_trained': self.last_trained,
                'accuracy_metrics': self.accuracy_metrics,
                'is_trained': self.is_trained
            }
            
            model_file = os.path.join(self.model_path, 'performance_predictor.pkl')
            with open(model_file, 'wb') as f:
                pickle.dump(model_data, f)
            
            logger.info(f"Model saved successfully to {model_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving model: {e}")
            return False
    
    def load_model(self) -> bool:
        """
        Load a trained model from disk
        """
        try:
            model_file = os.path.join(self.model_path, 'performance_predictor.pkl')
            
            if not os.path.exists(model_file):
                logger.warning(f"Model file not found: {model_file}")
                return False
            
            with open(model_file, 'rb') as f:
                model_data = pickle.load(f)
            
            self.models = model_data['models']
            self.scalers = model_data['scalers']
            self.feature_columns = model_data['feature_columns']
            self.target_metrics = model_data['target_metrics']
            self.model_version = model_data.get('model_version', '1.0.0')
            self.last_trained = model_data.get('last_trained')
            self.accuracy_metrics = model_data.get('accuracy_metrics', {})
            self.is_trained = model_data.get('is_trained', True)
            
            logger.info(f"Model loaded successfully from {model_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.is_trained and bool(self.models)
    
    def get_version(self) -> str:
        """Get model version"""
        return self.model_version
    
    def get_last_trained_date(self) -> Optional[str]:
        """Get last training date"""
        return self.last_trained.isoformat() if self.last_trained else None
    
    def get_accuracy_metrics(self) -> Dict[str, Any]:
        """Get model accuracy metrics"""
        return self.accuracy_metrics
    
    def get_feature_importance(self, metric: str, model_type: str = None) -> Dict[str, float]:
        """
        Get feature importance for a specific metric
        """
        try:
            if metric not in self.models:
                return {}
            
            models = self.models[metric]
            
            if model_type and model_type in models:
                model = models[model_type]
            else:
                # Use the best performing model
                best_model_name = self.accuracy_metrics[metric]['best_model']
                model = models[best_model_name]
            
            if hasattr(model, 'feature_importances_'):
                importance_dict = dict(zip(self.feature_columns, model.feature_importances_))
                # Sort by importance
                return dict(sorted(importance_dict.items(), key=lambda x: x[1], reverse=True))
            
            return {}
            
        except Exception as e:
            logger.error(f"Error getting feature importance: {e}")
            return {}

if __name__ == "__main__":
    # Example usage
    predictor = PerformancePredictor()
    
    # Mock training data
    training_data = [
        {
            'date': '2024-01-01',
            'spend': 100.0,
            'clicks': 50,
            'impressions': 1000,
            'conversions': 5,
            'platform': 'GOOGLE_ADS'
        },
        # Add more training data...
    ]
    
    # Train the model
    # result = predictor.train(training_data)
    # print(f"Training result: {result}")
    
    # Make predictions
    # predictions = predictor.predict(training_data, prediction_days=7)
    # print(f"Predictions: {predictions}")