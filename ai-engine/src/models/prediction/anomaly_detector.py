#!/usr/bin/env python3
"""
Anomaly detection for advertising metrics using Isolation Forest and statistical methods
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from scipy import stats
import warnings

warnings.filterwarnings('ignore')
logger = logging.getLogger(__name__)


class AnomalyDetector:
    """Detect anomalies in advertising metrics"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.contamination = config.get('contamination', 0.1)
        self.n_estimators = config.get('n_estimators', 100)
        self.threshold_multiplier = config.get('threshold_multiplier', 2.5)
        self.models = {}
        self.scalers = {}
        self.thresholds = {}
        
    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for anomaly detection"""
        df = df.copy()
        
        # Ensure datetime index
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
        
        # Calculate rate of change
        for col in ['spend', 'clicks', 'conversions', 'impressions']:
            if col in df.columns:
                df[f'{col}_change'] = df[col].pct_change()
                df[f'{col}_rolling_std'] = df[col].rolling(7).std()
        
        # Calculate efficiency metrics
        if 'clicks' in df.columns and 'impressions' in df.columns:
            df['ctr'] = df['clicks'] / (df['impressions'] + 1e-6)
            df['ctr_change'] = df['ctr'].pct_change()
        
        if 'conversions' in df.columns and 'clicks' in df.columns:
            df['cvr'] = df['conversions'] / (df['clicks'] + 1e-6)
            df['cvr_change'] = df['cvr'].pct_change()
        
        if 'spend' in df.columns and 'conversions' in df.columns:
            df['cpa'] = df['spend'] / (df['conversions'] + 1e-6)
            df['cpa_change'] = df['cpa'].pct_change()
        
        # Drop rows with NaN
        df.dropna(inplace=True)
        
        return df
    
    def statistical_anomaly_detection(self, 
                                    series: pd.Series, 
                                    method: str = 'zscore') -> Tuple[np.ndarray, Dict[str, float]]:
        """Detect anomalies using statistical methods"""
        
        if method == 'zscore':
            # Z-score method
            z_scores = np.abs(stats.zscore(series))
            threshold = self.threshold_multiplier
            anomalies = z_scores > threshold
            
            return anomalies, {
                'mean': series.mean(),
                'std': series.std(),
                'threshold': threshold
            }
            
        elif method == 'iqr':
            # Interquartile range method
            Q1 = series.quantile(0.25)
            Q3 = series.quantile(0.75)
            IQR = Q3 - Q1
            
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            
            anomalies = (series < lower_bound) | (series > upper_bound)
            
            return anomalies, {
                'Q1': Q1,
                'Q3': Q3,
                'IQR': IQR,
                'lower_bound': lower_bound,
                'upper_bound': upper_bound
            }
            
        elif method == 'mad':
            # Median Absolute Deviation method
            median = series.median()
            mad = np.median(np.abs(series - median))
            threshold = self.threshold_multiplier * mad
            
            anomalies = np.abs(series - median) > threshold
            
            return anomalies, {
                'median': median,
                'mad': mad,
                'threshold': threshold
            }
        
        else:
            raise ValueError(f"Unknown method: {method}")
    
    def train_isolation_forest(self, 
                             df: pd.DataFrame, 
                             feature_columns: List[str]) -> IsolationForest:
        """Train Isolation Forest model"""
        
        X = df[feature_columns].values
        
        # Scale features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Train model
        model = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=42,
            n_jobs=-1
        )
        
        model.fit(X_scaled)
        
        return model, scaler
    
    def detect_anomalies(self, 
                        campaign_data: pd.DataFrame,
                        method: str = 'hybrid') -> Dict[str, Any]:
        """Main anomaly detection method"""
        
        # Prepare features
        df = self.prepare_features(campaign_data)
        
        if len(df) < 10:
            return {
                'success': False,
                'message': 'Insufficient data for anomaly detection'
            }
        
        anomalies = {}
        
        # Statistical anomaly detection for each metric
        statistical_anomalies = {}
        
        for metric in ['spend', 'clicks', 'conversions', 'ctr', 'cvr', 'cpa']:
            if metric in df.columns:
                anomaly_mask, stats = self.statistical_anomaly_detection(
                    df[metric], 
                    method='zscore'
                )
                
                anomaly_indices = df.index[anomaly_mask].tolist()
                
                if anomaly_indices:
                    statistical_anomalies[metric] = {
                        'dates': anomaly_indices,
                        'values': df.loc[anomaly_mask, metric].tolist(),
                        'statistics': stats
                    }
        
        # Machine learning anomaly detection
        if method in ['isolation_forest', 'hybrid']:
            feature_columns = [col for col in df.columns 
                             if col.endswith('_change') or col.endswith('_std')]
            
            if feature_columns:
                model, scaler = self.train_isolation_forest(df, feature_columns)
                
                # Predict anomalies
                X = df[feature_columns].values
                X_scaled = scaler.transform(X)
                predictions = model.predict(X_scaled)
                anomaly_scores = model.score_samples(X_scaled)
                
                # Get anomalies (prediction = -1)
                ml_anomaly_mask = predictions == -1
                ml_anomaly_indices = df.index[ml_anomaly_mask].tolist()
                
                anomalies['ml_anomalies'] = {
                    'dates': ml_anomaly_indices,
                    'scores': anomaly_scores[ml_anomaly_mask].tolist(),
                    'features': {
                        date: dict(zip(feature_columns, X[i]))
                        for i, date in enumerate(df.index)
                        if ml_anomaly_mask[i]
                    }
                }
        
        # Combine results
        all_anomaly_dates = set()
        
        for metric_anomalies in statistical_anomalies.values():
            all_anomaly_dates.update(metric_anomalies['dates'])
        
        if 'ml_anomalies' in anomalies:
            all_anomaly_dates.update(anomalies['ml_anomalies']['dates'])
        
        # Generate alerts
        alerts = self.generate_alerts(df, statistical_anomalies, anomalies.get('ml_anomalies'))
        
        return {
            'success': True,
            'statistical_anomalies': statistical_anomalies,
            'ml_anomalies': anomalies.get('ml_anomalies', {}),
            'total_anomalies': len(all_anomaly_dates),
            'anomaly_dates': sorted(list(all_anomaly_dates)),
            'alerts': alerts
        }
    
    def generate_alerts(self, 
                       df: pd.DataFrame,
                       statistical_anomalies: Dict[str, Any],
                       ml_anomalies: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Generate alerts based on detected anomalies"""
        
        alerts = []
        
        # Statistical anomaly alerts
        for metric, anomaly_data in statistical_anomalies.items():
            for i, date in enumerate(anomaly_data['dates']):
                value = anomaly_data['values'][i]
                stats = anomaly_data['statistics']
                
                # Determine severity
                if metric in ['spend', 'cpa']:
                    # Higher is worse
                    deviation = (value - stats['mean']) / stats['std']
                    severity = 'high' if deviation > 3 else 'medium'
                else:
                    # Lower is worse for clicks, conversions, ctr, cvr
                    deviation = (stats['mean'] - value) / stats['std']
                    severity = 'high' if deviation > 3 else 'medium'
                
                alerts.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'type': 'statistical_anomaly',
                    'metric': metric,
                    'value': float(value),
                    'expected_range': {
                        'lower': float(stats['mean'] - self.threshold_multiplier * stats['std']),
                        'upper': float(stats['mean'] + self.threshold_multiplier * stats['std'])
                    },
                    'severity': severity,
                    'message': f"Unusual {metric} detected: {value:.2f}"
                })
        
        # ML anomaly alerts
        if ml_anomalies:
            for i, date in enumerate(ml_anomalies['dates']):
                score = ml_anomalies['scores'][i]
                
                alerts.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'type': 'ml_anomaly',
                    'score': float(score),
                    'severity': 'high' if score < -0.5 else 'medium',
                    'message': f"Complex anomaly pattern detected on {date.strftime('%Y-%m-%d')}"
                })
        
        # Sort by date and severity
        alerts.sort(key=lambda x: (x['date'], x['severity'] == 'high'), reverse=True)
        
        return alerts
    
    def real_time_anomaly_check(self, 
                               current_metrics: Dict[str, float],
                               historical_stats: Dict[str, Dict[str, float]]) -> List[Dict[str, Any]]:
        """Real-time anomaly detection for incoming metrics"""
        
        anomalies = []
        
        for metric, value in current_metrics.items():
            if metric in historical_stats:
                stats = historical_stats[metric]
                
                # Z-score check
                z_score = abs((value - stats['mean']) / (stats['std'] + 1e-6))
                
                if z_score > self.threshold_multiplier:
                    anomalies.append({
                        'metric': metric,
                        'value': value,
                        'z_score': z_score,
                        'expected_range': {
                            'lower': stats['mean'] - self.threshold_multiplier * stats['std'],
                            'upper': stats['mean'] + self.threshold_multiplier * stats['std']
                        },
                        'severity': 'high' if z_score > 3.5 else 'medium'
                    })
        
        return anomalies