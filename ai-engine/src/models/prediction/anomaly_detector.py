#!/usr/bin/env python3
"""
Anomaly detection model for campaign metrics
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple, Union
import logging
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

logger = logging.getLogger(__name__)


class AnomalyDetector:
    """Detect anomalies in campaign metrics and prevent fraud"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize anomaly detector"""
        self.config = config or self._get_default_config()
        self.models = {}
        self.scalers = {}
        self.thresholds = {}
        self.historical_data = {}
        
    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration"""
        return {
            'algorithm': 'isolation_forest',
            'contamination': 0.1,
            'n_estimators': 100,
            'max_samples': 'auto',
            'threshold_multiplier': 2.5,
            'min_samples': 30,
            'seasonality_period': 7,  # Weekly seasonality
            'metrics': ['clicks', 'impressions', 'spend', 'conversions', 'ctr', 'cpc'],
            'random_state': 42
        }
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return len(self.models) > 0
    
    def detect(self, metrics_data: pd.DataFrame, 
               metric_type: str = 'all') -> Dict[str, List[Dict[str, Any]]]:
        """Detect anomalies in metrics data"""
        try:
            if metrics_data.empty:
                return self._get_empty_result()
            
            # Prepare data
            prepared_data = self._prepare_data(metrics_data)
            
            # Detect anomalies for each metric
            anomalies = {
                'critical': [],
                'warning': [],
                'info': []
            }
            
            metrics_to_check = self.config['metrics'] if metric_type == 'all' else [metric_type]
            
            for metric in metrics_to_check:
                if metric not in prepared_data.columns:
                    continue
                
                metric_anomalies = self._detect_metric_anomalies(prepared_data, metric)
                
                # Classify anomalies by severity
                for anomaly in metric_anomalies:
                    severity = self._classify_anomaly_severity(anomaly)
                    anomalies[severity].append(anomaly)
            
            # Detect multi-metric anomalies
            multi_anomalies = self._detect_multi_metric_anomalies(prepared_data)
            anomalies['critical'].extend(multi_anomalies)
            
            # Detect fraud patterns
            fraud_anomalies = self._detect_fraud_patterns(prepared_data)
            anomalies['critical'].extend(fraud_anomalies)
            
            # Generate insights
            insights = self._generate_anomaly_insights(anomalies, prepared_data)
            
            return {
                'anomalies': anomalies,
                'total_anomalies': sum(len(v) for v in anomalies.values()),
                'insights': insights,
                'metrics_analyzed': list(metrics_to_check),
                'time_range': {
                    'start': prepared_data['date'].min().isoformat() if 'date' in prepared_data else None,
                    'end': prepared_data['date'].max().isoformat() if 'date' in prepared_data else None
                }
            }
            
        except Exception as e:
            logger.error(f"Error detecting anomalies: {e}")
            return self._get_error_result(str(e))
    
    def train_models(self, historical_data: pd.DataFrame):
        """Train anomaly detection models on historical data"""
        try:
            logger.info("Training anomaly detection models")
            
            # Prepare data
            prepared_data = self._prepare_data(historical_data)
            
            # Train model for each metric
            for metric in self.config['metrics']:
                if metric not in prepared_data.columns:
                    continue
                
                # Extract features for the metric
                features = self._extract_features_for_metric(prepared_data, metric)
                
                if len(features) < self.config['min_samples']:
                    logger.warning(f"Insufficient data for training {metric} model")
                    continue
                
                # Scale features
                scaler = StandardScaler()
                features_scaled = scaler.fit_transform(features)
                self.scalers[metric] = scaler
                
                # Train isolation forest
                model = IsolationForest(
                    n_estimators=self.config['n_estimators'],
                    max_samples=self.config['max_samples'],
                    contamination=self.config['contamination'],
                    random_state=self.config['random_state']
                )
                model.fit(features_scaled)
                self.models[metric] = model
                
                # Calculate thresholds
                self._calculate_thresholds(prepared_data, metric)
            
            # Store historical data for reference
            self.historical_data = prepared_data
            
            logger.info(f"Trained models for {len(self.models)} metrics")
            
        except Exception as e:
            logger.error(f"Error training anomaly detection models: {e}")
            raise
    
    def _prepare_data(self, data: pd.DataFrame) -> pd.DataFrame:
        """Prepare data for anomaly detection"""
        df = data.copy()
        
        # Ensure date column
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')
        
        # Fill missing values
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        df[numeric_columns] = df[numeric_columns].fillna(0)
        
        # Calculate derived metrics if not present
        if 'ctr' not in df.columns and all(col in df.columns for col in ['clicks', 'impressions']):
            df['ctr'] = np.where(df['impressions'] > 0, df['clicks'] / df['impressions'], 0)
        
        if 'cpc' not in df.columns and all(col in df.columns for col in ['spend', 'clicks']):
            df['cpc'] = np.where(df['clicks'] > 0, df['spend'] / df['clicks'], 0)
        
        if 'cvr' not in df.columns and all(col in df.columns for col in ['conversions', 'clicks']):
            df['cvr'] = np.where(df['clicks'] > 0, df['conversions'] / df['clicks'], 0)
        
        return df
    
    def _detect_metric_anomalies(self, data: pd.DataFrame, metric: str) -> List[Dict[str, Any]]:
        """Detect anomalies for a specific metric"""
        anomalies = []
        
        # Statistical anomaly detection
        stat_anomalies = self._detect_statistical_anomalies(data, metric)
        anomalies.extend(stat_anomalies)
        
        # Model-based anomaly detection
        if metric in self.models:
            model_anomalies = self._detect_model_anomalies(data, metric)
            anomalies.extend(model_anomalies)
        
        # Pattern-based anomaly detection
        pattern_anomalies = self._detect_pattern_anomalies(data, metric)
        anomalies.extend(pattern_anomalies)
        
        # Remove duplicates
        seen = set()
        unique_anomalies = []
        for anomaly in anomalies:
            key = (anomaly['date'], anomaly['metric'], anomaly['type'])
            if key not in seen:
                seen.add(key)
                unique_anomalies.append(anomaly)
        
        return unique_anomalies
    
    def _detect_statistical_anomalies(self, data: pd.DataFrame, metric: str) -> List[Dict[str, Any]]:
        """Detect anomalies using statistical methods"""
        anomalies = []
        
        if metric not in data.columns:
            return anomalies
        
        values = data[metric].values
        dates = data['date'].values if 'date' in data.columns else range(len(values))
        
        # Z-score method
        z_scores = np.abs(stats.zscore(values))
        z_threshold = self.config['threshold_multiplier']
        
        z_anomalies = np.where(z_scores > z_threshold)[0]
        
        for idx in z_anomalies:
            anomalies.append({
                'date': pd.Timestamp(dates[idx]).isoformat() if isinstance(dates[idx], (pd.Timestamp, np.datetime64)) else str(dates[idx]),
                'metric': metric,
                'value': float(values[idx]),
                'expected_range': self._calculate_expected_range(values, idx),
                'z_score': float(z_scores[idx]),
                'type': 'statistical',
                'method': 'z_score',
                'description': f"{metric} value is {z_scores[idx]:.1f} standard deviations from mean"
            })
        
        # IQR method
        Q1 = np.percentile(values, 25)
        Q3 = np.percentile(values, 75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        iqr_anomalies = np.where((values < lower_bound) | (values > upper_bound))[0]
        
        for idx in iqr_anomalies:
            if idx not in z_anomalies:  # Avoid duplicates
                anomalies.append({
                    'date': pd.Timestamp(dates[idx]).isoformat() if isinstance(dates[idx], (pd.Timestamp, np.datetime64)) else str(dates[idx]),
                    'metric': metric,
                    'value': float(values[idx]),
                    'expected_range': [float(lower_bound), float(upper_bound)],
                    'type': 'statistical',
                    'method': 'iqr',
                    'description': f"{metric} value is outside interquartile range"
                })
        
        return anomalies
    
    def _detect_model_anomalies(self, data: pd.DataFrame, metric: str) -> List[Dict[str, Any]]:
        """Detect anomalies using trained models"""
        anomalies = []
        
        # Extract features
        features = self._extract_features_for_metric(data, metric)
        
        if len(features) == 0:
            return anomalies
        
        # Scale features
        if metric in self.scalers:
            features_scaled = self.scalers[metric].transform(features)
        else:
            return anomalies
        
        # Predict anomalies
        predictions = self.models[metric].predict(features_scaled)
        anomaly_scores = self.models[metric].score_samples(features_scaled)
        
        # Get anomaly indices (where prediction is -1)
        anomaly_indices = np.where(predictions == -1)[0]
        
        dates = data['date'].values if 'date' in data.columns else range(len(data))
        values = data[metric].values
        
        for idx in anomaly_indices:
            anomalies.append({
                'date': pd.Timestamp(dates[idx]).isoformat() if isinstance(dates[idx], (pd.Timestamp, np.datetime64)) else str(dates[idx]),
                'metric': metric,
                'value': float(values[idx]),
                'anomaly_score': float(anomaly_scores[idx]),
                'type': 'model',
                'method': 'isolation_forest',
                'description': f"Unusual pattern detected in {metric}"
            })
        
        return anomalies
    
    def _detect_pattern_anomalies(self, data: pd.DataFrame, metric: str) -> List[Dict[str, Any]]:
        """Detect anomalies based on patterns"""
        anomalies = []
        
        if metric not in data.columns:
            return anomalies
        
        values = data[metric].values
        dates = data['date'].values if 'date' in data.columns else range(len(values))
        
        # Sudden spikes/drops
        if len(values) > 1:
            changes = np.diff(values)
            pct_changes = np.where(values[:-1] > 0, changes / values[:-1], 0)
            
            # Detect large percentage changes
            spike_threshold = 2.0  # 200% change
            spike_indices = np.where(np.abs(pct_changes) > spike_threshold)[0]
            
            for idx in spike_indices:
                anomalies.append({
                    'date': pd.Timestamp(dates[idx + 1]).isoformat() if isinstance(dates[idx + 1], (pd.Timestamp, np.datetime64)) else str(dates[idx + 1]),
                    'metric': metric,
                    'value': float(values[idx + 1]),
                    'previous_value': float(values[idx]),
                    'change_percentage': float(pct_changes[idx] * 100),
                    'type': 'pattern',
                    'method': 'spike_detection',
                    'description': f"Sudden {'spike' if pct_changes[idx] > 0 else 'drop'} in {metric} ({pct_changes[idx]*100:.1f}% change)"
                })
        
        # Zero or negative values for metrics that should be positive
        positive_metrics = ['impressions', 'clicks', 'spend', 'conversions']
        if metric in positive_metrics:
            negative_indices = np.where(values <= 0)[0]
            
            for idx in negative_indices:
                # Skip if it's expected (e.g., no spend on paused campaigns)
                if metric == 'spend' and idx > 0 and values[idx-1] == 0:
                    continue
                
                anomalies.append({
                    'date': pd.Timestamp(dates[idx]).isoformat() if isinstance(dates[idx], (pd.Timestamp, np.datetime64)) else str(dates[idx]),
                    'metric': metric,
                    'value': float(values[idx]),
                    'type': 'pattern',
                    'method': 'value_validation',
                    'description': f"Invalid {metric} value (should be positive)"
                })
        
        # Impossible metric relationships
        if metric == 'ctr' and 'clicks' in data.columns and 'impressions' in data.columns:
            impossible_ctr = data[(data['clicks'] > data['impressions']) & (data['impressions'] > 0)]
            
            for idx, row in impossible_ctr.iterrows():
                anomalies.append({
                    'date': pd.Timestamp(row['date']).isoformat() if 'date' in row else str(idx),
                    'metric': 'clicks/impressions',
                    'value': {'clicks': float(row['clicks']), 'impressions': float(row['impressions'])},
                    'type': 'pattern',
                    'method': 'relationship_validation',
                    'description': "Clicks exceed impressions (impossible CTR)"
                })
        
        return anomalies
    
    def _detect_multi_metric_anomalies(self, data: pd.DataFrame) -> List[Dict[str, Any]]:
        """Detect anomalies across multiple metrics"""
        anomalies = []
        
        # Check for correlated anomalies
        if all(metric in data.columns for metric in ['clicks', 'impressions', 'spend']):
            for idx, row in data.iterrows():
                # High spend with no clicks
                if row['spend'] > 0 and row['clicks'] == 0 and row['impressions'] > 100:
                    anomalies.append({
                        'date': pd.Timestamp(row['date']).isoformat() if 'date' in row else str(idx),
                        'metric': 'multi_metric',
                        'value': {
                            'spend': float(row['spend']),
                            'clicks': float(row['clicks']),
                            'impressions': float(row['impressions'])
                        },
                        'type': 'multi_metric',
                        'method': 'correlation_check',
                        'description': "High spend with zero clicks despite impressions"
                    })
                
                # Abnormal CPC
                if row['clicks'] > 0:
                    cpc = row['spend'] / row['clicks']
                    if 'cpc' in self.thresholds and cpc > self.thresholds['cpc']['upper'] * 3:
                        anomalies.append({
                            'date': pd.Timestamp(row['date']).isoformat() if 'date' in row else str(idx),
                            'metric': 'cpc',
                            'value': float(cpc),
                            'type': 'multi_metric',
                            'method': 'derived_metric',
                            'description': f"Extremely high CPC: ${cpc:.2f}"
                        })
        
        return anomalies
    
    def _detect_fraud_patterns(self, data: pd.DataFrame) -> List[Dict[str, Any]]:
        """Detect potential fraud patterns"""
        anomalies = []
        
        # Click fraud patterns
        if all(metric in data.columns for metric in ['clicks', 'conversions', 'impressions']):
            for idx, row in data.iterrows():
                # Suspiciously high CTR
                if row['impressions'] > 0:
                    ctr = row['clicks'] / row['impressions']
                    if ctr > 0.5:  # 50% CTR is suspicious
                        anomalies.append({
                            'date': pd.Timestamp(row['date']).isoformat() if 'date' in row else str(idx),
                            'metric': 'fraud_detection',
                            'value': {'ctr': float(ctr), 'clicks': float(row['clicks']), 'impressions': float(row['impressions'])},
                            'type': 'fraud',
                            'method': 'click_fraud',
                            'description': f"Suspiciously high CTR ({ctr*100:.1f}%) - possible click fraud"
                        })
                
                # Zero conversion with high clicks
                if row['clicks'] > 100 and row['conversions'] == 0:
                    anomalies.append({
                        'date': pd.Timestamp(row['date']).isoformat() if 'date' in row else str(idx),
                        'metric': 'fraud_detection',
                        'value': {'clicks': float(row['clicks']), 'conversions': float(row['conversions'])},
                        'type': 'fraud',
                        'method': 'conversion_fraud',
                        'description': f"High clicks ({row['clicks']}) with zero conversions - possible bot traffic"
                    })
        
        # Time-based patterns
        if 'date' in data.columns and 'hour' in data.columns and 'clicks' in data.columns:
            # Group by hour
            hourly_clicks = data.groupby('hour')['clicks'].sum()
            
            # Check for unusual hourly patterns
            night_hours = [0, 1, 2, 3, 4, 5]
            night_clicks = hourly_clicks[hourly_clicks.index.isin(night_hours)].sum()
            total_clicks = hourly_clicks.sum()
            
            if total_clicks > 0:
                night_ratio = night_clicks / total_clicks
                if night_ratio > 0.4:  # More than 40% clicks at night
                    anomalies.append({
                        'date': 'various',
                        'metric': 'fraud_detection',
                        'value': {'night_clicks_ratio': float(night_ratio)},
                        'type': 'fraud',
                        'method': 'temporal_pattern',
                        'description': f"Unusual click pattern - {night_ratio*100:.1f}% of clicks during night hours"
                    })
        
        return anomalies
    
    def _extract_features_for_metric(self, data: pd.DataFrame, metric: str) -> np.ndarray:
        """Extract features for anomaly detection"""
        features = []
        
        if metric not in data.columns:
            return np.array([])
        
        values = data[metric].values
        
        # Basic value
        features.append(values.reshape(-1, 1))
        
        # Rolling statistics
        if len(values) > 7:
            rolling_mean = pd.Series(values).rolling(7, min_periods=1).mean().values
            rolling_std = pd.Series(values).rolling(7, min_periods=1).std().fillna(0).values
            features.append(rolling_mean.reshape(-1, 1))
            features.append(rolling_std.reshape(-1, 1))
        
        # Day of week effect
        if 'date' in data.columns:
            day_of_week = pd.to_datetime(data['date']).dt.dayofweek.values
            features.append(day_of_week.reshape(-1, 1))
        
        # Combine features
        if features:
            return np.hstack(features)
        else:
            return np.array([])
    
    def _calculate_thresholds(self, data: pd.DataFrame, metric: str):
        """Calculate dynamic thresholds for metrics"""
        if metric not in data.columns:
            return
        
        values = data[metric].values
        
        # Remove outliers for threshold calculation
        Q1 = np.percentile(values, 25)
        Q3 = np.percentile(values, 75)
        IQR = Q3 - Q1
        
        lower_fence = Q1 - 1.5 * IQR
        upper_fence = Q3 + 1.5 * IQR
        
        clean_values = values[(values >= lower_fence) & (values <= upper_fence)]
        
        if len(clean_values) > 0:
            self.thresholds[metric] = {
                'mean': float(np.mean(clean_values)),
                'std': float(np.std(clean_values)),
                'lower': float(np.percentile(clean_values, 5)),
                'upper': float(np.percentile(clean_values, 95))
            }
    
    def _classify_anomaly_severity(self, anomaly: Dict[str, Any]) -> str:
        """Classify anomaly severity"""
        # Fraud is always critical
        if anomaly.get('type') == 'fraud':
            return 'critical'
        
        # Multi-metric anomalies are usually critical
        if anomaly.get('type') == 'multi_metric':
            return 'critical'
        
        # Pattern anomalies
        if anomaly.get('type') == 'pattern':
            if anomaly.get('method') == 'spike_detection':
                change_pct = abs(anomaly.get('change_percentage', 0))
                if change_pct > 500:
                    return 'critical'
                elif change_pct > 200:
                    return 'warning'
            elif anomaly.get('method') == 'relationship_validation':
                return 'critical'
        
        # Statistical anomalies
        if anomaly.get('type') == 'statistical':
            z_score = anomaly.get('z_score', 0)
            if z_score > 4:
                return 'critical'
            elif z_score > 3:
                return 'warning'
        
        # Model anomalies
        if anomaly.get('type') == 'model':
            anomaly_score = anomaly.get('anomaly_score', 0)
            if anomaly_score < -0.5:
                return 'warning'
        
        return 'info'
    
    def _calculate_expected_range(self, values: np.ndarray, idx: int) -> List[float]:
        """Calculate expected range for a value"""
        # Use historical data around the point
        window_start = max(0, idx - 7)
        window_end = min(len(values), idx + 7)
        
        if window_start == idx:
            window_values = values[window_start:window_end]
        elif window_end == idx + 1:
            window_values = values[window_start:idx]
        else:
            window_values = np.concatenate([values[window_start:idx], values[idx+1:window_end]])
        
        if len(window_values) > 0:
            return [float(np.percentile(window_values, 25)), float(np.percentile(window_values, 75))]
        else:
            return [float(values.min()), float(values.max())]
    
    def _generate_anomaly_insights(self, anomalies: Dict[str, List], data: pd.DataFrame) -> List[str]:
        """Generate insights from detected anomalies"""
        insights = []
        
        # Count by type
        type_counts = {}
        for severity, anomaly_list in anomalies.items():
            for anomaly in anomaly_list:
                anomaly_type = anomaly.get('type', 'unknown')
                type_counts[anomaly_type] = type_counts.get(anomaly_type, 0) + 1
        
        # Generate insights
        if type_counts.get('fraud', 0) > 0:
            insights.append(f"⚠️ Detected {type_counts['fraud']} potential fraud patterns requiring immediate investigation")
        
        if type_counts.get('pattern', 0) > 5:
            insights.append(f"Multiple pattern anomalies detected ({type_counts['pattern']}). Campaign behavior is unstable")
        
        # Metric-specific insights
        metric_counts = {}
        for severity, anomaly_list in anomalies.items():
            for anomaly in anomaly_list:
                metric = anomaly.get('metric', 'unknown')
                metric_counts[metric] = metric_counts.get(metric, 0) + 1
        
        most_anomalous_metric = max(metric_counts.items(), key=lambda x: x[1])[0] if metric_counts else None
        if most_anomalous_metric and metric_counts[most_anomalous_metric] > 3:
            insights.append(f"{most_anomalous_metric} shows the most anomalies ({metric_counts[most_anomalous_metric]}). Review this metric's tracking and targeting")
        
        # Severity distribution
        critical_count = len(anomalies.get('critical', []))
        if critical_count > 0:
            insights.append(f"{critical_count} critical anomalies require immediate attention")
        
        # Time-based insights
        if 'date' in data.columns and anomalies.get('critical'):
            recent_anomalies = [a for a in anomalies['critical'] if 'date' in a]
            if recent_anomalies:
                latest_date = max(a['date'] for a in recent_anomalies)
                insights.append(f"Most recent critical anomaly detected on {latest_date}")
        
        if not insights:
            total_anomalies = sum(len(v) for v in anomalies.values())
            if total_anomalies == 0:
                insights.append("No anomalies detected. Campaign metrics appear normal")
            else:
                insights.append(f"{total_anomalies} minor anomalies detected. Continue monitoring")
        
        return insights
    
    def _get_empty_result(self) -> Dict[str, Any]:
        """Return empty result structure"""
        return {
            'anomalies': {'critical': [], 'warning': [], 'info': []},
            'total_anomalies': 0,
            'insights': ['No data available for anomaly detection'],
            'metrics_analyzed': [],
            'time_range': {'start': None, 'end': None}
        }
    
    def _get_error_result(self, error: str) -> Dict[str, Any]:
        """Return error result structure"""
        return {
            'anomalies': {'critical': [], 'warning': [], 'info': []},
            'total_anomalies': 0,
            'insights': [f'Error during anomaly detection: {error}'],
            'metrics_analyzed': [],
            'time_range': {'start': None, 'end': None},
            'error': error
        }