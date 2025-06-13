"""
Anomaly Detector Model
Detects unusual patterns and anomalies in campaign metrics
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
from sklearn.ensemble import IsolationForest
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.decomposition import PCA
from sklearn.covariance import EllipticEnvelope
from scipy import stats
from scipy.signal import find_peaks
import joblib

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    AI model for detecting anomalies in advertising campaign metrics
    """
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or 'models/anomaly_detector'
        self.models = {}
        self.scalers = {}
        self.thresholds = {}
        self.is_trained = False
        self.model_version = "1.0.0"
        self.last_trained = None
        
        # Anomaly detection methods
        self.detection_methods = {
            'isolation_forest': self._detect_with_isolation_forest,
            'statistical': self._detect_with_statistical_methods,
            'clustering': self._detect_with_clustering,
            'time_series': self._detect_with_time_series,
            'multivariate': self._detect_with_multivariate
        }
        
        # Sensitivity levels
        self.sensitivity_configs = {
            'low': {'contamination': 0.1, 'z_threshold': 3.0, 'percentile': 95},
            'medium': {'contamination': 0.05, 'z_threshold': 2.5, 'percentile': 97.5},
            'high': {'contamination': 0.02, 'z_threshold': 2.0, 'percentile': 99}
        }
        
        # Ensure model directory exists
        os.makedirs(self.model_path, exist_ok=True)
    
    def train(self, training_data: List[Dict], contamination: float = 0.05) -> Dict[str, Any]:
        """
        Train anomaly detection models on normal campaign data
        """
        try:
            logger.info("Training anomaly detection models...")
            
            df = pd.DataFrame(training_data)
            
            if df.empty or len(df) < 100:
                raise ValueError("Insufficient training data (minimum 100 records required)")
            
            # Prepare features
            df = self._prepare_features(df)
            
            # Define feature groups for different types of anomaly detection
            feature_groups = {
                'performance': ['spend', 'clicks', 'impressions', 'conversions'],
                'efficiency': ['ctr', 'cpc', 'cpa', 'roas'],
                'temporal': ['hour_of_day', 'day_of_week', 'day_of_month']
            }
            
            training_results = {}
            
            for group_name, features in feature_groups.items():
                available_features = [f for f in features if f in df.columns]
                
                if len(available_features) < 2:
                    logger.warning(f"Insufficient features for {group_name} group, skipping...")
                    continue
                
                X = df[available_features].fillna(0)
                
                # Remove extreme outliers for training (keep 99% of data)
                Q1 = X.quantile(0.01)
                Q3 = X.quantile(0.99)
                mask = ~((X < Q1) | (X > Q3)).any(axis=1)
                X_clean = X[mask]
                
                if len(X_clean) < 50:
                    logger.warning(f"Too few clean samples for {group_name} after outlier removal")
                    continue
                
                # Scale features
                scaler = RobustScaler()
                X_scaled = scaler.fit_transform(X_clean)
                self.scalers[group_name] = scaler
                
                # Train multiple anomaly detection models
                models = {}
                
                # Isolation Forest
                iso_forest = IsolationForest(
                    contamination=contamination,
                    random_state=42,
                    n_estimators=100
                )
                iso_forest.fit(X_scaled)
                models['isolation_forest'] = iso_forest
                
                # Elliptic Envelope (robust covariance estimation)
                elliptic = EllipticEnvelope(
                    contamination=contamination,
                    random_state=42
                )
                elliptic.fit(X_scaled)
                models['elliptic_envelope'] = elliptic
                
                # DBSCAN for clustering-based anomaly detection
                # Determine optimal eps using knee method
                eps = self._estimate_dbscan_eps(X_scaled)
                dbscan = DBSCAN(eps=eps, min_samples=5)
                dbscan.fit(X_scaled)
                models['dbscan'] = dbscan
                
                self.models[group_name] = {
                    'models': models,
                    'features': available_features,
                    'contamination': contamination
                }
                
                # Calculate statistical thresholds
                self.thresholds[group_name] = self._calculate_statistical_thresholds(X_clean)
                
                training_results[group_name] = {
                    'features': available_features,
                    'training_samples': len(X_clean),
                    'contamination': contamination
                }
                
                logger.info(f"Trained {group_name} anomaly detector with {len(available_features)} features")
            
            self.is_trained = True
            self.last_trained = datetime.utcnow()
            
            # Save models
            self.save_model()
            
            return {
                'success': True,
                'groups_trained': list(training_results.keys()),
                'results': training_results
            }
            
        except Exception as e:
            logger.error(f"Error training anomaly detector: {e}")
            raise
    
    def detect(self, data: List[Dict], metrics: List[str] = None, 
              sensitivity: str = 'medium', methods: List[str] = None) -> List[Dict]:
        """
        Detect anomalies in campaign metrics data
        
        Args:
            data: Campaign metrics data
            metrics: Specific metrics to analyze
            sensitivity: 'low', 'medium', 'high'
            methods: Detection methods to use
        """
        try:
            if not data:
                return []
            
            df = pd.DataFrame(data)
            
            if df.empty:
                return []
            
            # Prepare features
            df = self._prepare_features(df)
            
            # Set default methods if not specified
            if methods is None:
                methods = ['isolation_forest', 'statistical', 'time_series']
            
            # Set default metrics if not specified
            if metrics is None:
                metrics = ['spend', 'clicks', 'conversions', 'ctr', 'cpc']
            
            # Filter available metrics
            available_metrics = [m for m in metrics if m in df.columns]
            
            if not available_metrics:
                logger.warning("No valid metrics found in data")
                return []
            
            all_anomalies = []
            
            # Apply each detection method
            for method in methods:
                if method in self.detection_methods:
                    method_anomalies = self.detection_methods[method](
                        df, available_metrics, sensitivity
                    )
                    all_anomalies.extend(method_anomalies)
            
            # Consolidate and rank anomalies
            consolidated_anomalies = self._consolidate_anomalies(all_anomalies)
            
            # Add metadata
            for anomaly in consolidated_anomalies:
                anomaly.update({
                    'detected_at': datetime.utcnow().isoformat(),
                    'sensitivity': sensitivity,
                    'methods_used': methods
                })
            
            return consolidated_anomalies
            
        except Exception as e:
            logger.error(f"Error detecting anomalies: {e}")
            return []
    
    def _detect_with_isolation_forest(self, df: pd.DataFrame, metrics: List[str], 
                                    sensitivity: str) -> List[Dict]:
        """Detect anomalies using Isolation Forest"""
        try:
            if not self.is_trained:
                logger.warning("Models not trained, using default Isolation Forest")
                return self._detect_with_default_isolation_forest(df, metrics, sensitivity)
            
            anomalies = []
            config = self.sensitivity_configs[sensitivity]
            
            for group_name, group_data in self.models.items():
                features = group_data['features']
                available_features = [f for f in features if f in df.columns and f in metrics]
                
                if len(available_features) < 2:
                    continue
                
                X = df[available_features].fillna(0)
                scaler = self.scalers[group_name]
                X_scaled = scaler.transform(X)
                
                model = group_data['models']['isolation_forest']
                predictions = model.predict(X_scaled)
                scores = model.score_samples(X_scaled)
                
                # Find anomalies (prediction = -1)
                anomaly_mask = predictions == -1
                
                for idx in np.where(anomaly_mask)[0]:
                    anomaly = {
                        'index': int(idx),
                        'date': df.iloc[idx].get('date', ''),
                        'type': 'isolation_forest',
                        'category': group_name,
                        'severity_score': float(-scores[idx]),  # Lower scores = more anomalous
                        'affected_metrics': available_features,
                        'values': {metric: float(df.iloc[idx][metric]) for metric in available_features},
                        'description': f"Unusual {group_name} pattern detected"
                    }
                    anomalies.append(anomaly)
            
            return anomalies
            
        except Exception as e:
            logger.error(f"Error in isolation forest detection: {e}")
            return []
    
    def _detect_with_statistical_methods(self, df: pd.DataFrame, metrics: List[str], 
                                       sensitivity: str) -> List[Dict]:
        """Detect anomalies using statistical methods (Z-score, IQR)"""
        try:
            anomalies = []
            config = self.sensitivity_configs[sensitivity]
            z_threshold = config['z_threshold']
            
            for metric in metrics:
                if metric not in df.columns:
                    continue
                
                values = df[metric].dropna()
                
                if len(values) < 10:
                    continue
                
                # Z-score method
                z_scores = np.abs(stats.zscore(values))
                z_anomalies = np.where(z_scores > z_threshold)[0]
                
                # IQR method
                Q1 = values.quantile(0.25)
                Q3 = values.quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR
                iqr_anomalies = values[(values < lower_bound) | (values > upper_bound)].index
                
                # Combine anomalies
                all_indices = set(z_anomalies) | set(iqr_anomalies)
                
                for idx in all_indices:
                    if idx < len(df):
                        value = float(values.iloc[idx] if idx < len(values) else df.iloc[idx][metric])
                        z_score = float(z_scores[idx] if idx < len(z_scores) else 0)
                        
                        anomaly = {
                            'index': int(idx),
                            'date': df.iloc[idx].get('date', ''),
                            'type': 'statistical',
                            'category': 'statistical_outlier',
                            'severity_score': float(z_score),
                            'affected_metrics': [metric],
                            'values': {metric: value},
                            'description': f"Statistical outlier in {metric} (Z-score: {z_score:.2f})",
                            'z_score': z_score,
                            'is_above_threshold': value > upper_bound,
                            'is_below_threshold': value < lower_bound
                        }
                        anomalies.append(anomaly)
            
            return anomalies
            
        except Exception as e:
            logger.error(f"Error in statistical detection: {e}")
            return []
    
    def _detect_with_clustering(self, df: pd.DataFrame, metrics: List[str], 
                              sensitivity: str) -> List[Dict]:
        """Detect anomalies using clustering methods"""
        try:
            if not self.is_trained:
                return []
            
            anomalies = []
            
            for group_name, group_data in self.models.items():
                features = group_data['features']
                available_features = [f for f in features if f in df.columns and f in metrics]
                
                if len(available_features) < 2:
                    continue
                
                X = df[available_features].fillna(0)
                
                if len(X) < 10:
                    continue
                
                scaler = self.scalers[group_name]
                X_scaled = scaler.transform(X)
                
                if 'dbscan' in group_data['models']:
                    dbscan = group_data['models']['dbscan']
                    
                    # Predict clusters for new data
                    # Note: DBSCAN doesn't have predict method, so we use fit_predict
                    cluster_labels = dbscan.fit_predict(X_scaled)
                    
                    # Points labeled as -1 are anomalies
                    anomaly_mask = cluster_labels == -1
                    
                    for idx in np.where(anomaly_mask)[0]:
                        anomaly = {
                            'index': int(idx),
                            'date': df.iloc[idx].get('date', ''),
                            'type': 'clustering',
                            'category': f'{group_name}_clustering',
                            'severity_score': 1.0,  # Binary for DBSCAN
                            'affected_metrics': available_features,
                            'values': {metric: float(df.iloc[idx][metric]) for metric in available_features},
                            'description': f"Clustering anomaly in {group_name} metrics"
                        }
                        anomalies.append(anomaly)
            
            return anomalies
            
        except Exception as e:
            logger.error(f"Error in clustering detection: {e}")
            return []
    
    def _detect_with_time_series(self, df: pd.DataFrame, metrics: List[str], 
                               sensitivity: str) -> List[Dict]:
        """Detect anomalies in time series patterns"""
        try:
            if 'date' not in df.columns:
                return []
            
            anomalies = []
            
            # Sort by date
            df_sorted = df.sort_values('date').reset_index(drop=True)
            
            for metric in metrics:
                if metric not in df_sorted.columns:
                    continue
                
                values = df_sorted[metric].dropna()
                
                if len(values) < 20:  # Need sufficient data for time series analysis
                    continue
                
                # Detect sudden spikes/drops
                diff = values.diff().abs()
                threshold = diff.quantile(0.95)  # Top 5% of changes
                
                spike_indices = diff[diff > threshold].index
                
                for idx in spike_indices:
                    if idx > 0 and idx < len(df_sorted):
                        current_value = float(values.iloc[idx])
                        previous_value = float(values.iloc[idx-1])
                        change_percent = ((current_value - previous_value) / max(previous_value, 1)) * 100
                        
                        anomaly = {
                            'index': int(idx),
                            'date': df_sorted.iloc[idx].get('date', ''),
                            'type': 'time_series',
                            'category': 'sudden_change',
                            'severity_score': float(abs(change_percent) / 100),
                            'affected_metrics': [metric],
                            'values': {metric: current_value},
                            'description': f"Sudden change in {metric}: {change_percent:.1f}%",
                            'change_percent': change_percent,
                            'previous_value': previous_value
                        }
                        anomalies.append(anomaly)
                
                # Detect trend anomalies using rolling statistics
                window_size = min(7, len(values) // 4)
                if window_size >= 3:
                    rolling_mean = values.rolling(window=window_size).mean()
                    rolling_std = values.rolling(window=window_size).std()
                    
                    # Points that are far from rolling mean
                    z_scores = np.abs((values - rolling_mean) / rolling_std)
                    trend_anomalies = z_scores[z_scores > 2.5].index
                    
                    for idx in trend_anomalies:
                        if idx < len(df_sorted):
                            anomaly = {
                                'index': int(idx),
                                'date': df_sorted.iloc[idx].get('date', ''),
                                'type': 'time_series',
                                'category': 'trend_anomaly',
                                'severity_score': float(z_scores.iloc[idx]),
                                'affected_metrics': [metric],
                                'values': {metric: float(values.iloc[idx])},
                                'description': f"Trend anomaly in {metric}",
                                'rolling_mean': float(rolling_mean.iloc[idx]) if not pd.isna(rolling_mean.iloc[idx]) else 0
                            }
                            anomalies.append(anomaly)
            
            return anomalies
            
        except Exception as e:
            logger.error(f"Error in time series detection: {e}")
            return []
    
    def _detect_with_multivariate(self, df: pd.DataFrame, metrics: List[str], 
                                sensitivity: str) -> List[Dict]:
        """Detect multivariate anomalies using correlation analysis"""
        try:
            available_metrics = [m for m in metrics if m in df.columns]
            
            if len(available_metrics) < 3:
                return []
            
            anomalies = []
            X = df[available_metrics].fillna(0)
            
            if len(X) < 20:
                return []
            
            # Calculate correlation matrix
            corr_matrix = X.corr()
            
            # Detect anomalies based on correlation changes
            for idx, row in X.iterrows():
                # Calculate deviation from expected correlation patterns
                correlation_score = 0
                
                for i, metric1 in enumerate(available_metrics):
                    for j, metric2 in enumerate(available_metrics[i+1:], i+1):
                        expected_corr = corr_matrix.loc[metric1, metric2]
                        
                        if abs(expected_corr) > 0.5:  # Only consider strong correlations
                            # Calculate actual correlation for this observation
                            val1_norm = (row[metric1] - X[metric1].mean()) / X[metric1].std()
                            val2_norm = (row[metric2] - X[metric2].mean()) / X[metric2].std()
                            
                            actual_corr_sign = np.sign(val1_norm * val2_norm)
                            expected_corr_sign = np.sign(expected_corr)
                            
                            if actual_corr_sign != expected_corr_sign:
                                correlation_score += abs(expected_corr)
                
                # If correlation score is high, it's an anomaly
                if correlation_score > 1.0:
                    anomaly = {
                        'index': int(idx),
                        'date': df.iloc[idx].get('date', ''),
                        'type': 'multivariate',
                        'category': 'correlation_anomaly',
                        'severity_score': float(correlation_score),
                        'affected_metrics': available_metrics,
                        'values': {metric: float(row[metric]) for metric in available_metrics},
                        'description': f"Unusual correlation pattern across metrics",
                        'correlation_score': correlation_score
                    }
                    anomalies.append(anomaly)
            
            return anomalies
            
        except Exception as e:
            logger.error(f"Error in multivariate detection: {e}")
            return []
    
    def _detect_with_default_isolation_forest(self, df: pd.DataFrame, metrics: List[str], 
                                             sensitivity: str) -> List[Dict]:
        """Fallback isolation forest when no trained model exists"""
        try:
            available_metrics = [m for m in metrics if m in df.columns]
            
            if len(available_metrics) < 2:
                return []
            
            X = df[available_metrics].fillna(0)
            
            if len(X) < 10:
                return []
            
            config = self.sensitivity_configs[sensitivity]
            
            # Scale features
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
            
            # Train and predict with Isolation Forest
            iso_forest = IsolationForest(
                contamination=config['contamination'],
                random_state=42
            )
            predictions = iso_forest.fit_predict(X_scaled)
            scores = iso_forest.score_samples(X_scaled)
            
            anomalies = []
            anomaly_mask = predictions == -1
            
            for idx in np.where(anomaly_mask)[0]:
                anomaly = {
                    'index': int(idx),
                    'date': df.iloc[idx].get('date', ''),
                    'type': 'isolation_forest',
                    'category': 'default_detection',
                    'severity_score': float(-scores[idx]),
                    'affected_metrics': available_metrics,
                    'values': {metric: float(df.iloc[idx][metric]) for metric in available_metrics},
                    'description': "Anomaly detected using default isolation forest"
                }
                anomalies.append(anomaly)
            
            return anomalies
            
        except Exception as e:
            logger.error(f"Error in default isolation forest: {e}")
            return []
    
    def _prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for anomaly detection"""
        try:
            # Convert date column if it exists
            if 'date' in df.columns:
                df['date'] = pd.to_datetime(df['date'])
                df = df.sort_values('date').reset_index(drop=True)
                
                # Add time-based features
                df['hour_of_day'] = df['date'].dt.hour
                df['day_of_week'] = df['date'].dt.dayofweek
                df['day_of_month'] = df['date'].dt.day
                df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
            
            # Calculate derived metrics
            if 'clicks' in df.columns and 'impressions' in df.columns:
                df['ctr'] = np.where(df['impressions'] > 0, df['clicks'] / df['impressions'], 0)
            
            if 'spend' in df.columns and 'clicks' in df.columns:
                df['cpc'] = np.where(df['clicks'] > 0, df['spend'] / df['clicks'], 0)
            
            if 'spend' in df.columns and 'conversions' in df.columns:
                df['cpa'] = np.where(df['conversions'] > 0, df['spend'] / df['conversions'], 0)
            
            if 'revenue' in df.columns and 'spend' in df.columns:
                df['roas'] = np.where(df['spend'] > 0, df['revenue'] / df['spend'], 0)
            
            # Fill infinite values and NaN
            df = df.replace([np.inf, -np.inf], np.nan)
            df = df.fillna(0)
            
            return df
            
        except Exception as e:
            logger.error(f"Error preparing features: {e}")
            return df
    
    def _calculate_statistical_thresholds(self, X: pd.DataFrame) -> Dict[str, float]:
        """Calculate statistical thresholds for each feature"""
        thresholds = {}
        
        for column in X.columns:
            values = X[column].dropna()
            
            if len(values) > 0:
                thresholds[column] = {
                    'mean': float(values.mean()),
                    'std': float(values.std()),
                    'q95': float(values.quantile(0.95)),
                    'q99': float(values.quantile(0.99)),
                    'iqr_lower': float(values.quantile(0.25) - 1.5 * (values.quantile(0.75) - values.quantile(0.25))),
                    'iqr_upper': float(values.quantile(0.75) + 1.5 * (values.quantile(0.75) - values.quantile(0.25)))
                }
        
        return thresholds
    
    def _estimate_dbscan_eps(self, X: np.ndarray) -> float:
        """Estimate optimal eps parameter for DBSCAN using k-distance graph"""
        try:
            from sklearn.neighbors import NearestNeighbors
            
            k = min(4, len(X) // 10)  # Typical k value
            neighbors = NearestNeighbors(n_neighbors=k)
            neighbors.fit(X)
            distances, _ = neighbors.kneighbors(X)
            
            # Sort k-distances
            k_distances = distances[:, k-1]
            k_distances = np.sort(k_distances)
            
            # Find knee point (simple approach)
            # Use 90th percentile as approximation
            eps = np.percentile(k_distances, 90)
            
            return max(0.1, eps)  # Ensure minimum eps value
            
        except Exception as e:
            logger.error(f"Error estimating DBSCAN eps: {e}")
            return 0.5  # Default value
    
    def _consolidate_anomalies(self, anomalies: List[Dict]) -> List[Dict]:
        """Consolidate and deduplicate anomalies"""
        try:
            if not anomalies:
                return []
            
            # Group anomalies by index/date
            grouped = {}
            
            for anomaly in anomalies:
                key = (anomaly.get('index', -1), anomaly.get('date', ''))
                
                if key not in grouped:
                    grouped[key] = []
                
                grouped[key].append(anomaly)
            
            # Consolidate grouped anomalies
            consolidated = []
            
            for key, group in grouped.items():
                if len(group) == 1:
                    consolidated.append(group[0])
                else:
                    # Merge multiple anomalies for the same data point
                    merged = {
                        'index': group[0]['index'],
                        'date': group[0]['date'],
                        'type': 'multiple',
                        'category': 'consolidated',
                        'severity_score': max(a.get('severity_score', 0) for a in group),
                        'affected_metrics': list(set().union(*[a.get('affected_metrics', []) for a in group])),
                        'values': {},
                        'description': f"Multiple anomalies detected ({len(group)} methods)",
                        'detection_methods': [a.get('type', 'unknown') for a in group],
                        'individual_scores': [a.get('severity_score', 0) for a in group]
                    }
                    
                    # Merge values
                    for anomaly in group:
                        merged['values'].update(anomaly.get('values', {}))
                    
                    consolidated.append(merged)
            
            # Sort by severity score (descending)
            consolidated.sort(key=lambda x: x.get('severity_score', 0), reverse=True)
            
            return consolidated
            
        except Exception as e:
            logger.error(f"Error consolidating anomalies: {e}")
            return anomalies
    
    def save_model(self) -> bool:
        """Save the trained model to disk"""
        try:
            model_data = {
                'models': self.models,
                'scalers': self.scalers,
                'thresholds': self.thresholds,
                'model_version': self.model_version,
                'last_trained': self.last_trained,
                'is_trained': self.is_trained
            }
            
            model_file = os.path.join(self.model_path, 'anomaly_detector.pkl')
            with open(model_file, 'wb') as f:
                pickle.dump(model_data, f)
            
            logger.info(f"Anomaly detector model saved to {model_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving anomaly detector model: {e}")
            return False
    
    def load_model(self) -> bool:
        """Load a trained model from disk"""
        try:
            model_file = os.path.join(self.model_path, 'anomaly_detector.pkl')
            
            if not os.path.exists(model_file):
                logger.warning(f"Anomaly detector model file not found: {model_file}")
                return False
            
            with open(model_file, 'rb') as f:
                model_data = pickle.load(f)
            
            self.models = model_data['models']
            self.scalers = model_data['scalers']
            self.thresholds = model_data['thresholds']
            self.model_version = model_data.get('model_version', '1.0.0')
            self.last_trained = model_data.get('last_trained')
            self.is_trained = model_data.get('is_trained', True)
            
            logger.info(f"Anomaly detector model loaded from {model_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading anomaly detector model: {e}")
            return False
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.is_trained
    
    def get_version(self) -> str:
        """Get model version"""
        return self.model_version
    
    def get_last_trained_date(self) -> Optional[str]:
        """Get last training date"""
        return self.last_trained.isoformat() if self.last_trained else None

if __name__ == "__main__":
    # Example usage
    detector = AnomalyDetector()
    
    # Mock data
    data = [
        {
            'date': '2024-01-01',
            'spend': 100.0,
            'clicks': 50,
            'impressions': 1000,
            'conversions': 5
        },
        # Add more data...
    ]
    
    # Detect anomalies
    # anomalies = detector.detect(data, metrics=['spend', 'clicks', 'conversions'])
    # print(f"Found {len(anomalies)} anomalies")