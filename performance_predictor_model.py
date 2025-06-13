# ai-engine/src/models/prediction/performance_predictor.py
import os
import pickle
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import warnings
warnings.filterwarnings('ignore')

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import lightgbm as lgb
from prophet import Prophet
import joblib

from ..base_model import BaseModel
from ...utils.logger import setup_logger

logger = setup_logger(__name__)

class PerformancePredictor(BaseModel):
    """
    Advanced performance prediction model using ensemble methods
    Combines Prophet, LightGBM, and Random Forest for robust predictions
    """
    
    def __init__(self):
        super().__init__()
        self.model_name = "performance_predictor"
        self.version = "1.2.0"
        
        # Initialize models
        self.prophet_models = {}  # One Prophet model per metric
        self.lgb_models = {}      # LightGBM models for complex patterns
        self.rf_models = {}       # Random Forest for feature importance
        self.scalers = {}         # Scalers for normalization
        self.encoders = {}        # Label encoders for categorical features
        
        # Model parameters
        self.lgb_params = {
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
        
        self.rf_params = {
            'n_estimators': 100,
            'max_depth': 10,
            'min_samples_split': 5,
            'min_samples_leaf': 2,
            'random_state': 42,
            'n_jobs': -1
        }
        
        # Metrics to predict
        self.target_metrics = ['spend', 'clicks', 'conversions', 'roas']
        
        # Feature columns
        self.feature_columns = [
            'day_of_week', 'day_of_month', 'month', 'quarter',
            'is_weekend', 'is_holiday', 'rolling_mean_7d', 'rolling_mean_14d',
            'rolling_std_7d', 'trend', 'seasonality_strength',
            'platform_encoded', 'objective_encoded'
        ]
        
        self.is_trained = False
        self.model_metrics = {}
        
    def load_model(self) -> bool:
        """Load pre-trained models from disk"""
        try:
            model_dir = self._get_model_dir()
            
            # Load Prophet models
            prophet_path = os.path.join(model_dir, f"{self.model_name}_prophet.pkl")
            if os.path.exists(prophet_path):
                self.prophet_models = joblib.load(prophet_path)
                
            # Load LightGBM models
            lgb_path = os.path.join(model_dir, f"{self.model_name}_lgb.pkl")
            if os.path.exists(lgb_path):
                self.lgb_models = joblib.load(lgb_path)
                
            # Load Random Forest models
            rf_path = os.path.join(model_dir, f"{self.model_name}_rf.pkl")
            if os.path.exists(rf_path):
                self.rf_models = joblib.load(rf_path)
                
            # Load scalers and encoders
            scalers_path = os.path.join(model_dir, f"{self.model_name}_scalers.pkl")
            if os.path.exists(scalers_path):
                self.scalers = joblib.load(scalers_path)
                
            encoders_path = os.path.join(model_dir, f"{self.model_name}_encoders.pkl")
            if os.path.exists(encoders_path):
                self.encoders = joblib.load(encoders_path)
                
            # Load model metrics
            metrics_path = os.path.join(model_dir, f"{self.model_name}_metrics.pkl")
            if os.path.exists(metrics_path):
                self.model_metrics = joblib.load(metrics_path)
            
            self.is_trained = len(self.lgb_models) > 0
            
            if self.is_trained:
                logger.info(f"Performance predictor models loaded successfully")
                return True
            else:
                logger.warning("No trained models found")
                return False
                
        except Exception as e:
            logger.error(f"Failed to load performance predictor models: {e}")
            return False
    
    def save_model(self) -> bool:
        """Save trained models to disk"""
        try:
            model_dir = self._get_model_dir()
            os.makedirs(model_dir, exist_ok=True)
            
            # Save Prophet models
            joblib.dump(self.prophet_models, 
                       os.path.join(model_dir, f"{self.model_name}_prophet.pkl"))
            
            # Save LightGBM models
            joblib.dump(self.lgb_models, 
                       os.path.join(model_dir, f"{self.model_name}_lgb.pkl"))
            
            # Save Random Forest models
            joblib.dump(self.rf_models, 
                       os.path.join(model_dir, f"{self.model_name}_rf.pkl"))
            
            # Save scalers and encoders
            joblib.dump(self.scalers, 
                       os.path.join(model_dir, f"{self.model_name}_scalers.pkl"))
            joblib.dump(self.encoders, 
                       os.path.join(model_dir, f"{self.model_name}_encoders.pkl"))
            
            # Save model metrics
            joblib.dump(self.model_metrics, 
                       os.path.join(model_dir, f"{self.model_name}_metrics.pkl"))
            
            logger.info("Performance predictor models saved successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save performance predictor models: {e}")
            return False
    
    def train(self, df: pd.DataFrame, validation_split: float = 0.2) -> Dict[str, Any]:
        """
        Train the performance prediction models
        
        Args:
            df: DataFrame with historical campaign metrics
            validation_split: Fraction of data to use for validation
            
        Returns:
            Dictionary with training results and metrics
        """
        try:
            logger.info("Starting performance predictor training...")
            
            # Prepare data
            df_processed = self._prepare_training_data(df)
            
            if len(df_processed) < 30:
                raise ValueError("Insufficient data for training (minimum 30 days required)")
            
            # Split data for validation
            train_size = int(len(df_processed) * (1 - validation_split))
            df_train = df_processed.iloc[:train_size].copy()
            df_val = df_processed.iloc[train_size:].copy()
            
            training_results = {}
            
            # Train models for each metric
            for metric in self.target_metrics:
                if metric not in df_processed.columns:
                    logger.warning(f"Metric {metric} not found in data, skipping...")
                    continue
                    
                logger.info(f"Training models for {metric}...")
                
                # Train Prophet model
                prophet_results = self._train_prophet(df_train, df_val, metric)
                
                # Train LightGBM model
                lgb_results = self._train_lightgbm(df_train, df_val, metric)
                
                # Train Random Forest model
                rf_results = self._train_random_forest(df_train, df_val, metric)
                
                # Combine results
                training_results[metric] = {
                    'prophet': prophet_results,
                    'lightgbm': lgb_results,
                    'random_forest': rf_results
                }
            
            # Calculate ensemble metrics
            ensemble_metrics = self._calculate_ensemble_metrics(df_val)
            training_results['ensemble'] = ensemble_metrics
            
            self.model_metrics = training_results
            self.is_trained = True
            self.last_trained = datetime.now()
            
            # Save models
            self.save_model()
            
            logger.info("Performance predictor training completed successfully")
            
            return {
                'success': True,
                'metrics': training_results,
                'training_samples': len(df_train),
                'validation_samples': len(df_val),
                'features_used': self.feature_columns,
                'model_version': self.version
            }
            
        except Exception as e:
            logger.error(f"Performance predictor training failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def predict(self, df: pd.DataFrame, days: int = 30, 
                platform: str = 'UNKNOWN', campaign_info: Dict = None) -> Dict[str, Any]:
        """
        Predict campaign performance for future periods
        
        Args:
            df: Historical metrics DataFrame
            days: Number of days to predict
            platform: Platform name for context
            campaign_info: Additional campaign information
            
        Returns:
            Dictionary with predictions and metadata
        """
        try:
            if not self.is_trained:
                if not self.load_model():
                    raise ValueError("No trained models available")
            
            # Prepare data
            df_processed = self._prepare_prediction_data(df, platform, campaign_info)
            
            # Generate future dates
            last_date = df_processed['date'].max()
            future_dates = pd.date_range(
                start=last_date + timedelta(days=1),
                periods=days,
                freq='D'
            )
            
            predictions = {}
            confidence_scores = {}
            
            # Make predictions for each metric
            for metric in self.target_metrics:
                if metric not in self.lgb_models:
                    logger.warning(f"No trained model for {metric}, using fallback...")
                    predictions[metric] = self._fallback_prediction(df_processed, metric, days)
                    confidence_scores[metric] = 0.3
                    continue
                
                # Get ensemble predictions
                prophet_pred = self._predict_prophet(df_processed, metric, days)
                lgb_pred = self._predict_lightgbm(df_processed, metric, days, future_dates)
                rf_pred = self._predict_random_forest(df_processed, metric, days, future_dates)
                
                # Ensemble prediction (weighted average)
                weights = self._get_model_weights(metric)
                ensemble_pred = (
                    weights['prophet'] * prophet_pred +
                    weights['lightgbm'] * lgb_pred +
                    weights['random_forest'] * rf_pred
                )
                
                # Apply constraints and smoothing
                ensemble_pred = self._apply_prediction_constraints(
                    ensemble_pred, metric, df_processed
                )
                
                predictions[metric] = ensemble_pred
                confidence_scores[metric] = self._calculate_confidence(metric, df_processed)
            
            # Generate insights and recommendations
            insights = self._generate_insights(df_processed, predictions, platform)
            
            return {
                'dates': future_dates.tolist(),
                'spend': predictions.get('spend', []),
                'clicks': predictions.get('clicks', []),
                'conversions': predictions.get('conversions', []),
                'roas': predictions.get('roas', []),
                'confidence': np.mean(list(confidence_scores.values())),
                'confidence_by_metric': confidence_scores,
                'factors': insights['factors'],
                'recommendations': insights['recommendations'],
                'model_version': self.version,
                'prediction_date': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Performance prediction failed: {e}")
            raise
    
    def _prepare_training_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Prepare data for training with feature engineering"""
        df = df.copy()
        
        # Convert date column
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date').reset_index(drop=True)
        
        # Basic feature engineering
        df = self._add_time_features(df)
        df = self._add_rolling_features(df)
        df = self._add_trend_features(df)
        
        # Handle categorical features
        df = self._encode_categorical_features(df)
        
        # Handle missing values
        df = df.fillna(method='ffill').fillna(0)
        
        return df
    
    def _prepare_prediction_data(self, df: pd.DataFrame, platform: str, 
                                campaign_info: Dict) -> pd.DataFrame:
        """Prepare data for prediction"""
        df = df.copy()
        
        # Convert date column
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date').reset_index(drop=True)
        
        # Add platform information
        df['platform'] = platform
        
        # Add campaign information if available
        if campaign_info:
            df['objective'] = campaign_info.get('objective', 'unknown')
            df['budget'] = campaign_info.get('budget', 0)
        
        # Feature engineering
        df = self._add_time_features(df)
        df = self._add_rolling_features(df)
        df = self._add_trend_features(df)
        
        # Encode categorical features using existing encoders
        df = self._encode_categorical_features(df, training=False)
        
        # Handle missing values
        df = df.fillna(method='ffill').fillna(0)
        
        return df
    
    def _add_time_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add time-based features"""
        df['day_of_week'] = df['date'].dt.dayofweek
        df['day_of_month'] = df['date'].dt.day
        df['month'] = df['date'].dt.month
        df['quarter'] = df['date'].dt.quarter
        df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
        
        # Simple holiday detection (can be improved with holiday calendar)
        df['is_holiday'] = 0  # Placeholder
        
        return df
    
    def _add_rolling_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add rolling statistics features"""
        for metric in ['spend', 'clicks', 'conversions', 'roas']:
            if metric in df.columns:
                df[f'rolling_mean_7d'] = df[metric].rolling(window=7, min_periods=1).mean()
                df[f'rolling_mean_14d'] = df[metric].rolling(window=14, min_periods=1).mean()
                df[f'rolling_std_7d'] = df[metric].rolling(window=7, min_periods=1).std().fillna(0)
                break
        
        return df
    
    def _add_trend_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add trend and seasonality features"""
        if 'spend' in df.columns:
            # Simple trend calculation
            df['trend'] = df['spend'].rolling(window=7, min_periods=1).apply(
                lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) > 1 else 0
            )
            
            # Seasonality strength (simplified)
            df['seasonality_strength'] = df['spend'].rolling(window=14, min_periods=1).std() / \
                                       df['spend'].rolling(window=14, min_periods=1).mean()
            df['seasonality_strength'] = df['seasonality_strength'].fillna(0)
        
        return df
    
    def _encode_categorical_features(self, df: pd.DataFrame, training: bool = True) -> pd.DataFrame:
        """Encode categorical features"""
        categorical_cols = ['platform', 'objective']
        
        for col in categorical_cols:
            if col in df.columns:
                if training:
                    if col not in self.encoders:
                        self.encoders[col] = LabelEncoder()
                    df[f'{col}_encoded'] = self.encoders[col].fit_transform(df[col].astype(str))
                else:
                    if col in self.encoders:
                        # Handle unknown categories
                        known_categories = set(self.encoders[col].classes_)
                        df[col] = df[col].astype(str)
                        df[col] = df[col].apply(lambda x: x if x in known_categories else 'unknown')
                        
                        # Add 'unknown' to encoder if not present
                        if 'unknown' not in known_categories:
                            classes = list(self.encoders[col].classes_) + ['unknown']
                            self.encoders[col].classes_ = np.array(classes)
                        
                        df[f'{col}_encoded'] = self.encoders[col].transform(df[col])
                    else:
                        df[f'{col}_encoded'] = 0
        
        return df
    
    def _train_prophet(self, df_train: pd.DataFrame, df_val: pd.DataFrame, 
                      metric: str) -> Dict[str, Any]:
        """Train Prophet model for time series forecasting"""
        try:
            # Prepare data for Prophet
            prophet_df = df_train[['date', metric]].rename(columns={'date': 'ds', metric: 'y'})
            
            # Initialize and train Prophet
            model = Prophet(
                yearly_seasonality=True,
                weekly_seasonality=True,
                daily_seasonality=False,
                changepoint_prior_scale=0.05,
                seasonality_prior_scale=10.0
            )
            
            model.fit(prophet_df)
            
            # Validate
            val_prophet_df = df_val[['date']].rename(columns={'date': 'ds'})
            val_pred = model.predict(val_prophet_df)
            
            # Calculate metrics
            mae = mean_absolute_error(df_val[metric], val_pred['yhat'])
            rmse = np.sqrt(mean_squared_error(df_val[metric], val_pred['yhat']))
            
            # Store model
            self.prophet_models[metric] = model
            
            return {
                'mae': mae,
                'rmse': rmse,
                'trained': True
            }
            
        except Exception as e:
            logger.error(f"Prophet training failed for {metric}: {e}")
            return {'trained': False, 'error': str(e)}
    
    def _train_lightgbm(self, df_train: pd.DataFrame, df_val: pd.DataFrame, 
                       metric: str) -> Dict[str, Any]:
        """Train LightGBM model"""
        try:
            # Prepare features
            feature_cols = [col for col in self.feature_columns if col in df_train.columns]
            
            X_train = df_train[feature_cols]
            y_train = df_train[metric]
            X_val = df_val[feature_cols]
            y_val = df_val[metric]
            
            # Scale features
            if metric not in self.scalers:
                self.scalers[metric] = StandardScaler()
            
            X_train_scaled = self.scalers[metric].fit_transform(X_train)
            X_val_scaled = self.scalers[metric].transform(X_val)
            
            # Train model
            train_data = lgb.Dataset(X_train_scaled, label=y_train)
            val_data = lgb.Dataset(X_val_scaled, label=y_val, reference=train_data)
            
            model = lgb.train(
                self.lgb_params,
                train_data,
                valid_sets=[val_data],
                num_boost_round=1000,
                callbacks=[lgb.early_stopping(stopping_rounds=50), lgb.log_evaluation(0)]
            )
            
            # Validate
            val_pred = model.predict(X_val_scaled)
            
            # Calculate metrics
            mae = mean_absolute_error(y_val, val_pred)
            rmse = np.sqrt(mean_squared_error(y_val, val_pred))
            r2 = r2_score(y_val, val_pred)
            
            # Store model
            self.lgb_models[metric] = model
            
            return {
                'mae': mae,
                'rmse': rmse,
                'r2': r2,
                'trained': True
            }
            
        except Exception as e:
            logger.error(f"LightGBM training failed for {metric}: {e}")
            return {'trained': False, 'error': str(e)}
    
    def _train_random_forest(self, df_train: pd.DataFrame, df_val: pd.DataFrame, 
                           metric: str) -> Dict[str, Any]:
        """Train Random Forest model"""
        try:
            # Prepare features
            feature_cols = [col for col in self.feature_columns if col in df_train.columns]
            
            X_train = df_train[feature_cols]
            y_train = df_train[metric]
            X_val = df_val[feature_cols]
            y_val = df_val[metric]
            
            # Train model
            model = RandomForestRegressor(**self.rf_params)
            model.fit(X_train, y_train)
            
            # Validate
            val_pred = model.predict(X_val)
            
            # Calculate metrics
            mae = mean_absolute_error(y_val, val_pred)
            rmse = np.sqrt(mean_squared_error(y_val, val_pred))
            r2 = r2_score(y_val, val_pred)
            
            # Store model
            self.rf_models[metric] = model
            
            return {
                'mae': mae,
                'rmse': rmse,
                'r2': r2,
                'feature_importance': dict(zip(feature_cols, model.feature_importances_)),
                'trained': True
            }
            
        except Exception as e:
            logger.error(f"Random Forest training failed for {metric}: {e}")
            return {'trained': False, 'error': str(e)}
    
    def _predict_prophet(self, df: pd.DataFrame, metric: str, days: int) -> np.ndarray:
        """Make predictions using Prophet model"""
        try:
            if metric not in self.prophet_models:
                return np.zeros(days)
            
            model = self.prophet_models[metric]
            
            # Create future dataframe
            last_date = df['date'].max()
            future_dates = pd.date_range(
                start=last_date + timedelta(days=1),
                periods=days,
                freq='D'
            )
            future_df = pd.DataFrame({'ds': future_dates})
            
            # Make prediction
            forecast = model.predict(future_df)
            
            return np.maximum(forecast['yhat'].values, 0)  # Ensure non-negative
            
        except Exception as e:
            logger.error(f"Prophet prediction failed for {metric}: {e}")
            return np.zeros(days)
    
    def _predict_lightgbm(self, df: pd.DataFrame, metric: str, days: int, 
                         future_dates: pd.DatetimeIndex) -> np.ndarray:
        """Make predictions using LightGBM model"""
        try:
            if metric not in self.lgb_models or metric not in self.scalers:
                return np.zeros(days)
            
            model = self.lgb_models[metric]
            scaler = self.scalers[metric]
            
            predictions = []
            current_df = df.copy()
            
            # Iterative prediction for each future day
            for i, future_date in enumerate(future_dates):
                # Create feature row for prediction
                feature_row = self._create_future_features(current_df, future_date, i)
                
                # Scale features
                feature_cols = [col for col in self.feature_columns if col in feature_row.columns]
                X_pred = scaler.transform(feature_row[feature_cols].values.reshape(1, -1))
                
                # Make prediction
                pred = model.predict(X_pred)[0]
                pred = max(pred, 0)  # Ensure non-negative
                
                predictions.append(pred)
                
                # Add prediction to current_df for next iteration
                new_row = feature_row.copy()
                new_row[metric] = pred
                current_df = pd.concat([current_df, new_row], ignore_index=True)
            
            return np.array(predictions)
            
        except Exception as e:
            logger.error(f"LightGBM prediction failed for {metric}: {e}")
            return np.zeros(days)
    
    def _predict_random_forest(self, df: pd.DataFrame, metric: str, days: int, 
                              future_dates: pd.DatetimeIndex) -> np.ndarray:
        """Make predictions using Random Forest model"""
        try:
            if metric not in self.rf_models:
                return np.zeros(days)
            
            model = self.rf_models[metric]
            
            predictions = []
            current_df = df.copy()
            
            # Iterative prediction for each future day
            for i, future_date in enumerate(future_dates):
                # Create feature row for prediction
                feature_row = self._create_future_features(current_df, future_date, i)
                
                # Make prediction
                feature_cols = [col for col in self.feature_columns if col in feature_row.columns]
                pred = model.predict(feature_row[feature_cols].values.reshape(1, -1))[0]
                pred = max(pred, 0)  # Ensure non-negative
                
                predictions.append(pred)
                
                # Add prediction to current_df for next iteration
                new_row = feature_row.copy()
                new_row[metric] = pred
                current_df = pd.concat([current_df, new_row], ignore_index=True)
            
            return np.array(predictions)
            
        except Exception as e:
            logger.error(f"Random Forest prediction failed for {metric}: {e}")
            return np.zeros(days)
    
    def _create_future_features(self, df: pd.DataFrame, future_date: pd.Timestamp, 
                               day_index: int) -> pd.DataFrame:
        """Create feature row for future date prediction"""
        # Get last row as template
        last_row = df.iloc[-1:].copy()
        
        # Update date
        last_row['date'] = future_date
        
        # Update time features
        last_row['day_of_week'] = future_date.dayofweek
        last_row['day_of_month'] = future_date.day
        last_row['month'] = future_date.month
        last_row['quarter'] = future_date.quarter
        last_row['is_weekend'] = int(future_date.dayofweek >= 5)
        
        # Update rolling features (use recent data)
        recent_data = df.tail(14)  # Last 14 days
        if 'spend' in recent_data.columns:
            last_row['rolling_mean_7d'] = recent_data['spend'].tail(7).mean()
            last_row['rolling_mean_14d'] = recent_data['spend'].mean()
            last_row['rolling_std_7d'] = recent_data['spend'].tail(7).std()
        
        # Update trend (simplified)
        if len(df) >= 7:
            recent_spend = df['spend'].tail(7).values if 'spend' in df.columns else [0] * 7
            last_row['trend'] = np.polyfit(range(len(recent_spend)), recent_spend, 1)[0]
        
        return last_row
    
    def _get_model_weights(self, metric: str) -> Dict[str, float]:
        """Get ensemble weights for different models"""
        # Default weights (can be optimized based on validation performance)
        default_weights = {
            'prophet': 0.3,
            'lightgbm': 0.5,
            'random_forest': 0.2
        }
        
        # Adjust weights based on model performance if available
        if metric in self.model_metrics:
            # This could be improved with more sophisticated weight optimization
            return default_weights
        
        return default_weights
    
    def _apply_prediction_constraints(self, predictions: np.ndarray, metric: str, 
                                    df: pd.DataFrame) -> np.ndarray:
        """Apply constraints and smoothing to predictions"""
        # Ensure non-negative values
        predictions = np.maximum(predictions, 0)
        
        # Apply metric-specific constraints
        if metric == 'roas':
            # ROAS shouldn't exceed reasonable bounds
            predictions = np.minimum(predictions, 20.0)
        elif metric == 'ctr':
            # CTR shouldn't exceed 100%
            predictions = np.minimum(predictions, 100.0)
        
        # Apply smoothing to reduce volatility
        if len(predictions) > 3:
            from scipy.signal import savgol_filter
            window_length = min(5, len(predictions) if len(predictions) % 2 == 1 else len(predictions) - 1)
            if window_length >= 3:
                predictions = savgol_filter(predictions, window_length, 2)
        
        return predictions
    
    def _calculate_confidence(self, metric: str, df: pd.DataFrame) -> float:
        """Calculate prediction confidence based on model performance and data quality"""
        base_confidence = 0.7
        
        # Adjust based on data quality
        if len(df) < 14:
            base_confidence *= 0.7  # Less data = lower confidence
        elif len(df) < 30:
            base_confidence *= 0.85
        
        # Adjust based on model performance
        if metric in self.model_metrics:
            model_perf = self.model_metrics[metric]
            if 'lightgbm' in model_perf and 'r2' in model_perf['lightgbm']:
                r2_score = model_perf['lightgbm']['r2']
                base_confidence *= (0.5 + 0.5 * max(r2_score, 0))
        
        # Adjust based on data variance
        if metric in df.columns:
            cv = df[metric].std() / (df[metric].mean() + 1e-6)  # Coefficient of variation
            if cv > 1.0:  # High variance
                base_confidence *= 0.8
        
        return min(max(base_confidence, 0.1), 0.95)
    
    def _fallback_prediction(self, df: pd.DataFrame, metric: str, days: int) -> np.ndarray:
        """Fallback prediction method when no trained model is available"""
        if metric not in df.columns or len(df) == 0:
            return np.zeros(days)
        
        # Simple trend-based prediction
        recent_values = df[metric].tail(7).values
        if len(recent_values) == 0:
            return np.zeros(days)
        
        # Calculate trend
        if len(recent_values) > 1:
            trend = np.polyfit(range(len(recent_values)), recent_values, 1)[0]
        else:
            trend = 0
        
        # Generate predictions
        last_value = recent_values[-1]
        predictions = []
        
        for i in range(days):
            pred = last_value + trend * (i + 1)
            pred = max(pred, 0)  # Ensure non-negative
            predictions.append(pred)
        
        return np.array(predictions)
    
    def _generate_insights(self, df: pd.DataFrame, predictions: Dict[str, np.ndarray], 
                          platform: str) -> Dict[str, Any]:
        """Generate insights and recommendations based on predictions"""
        insights = {
            'factors': [],
            'recommendations': []
        }
        
        try:
            # Analyze trends in historical data
            if 'spend' in df.columns and len(df) >= 7:
                recent_spend = df['spend'].tail(7).mean()
                older_spend = df['spend'].head(7).mean() if len(df) >= 14 else recent_spend
                
                spend_change = (recent_spend - older_spend) / (older_spend + 1e-6) * 100
                
                insights['factors'].append({
                    'name': 'Recent Spend Trend',
                    'impact': min(abs(spend_change), 100),
                    'description': f"Spend has {'increased' if spend_change > 0 else 'decreased'} by {abs(spend_change):.1f}% recently"
                })
            
            # Analyze predicted trends
            if 'roas' in predictions and len(predictions['roas']) > 0:
                predicted_roas = np.mean(predictions['roas'])
                if predicted_roas < 1.0:
                    insights['recommendations'].append(
                        "Predicted ROAS is below 1.0. Consider optimizing targeting or creative."
                    )
                elif predicted_roas > 3.0:
                    insights['recommendations'].append(
                        "Strong ROAS predicted. Consider increasing budget to scale performance."
                    )
            
            # Platform-specific recommendations
            if platform == 'GOOGLE_ADS':
                insights['recommendations'].append(
                    "Consider testing automated bidding strategies for Google Ads campaigns."
                )
            elif platform == 'FACEBOOK_ADS':
                insights['recommendations'].append(
                    "Monitor audience fatigue and refresh creative assets regularly."
                )
            
            # Seasonality insights
            if len(df) >= 30:
                day_of_week_performance = df.groupby(df['date'].dt.dayofweek)['spend'].mean()
                best_day = day_of_week_performance.idxmax()
                insights['factors'].append({
                    'name': 'Day of Week Effect',
                    'impact': 20,
                    'description': f"Best performing day is {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][best_day]}"
                })
        
        except Exception as e:
            logger.error(f"Error generating insights: {e}")
        
        return insights
    
    def _calculate_ensemble_metrics(self, df_val: pd.DataFrame) -> Dict[str, Any]:
        """Calculate ensemble model performance metrics"""
        ensemble_metrics = {}
        
        for metric in self.target_metrics:
            if metric not in df_val.columns:
                continue
                
            # Get predictions from all models
            prophet_pred = self._predict_prophet(df_val, metric, len(df_val))
            
            # For simplicity, we'll use the Prophet predictions for ensemble evaluation
            # In a full implementation, you would combine all model predictions
            
            if len(prophet_pred) == len(df_val):
                mae = mean_absolute_error(df_val[metric], prophet_pred)
                rmse = np.sqrt(mean_squared_error(df_val[metric], prophet_pred))
                
                ensemble_metrics[metric] = {
                    'mae': mae,
                    'rmse': rmse
                }
        
        return ensemble_metrics
    
    def get_feature_importance(self) -> Dict[str, Dict[str, float]]:
        """Get feature importance for Random Forest models"""
        importance = {}
        
        for metric, model in self.rf_models.items():
            if hasattr(model, 'feature_importances_'):
                feature_cols = [col for col in self.feature_columns if col in self.rf_models]
                importance[metric] = dict(zip(feature_cols, model.feature_importances_))
        
        return importance
    
    def get_accuracy(self) -> Optional[float]:
        """Get overall model accuracy"""
        if not self.model_metrics:
            return None
        
        r2_scores = []
        for metric_results in self.model_metrics.values():
            if isinstance(metric_results, dict) and 'lightgbm' in metric_results:
                lgb_results = metric_results['lightgbm']
                if 'r2' in lgb_results:
                    r2_scores.append(lgb_results['r2'])
        
        return np.mean(r2_scores) if r2_scores else None