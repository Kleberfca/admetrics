#!/usr/bin/env python3
"""
Time series forecasting model for campaign metrics
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple, Union
import logging
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.arima.model import ARIMA
from sklearn.preprocessing import StandardScaler
from prophet import Prophet
import warnings
warnings.filterwarnings('ignore')

logger = logging.getLogger(__name__)


class Forecaster:
    """Forecast campaign metrics using time series models"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize forecaster"""
        self.config = config or self._get_default_config()
        self.models = {}
        self.scalers = {}
        self.model_performance = {}
        
    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration"""
        return {
            'algorithms': ['prophet', 'arima', 'exponential_smoothing'],
            'forecast_periods': 30,
            'confidence_interval': 0.95,
            'seasonality_mode': 'multiplicative',
            'yearly_seasonality': 'auto',
            'weekly_seasonality': 'auto',
            'daily_seasonality': 'auto',
            'min_data_points': 30,
            'test_size': 0.2
        }
    
    def is_loaded(self) -> bool:
        """Check if models are loaded"""
        return len(self.models) > 0
    
    def forecast(self, historical_data: pd.DataFrame, 
                metric: str,
                periods: Optional[int] = None) -> Dict[str, Any]:
        """Forecast future values for a metric"""
        try:
            periods = periods or self.config['forecast_periods']
            
            # Prepare data
            prepared_data = self._prepare_time_series_data(historical_data, metric)
            
            if len(prepared_data) < self.config['min_data_points']:
                return self._get_insufficient_data_result(metric, len(prepared_data))
            
            # Try multiple algorithms
            forecasts = {}
            model_scores = {}
            
            for algorithm in self.config['algorithms']:
                try:
                    if algorithm == 'prophet':
                        forecast_result = self._forecast_with_prophet(prepared_data, metric, periods)
                    elif algorithm == 'arima':
                        forecast_result = self._forecast_with_arima(prepared_data, metric, periods)
                    elif algorithm == 'exponential_smoothing':
                        forecast_result = self._forecast_with_exp_smoothing(prepared_data, metric, periods)
                    else:
                        continue
                    
                    if forecast_result:
                        forecasts[algorithm] = forecast_result
                        model_scores[algorithm] = forecast_result.get('model_score', 0)
                
                except Exception as e:
                    logger.warning(f"Failed to forecast with {algorithm}: {e}")
                    continue
            
            if not forecasts:
                return self._get_error_forecast_result(metric, "All forecasting methods failed")
            
            # Select best model
            best_model = max(model_scores.items(), key=lambda x: x[1])[0]
            best_forecast = forecasts[best_model]
            
            # Ensemble forecast (average of all models)
            ensemble_forecast = self._create_ensemble_forecast(forecasts)
            
            # Add insights
            insights = self._generate_forecast_insights(
                prepared_data, best_forecast, metric
            )
            
            return {
                'metric': metric,
                'periods': periods,
                'best_model': best_model,
                'forecast': best_forecast['forecast'],
                'ensemble_forecast': ensemble_forecast,
                'all_forecasts': forecasts,
                'insights': insights,
                'historical_summary': self._summarize_historical_data(prepared_data, metric),
                'trend_analysis': self._analyze_trend(prepared_data, metric)
            }
            
        except Exception as e:
            logger.error(f"Error forecasting {metric}: {e}")
            return self._get_error_forecast_result(metric, str(e))
    
    def forecast_multiple_metrics(self, historical_data: pd.DataFrame,
                                metrics: List[str],
                                periods: Optional[int] = None) -> Dict[str, Any]:
        """Forecast multiple metrics"""
        results = {}
        
        for metric in metrics:
            if metric in historical_data.columns:
                results[metric] = self.forecast(historical_data, metric, periods)
        
        # Generate combined insights
        combined_insights = self._generate_combined_insights(results)
        
        return {
            'forecasts': results,
            'combined_insights': combined_insights,
            'summary': self._create_forecast_summary(results)
        }
    
    def _prepare_time_series_data(self, data: pd.DataFrame, metric: str) -> pd.DataFrame:
        """Prepare data for time series forecasting"""
        if metric not in data.columns:
            raise ValueError(f"Metric '{metric}' not found in data")
        
        # Ensure we have date column
        if 'date' not in data.columns:
            data['date'] = pd.date_range(end=pd.Timestamp.now(), periods=len(data), freq='D')
        
        # Select relevant columns
        ts_data = data[['date', metric]].copy()
        ts_data['date'] = pd.to_datetime(ts_data['date'])
        ts_data = ts_data.sort_values('date')
        
        # Handle missing values
        ts_data[metric] = ts_data[metric].fillna(method='ffill').fillna(0)
        
        # Remove duplicates
        ts_data = ts_data.drop_duplicates(subset=['date'], keep='last')
        
        # Resample to daily frequency
        ts_data = ts_data.set_index('date').resample('D').sum().reset_index()
        
        return ts_data
    
    def _forecast_with_prophet(self, data: pd.DataFrame, metric: str, periods: int) -> Dict[str, Any]:
        """Forecast using Facebook Prophet"""
        # Prepare data for Prophet
        prophet_data = data.rename(columns={'date': 'ds', metric: 'y'})
        
        # Split train/test
        train_size = int(len(prophet_data) * (1 - self.config['test_size']))
        train_data = prophet_data[:train_size]
        test_data = prophet_data[train_size:]
        
        # Initialize and fit Prophet
        model = Prophet(
            yearly_seasonality=self.config['yearly_seasonality'],
            weekly_seasonality=self.config['weekly_seasonality'],
            daily_seasonality=self.config['daily_seasonality'],
            seasonality_mode=self.config['seasonality_mode'],
            interval_width=self.config['confidence_interval']
        )
        
        # Add custom seasonalities if needed
        if len(train_data) > 365:
            model.add_seasonality(name='monthly', period=30.5, fourier_order=5)
        
        model.fit(train_data)
        
        # Make future dataframe
        future = model.make_future_dataframe(periods=periods + len(test_data))
        forecast = model.predict(future)
        
        # Evaluate on test set
        test_forecast = forecast[train_size:train_size + len(test_data)]
        mape = self._calculate_mape(test_data['y'].values, test_forecast['yhat'].values)
        
        # Get forecast for future periods
        future_forecast = forecast[-periods:]
        
        return {
            'forecast': future_forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].to_dict('records'),
            'model_score': 1 - mape,  # Convert MAPE to score
            'metrics': {
                'mape': mape,
                'rmse': self._calculate_rmse(test_data['y'].values, test_forecast['yhat'].values)
            },
            'components': {
                'trend': forecast['trend'].iloc[-1],
                'weekly': forecast.get('weekly', pd.Series([0])).iloc[-1] if 'weekly' in forecast.columns else 0,
                'yearly': forecast.get('yearly', pd.Series([0])).iloc[-1] if 'yearly' in forecast.columns else 0
            }
        }
    
    def _forecast_with_arima(self, data: pd.DataFrame, metric: str, periods: int) -> Dict[str, Any]:
        """Forecast using ARIMA"""
        # Prepare data
        ts_data = data.set_index('date')[metric]
        
        # Split train/test
        train_size = int(len(ts_data) * (1 - self.config['test_size']))
        train_data = ts_data[:train_size]
        test_data = ts_data[train_size:]
        
        # Fit ARIMA model with auto-selection of parameters
        try:
            # Simple ARIMA(1,1,1) for now
            model = ARIMA(train_data, order=(1, 1, 1))
            fitted_model = model.fit()
            
            # Forecast
            forecast = fitted_model.forecast(steps=len(test_data) + periods)
            test_forecast = forecast[:len(test_data)]
            future_forecast = forecast[-periods:]
            
            # Calculate metrics
            mape = self._calculate_mape(test_data.values, test_forecast.values)
            
            # Create forecast dataframe
            future_dates = pd.date_range(
                start=data['date'].iloc[-1] + pd.Timedelta(days=1),
                periods=periods,
                freq='D'
            )
            
            # Simple confidence intervals (±2 std)
            std_error = np.std(fitted_model.resid)
            
            forecast_df = pd.DataFrame({
                'ds': future_dates,
                'yhat': future_forecast.values,
                'yhat_lower': future_forecast.values - 2 * std_error,
                'yhat_upper': future_forecast.values + 2 * std_error
            })
            
            return {
                'forecast': forecast_df.to_dict('records'),
                'model_score': 1 - mape,
                'metrics': {
                    'mape': mape,
                    'rmse': self._calculate_rmse(test_data.values, test_forecast.values),
                    'aic': fitted_model.aic
                }
            }
            
        except Exception as e:
            logger.warning(f"ARIMA failed: {e}")
            return None
    
    def _forecast_with_exp_smoothing(self, data: pd.DataFrame, metric: str, periods: int) -> Dict[str, Any]:
        """Forecast using Exponential Smoothing"""
        # Prepare data
        ts_data = data.set_index('date')[metric]
        
        # Ensure positive values for multiplicative models
        if ts_data.min() <= 0:
            ts_data = ts_data + abs(ts_data.min()) + 1
        
        # Split train/test
        train_size = int(len(ts_data) * (1 - self.config['test_size']))
        train_data = ts_data[:train_size]
        test_data = ts_data[train_size:]
        
        try:
            # Fit model
            model = ExponentialSmoothing(
                train_data,
                seasonal_periods=7,  # Weekly seasonality
                trend='add',
                seasonal='add' if len(train_data) > 14 else None
            )
            fitted_model = model.fit()
            
            # Forecast
            forecast = fitted_model.forecast(steps=len(test_data) + periods)
            test_forecast = forecast[:len(test_data)]
            future_forecast = forecast[-periods:]
            
            # Calculate metrics
            mape = self._calculate_mape(test_data.values, test_forecast.values)
            
            # Create forecast dataframe
            future_dates = pd.date_range(
                start=data['date'].iloc[-1] + pd.Timedelta(days=1),
                periods=periods,
                freq='D'
            )
            
            # Simple confidence intervals
            std_error = np.std(fitted_model.resid)
            
            forecast_df = pd.DataFrame({
                'ds': future_dates,
                'yhat': future_forecast.values,
                'yhat_lower': future_forecast.values - 2 * std_error,
                'yhat_upper': future_forecast.values + 2 * std_error
            })
            
            return {
                'forecast': forecast_df.to_dict('records'),
                'model_score': 1 - mape,
                'metrics': {
                    'mape': mape,
                    'rmse': self._calculate_rmse(test_data.values, test_forecast.values)
                }
            }
            
        except Exception as e:
            logger.warning(f"Exponential Smoothing failed: {e}")
            return None
    
    def _create_ensemble_forecast(self, forecasts: Dict[str, Dict]) -> List[Dict[str, Any]]:
        """Create ensemble forecast from multiple models"""
        if not forecasts:
            return []
        
        # Extract forecasts
        all_forecasts = []
        for model_name, forecast_data in forecasts.items():
            if 'forecast' in forecast_data:
                df = pd.DataFrame(forecast_data['forecast'])
                df['model'] = model_name
                all_forecasts.append(df)
        
        if not all_forecasts:
            return []
        
        # Combine forecasts
        combined_df = pd.concat(all_forecasts)
        
        # Calculate ensemble (simple average)
        ensemble = combined_df.groupby('ds').agg({
            'yhat': 'mean',
            'yhat_lower': 'mean',
            'yhat_upper': 'mean'
        }).reset_index()
        
        return ensemble.to_dict('records')
    
    def _analyze_trend(self, data: pd.DataFrame, metric: str) -> Dict[str, Any]:
        """Analyze trend in historical data"""
        values = data[metric].values
        dates = pd.to_datetime(data['date'])
        
        # Linear trend
        x = np.arange(len(values))
        coeffs = np.polyfit(x, values, 1)
        trend_slope = coeffs[0]
        
        # Moving averages
        ma_7 = pd.Series(values).rolling(7).mean().iloc[-1] if len(values) >= 7 else values[-1]
        ma_30 = pd.Series(values).rolling(30).mean().iloc[-1] if len(values) >= 30 else ma_7
        
        # Trend direction
        if trend_slope > 0.01:
            trend_direction = 'increasing'
        elif trend_slope < -0.01:
            trend_direction = 'decreasing'
        else:
            trend_direction = 'stable'
        
        # Volatility
        volatility = np.std(values) / np.mean(values) if np.mean(values) > 0 else 0
        
        return {
            'direction': trend_direction,
            'slope': float(trend_slope),
            'current_value': float(values[-1]),
            'ma_7_days': float(ma_7),
            'ma_30_days': float(ma_30),
            'volatility': float(volatility),
            'trend_strength': abs(trend_slope) / (np.std(values) + 1e-6)
        }
    
    def _generate_forecast_insights(self, historical_data: pd.DataFrame,
                                  forecast: Dict[str, Any],
                                  metric: str) -> List[str]:
        """Generate insights from forecast"""
        insights = []
        
        # Trend insights
        if 'components' in forecast:
            trend = forecast['components'].get('trend', 0)
            if trend > 0:
                insights.append(f"{metric} shows an upward trend")
            elif trend < 0:
                insights.append(f"{metric} shows a downward trend")
        
        # Forecast values
        forecast_data = forecast.get('forecast', [])
        if forecast_data:
            first_forecast = forecast_data[0]['yhat']
            last_forecast = forecast_data[-1]['yhat']
            current_value = historical_data[metric].iloc[-1]
            
            # Short-term change
            short_term_change = ((first_forecast - current_value) / current_value * 100) if current_value > 0 else 0
            if abs(short_term_change) > 10:
                insights.append(
                    f"{metric} expected to {'increase' if short_term_change > 0 else 'decrease'} "
                    f"by {abs(short_term_change):.1f}% in the next period"
                )
            
            # Long-term change
            long_term_change = ((last_forecast - current_value) / current_value * 100) if current_value > 0 else 0
            insights.append(
                f"30-day forecast: {metric} projected to reach {last_forecast:.2f} "
                f"({'+'if long_term_change > 0 else ''}{long_term_change:.1f}% from current)"
            )
        
        # Model performance
        if 'metrics' in forecast:
            mape = forecast['metrics'].get('mape', 1)
            if mape < 0.1:
                insights.append("High confidence forecast (error < 10%)")
            elif mape < 0.2:
                insights.append("Moderate confidence forecast (error < 20%)")
            else:
                insights.append("Lower confidence forecast - consider shorter forecast periods")
        
        # Seasonality insights
        if 'components' in forecast:
            weekly = abs(forecast['components'].get('weekly', 0))
            if weekly > 0.1:
                insights.append(f"{metric} shows strong weekly seasonality patterns")
        
        return insights
    
    def _summarize_historical_data(self, data: pd.DataFrame, metric: str) -> Dict[str, Any]:
        """Summarize historical data"""
        values = data[metric].values
        
        return {
            'mean': float(np.mean(values)),
            'median': float(np.median(values)),
            'std': float(np.std(values)),
            'min': float(np.min(values)),
            'max': float(np.max(values)),
            'recent_7_days_avg': float(np.mean(values[-7:])) if len(values) >= 7 else float(np.mean(values)),
            'recent_30_days_avg': float(np.mean(values[-30:])) if len(values) >= 30 else float(np.mean(values))
        }
    
    def _generate_combined_insights(self, results: Dict[str, Dict]) -> List[str]:
        """Generate insights from multiple metric forecasts"""
        insights = []
        
        # Identify correlated trends
        increasing_metrics = []
        decreasing_metrics = []
        
        for metric, result in results.items():
            if 'trend_analysis' in result:
                trend = result['trend_analysis']['direction']
                if trend == 'increasing':
                    increasing_metrics.append(metric)
                elif trend == 'decreasing':
                    decreasing_metrics.append(metric)
        
        if increasing_metrics:
            insights.append(f"Positive trends detected in: {', '.join(increasing_metrics)}")
        
        if decreasing_metrics:
            insights.append(f"Declining trends in: {', '.join(decreasing_metrics)} - review optimization strategies")
        
        # Cost efficiency insights
        if 'spend' in results and 'conversions' in results:
            spend_trend = results['spend'].get('trend_analysis', {}).get('direction')
            conv_trend = results['conversions'].get('trend_analysis', {}).get('direction')
            
            if spend_trend == 'increasing' and conv_trend != 'increasing':
                insights.append("⚠️ Spend increasing without proportional conversion growth")
            elif spend_trend == 'decreasing' and conv_trend == 'increasing':
                insights.append("✅ Improving efficiency: conversions growing while spend decreases")
        
        return insights
    
    def _create_forecast_summary(self, results: Dict[str, Dict]) -> Dict[str, Any]:
        """Create summary of all forecasts"""
        summary = {
            'metrics_forecasted': list(results.keys()),
            'forecast_period': self.config['forecast_periods'],
            'overall_outlook': self._determine_overall_outlook(results),
            'confidence_levels': {}
        }
        
        # Add confidence levels
        for metric, result in results.items():
            if 'best_model' in result and 'all_forecasts' in result:
                best_model = result['best_model']
                if best_model in result['all_forecasts']:
                    model_score = result['all_forecasts'][best_model].get('model_score', 0)
                    summary['confidence_levels'][metric] = {
                        'score': model_score,
                        'level': 'high' if model_score > 0.9 else 'medium' if model_score > 0.8 else 'low'
                    }
        
        return summary
    
    def _determine_overall_outlook(self, results: Dict[str, Dict]) -> str:
        """Determine overall outlook based on forecasts"""
        positive_trends = 0
        negative_trends = 0
        
        for metric, result in results.items():
            if 'trend_analysis' in result:
                direction = result['trend_analysis']['direction']
                if direction == 'increasing':
                    if metric in ['conversions', 'revenue', 'clicks']:
                        positive_trends += 1
                    elif metric in ['spend', 'cpc', 'cpa']:
                        negative_trends += 1
                elif direction == 'decreasing':
                    if metric in ['conversions', 'revenue', 'clicks']:
                        negative_trends += 1
                    elif metric in ['spend', 'cpc', 'cpa']:
                        positive_trends += 1
        
        if positive_trends > negative_trends:
            return 'positive'
        elif negative_trends > positive_trends:
            return 'negative'
        else:
            return 'neutral'
    
    def _calculate_mape(self, actual: np.ndarray, predicted: np.ndarray) -> float:
        """Calculate Mean Absolute Percentage Error"""
        mask = actual != 0
        if not np.any(mask):
            return 1.0
        
        mape = np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask]))
        return float(np.clip(mape, 0, 1))
    
    def _calculate_rmse(self, actual: np.ndarray, predicted: np.ndarray) -> float:
        """Calculate Root Mean Square Error"""
        return float(np.sqrt(np.mean((actual - predicted) ** 2)))
    
    def _get_insufficient_data_result(self, metric: str, data_points: int) -> Dict[str, Any]:
        """Return result for insufficient data"""
        return {
            'metric': metric,
            'error': 'insufficient_data',
            'message': f"Not enough data points ({data_points}) for forecasting. Minimum required: {self.config['min_data_points']}",
            'forecast': [],
            'insights': [f"Collect at least {self.config['min_data_points']} days of {metric} data for accurate forecasting"]
        }
    
    def _get_error_forecast_result(self, metric: str, error: str) -> Dict[str, Any]:
        """Return error result for forecasting"""
        return {
            'metric': metric,
            'error': error,
            'forecast': [],
            'insights': [f"Failed to forecast {metric}: {error}"]
        }