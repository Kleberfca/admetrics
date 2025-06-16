#!/usr/bin/env python3
"""
Audience segmentation using clustering algorithms
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score, calinski_harabasz_score
import warnings

warnings.filterwarnings('ignore')
logger = logging.getLogger(__name__)


class AudienceSegmenter:
    """Segment audiences for targeted advertising"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.min_clusters = config.get('min_clusters', 3)
        self.max_clusters = config.get('max_clusters', 10)
        self.features = config.get('features', [
            'age', 'gender', 'interests', 'behavior', 'location'
        ])
        self.scaler = StandardScaler()
        self.models = {}
        
    def prepare_audience_data(self, audience_data: pd.DataFrame) -> pd.DataFrame:
        """Prepare audience data for segmentation"""
        df = audience_data.copy()
        
        # Encode categorical variables
        categorical_columns = ['gender', 'location', 'device_type', 'platform']
        
        for col in categorical_columns:
            if col in df.columns:
                # One-hot encoding
                dummies = pd.get_dummies(df[col], prefix=col)
                df = pd.concat([df, dummies], axis=1)
                df.drop(col, axis=1, inplace=True)
        
        # Handle interests (assuming it's a list or string)
        if 'interests' in df.columns:
            # Convert interests to binary features
            all_interests = set()
            for interests in df['interests'].dropna():
                if isinstance(interests, str):
                    all_interests.update(interests.split(','))
                elif isinstance(interests, list):
                    all_interests.update(interests)
            
            for interest in all_interests:
                df[f'interest_{interest.strip().lower().replace(" ", "_")}'] = df['interests'].apply(
                    lambda x: 1 if x and interest in str(x) else 0
                )
            
            df.drop('interests', axis=1, inplace=True)
        
        # Normalize numerical features
        numerical_columns = ['age', 'income', 'engagement_score', 'purchase_frequency']
        
        for col in numerical_columns:
            if col in df.columns:
                df[f'{col}_normalized'] = (df[col] - df[col].mean()) / (df[col].std() + 1e-6)
        
        # Calculate derived features
        if 'total_spend' in df.columns and 'purchase_count' in df.columns:
            df['avg_order_value'] = df['total_spend'] / (df['purchase_count'] + 1e-6)
        
        if 'clicks' in df.columns and 'impressions' in df.columns:
            df['engagement_rate'] = df['clicks'] / (df['impressions'] + 1e-6)
        
        # Drop rows with too many missing values
        df.dropna(thresh=len(df.columns) * 0.7, inplace=True)
        
        # Fill remaining missing values
        df.fillna(0, inplace=True)
        
        return df
    
    def find_optimal_clusters(self, X: np.ndarray) -> int:
        """Find optimal number of clusters using elbow method and silhouette score"""
        
        scores = []
        silhouette_scores = []
        
        for k in range(self.min_clusters, self.max_clusters + 1):
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            kmeans.fit(X)
            
            scores.append(kmeans.inertia_)
            
            if k > 1:
                silhouette_scores.append(silhouette_score(X, kmeans.labels_))
        
        # Find elbow point
        # Calculate rate of change
        if len(scores) > 2:
            deltas = np.diff(scores)
            delta_deltas = np.diff(deltas)
            
            # Find the point where the rate of change stabilizes
            elbow_idx = np.argmax(delta_deltas) + 2
            optimal_k = self.min_clusters + elbow_idx
        else:
            optimal_k = self.min_clusters
        
        # Validate with silhouette score
        if silhouette_scores:
            best_silhouette_k = self.min_clusters + 1 + np.argmax(silhouette_scores)
            
            # If silhouette suggests different k, average them
            if abs(best_silhouette_k - optimal_k) <= 2:
                optimal_k = (optimal_k + best_silhouette_k) // 2
        
        return min(max(optimal_k, self.min_clusters), self.max_clusters)
    
    def segment_audience(self, 
                        audience_data: pd.DataFrame,
                        method: str = 'kmeans',
                        n_clusters: Optional[int] = None) -> Dict[str, Any]:
        """Main audience segmentation method"""
        
        # Prepare data
        df = self.prepare_audience_data(audience_data)
        
        if len(df) < 10:
            return {
                'success': False,
                'message': 'Insufficient data for segmentation'
            }
        
        # Select features
        feature_columns = [col for col in df.columns 
                          if any(f in col for f in ['age', 'gender', 'interest', 
                                                   'engagement', 'purchase', 'location'])]
        
        if not feature_columns:
            return {
                'success': False,
                'message': 'No suitable features for segmentation'
            }
        
        X = df[feature_columns].values
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        # Dimensionality reduction if too many features
        if X_scaled.shape[1] > 20:
            pca = PCA(n_components=0.95)  # Keep 95% variance
            X_scaled = pca.fit_transform(X_scaled)
            logger.info(f"Reduced dimensions from {len(feature_columns)} to {X_scaled.shape[1]}")
        
        # Determine optimal clusters if not specified
        if n_clusters is None:
            n_clusters = self.find_optimal_clusters(X_scaled)
            logger.info(f"Optimal clusters determined: {n_clusters}")
        
        # Perform segmentation
        if method == 'kmeans':
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(X_scaled)
            
            # Calculate cluster centers in original space
            centers = self.scaler.inverse_transform(model.cluster_centers_)
            
        elif method == 'dbscan':
            # DBSCAN for density-based clustering
            model = DBSCAN(eps=0.5, min_samples=5)
            labels = model.fit_predict(X_scaled)
            n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
            centers = None
            
        else:
            raise ValueError(f"Unknown segmentation method: {method}")
        
        # Analyze segments
        segments = self.analyze_segments(df, labels, feature_columns)
        
        # Calculate metrics
        metrics = {
            'silhouette_score': silhouette_score(X_scaled, labels) if n_clusters > 1 else 0,
            'calinski_harabasz_score': calinski_harabasz_score(X_scaled, labels) if n_clusters > 1 else 0,
            'n_segments': n_clusters,
            'segment_sizes': dict(zip(*np.unique(labels, return_counts=True)))
        }
        
        return {
            'success': True,
            'method': method,
            'n_segments': n_clusters,
            'segments': segments,
            'metrics': metrics,
            'feature_columns': feature_columns,
            'model': model
        }
    
    def analyze_segments(self, 
                        df: pd.DataFrame, 
                        labels: np.ndarray,
                        feature_columns: List[str]) -> List[Dict[str, Any]]:
        """Analyze characteristics of each segment"""
        
        df_with_labels = df.copy()
        df_with_labels['segment'] = labels
        
        segments = []
        
        for segment_id in sorted(set(labels)):
            if segment_id == -1:  # DBSCAN noise points
                continue
                
            segment_data = df_with_labels[df_with_labels['segment'] == segment_id]
            segment_size = len(segment_data)
            
            # Calculate segment characteristics
            characteristics = {}
            
            # Numerical features - calculate mean
            numerical_features = [col for col in feature_columns 
                                if 'normalized' in col or 'score' in col or 'rate' in col]
            
            for feature in numerical_features:
                if feature in segment_data.columns:
                    characteristics[feature] = {
                        'mean': float(segment_data[feature].mean()),
                        'std': float(segment_data[feature].std())
                    }
            
            # Binary features - calculate percentage
            binary_features = [col for col in feature_columns 
                             if col.startswith(('interest_', 'gender_', 'location_'))]
            
            for feature in binary_features:
                if feature in segment_data.columns:
                    percentage = (segment_data[feature] == 1).mean() * 100
                    if percentage > 10:  # Only include if significant
                        characteristics[feature] = float(percentage)
            
            # Generate segment profile
            profile = self.generate_segment_profile(characteristics)
            
            segments.append({
                'segment_id': int(segment_id),
                'size': segment_size,
                'percentage': float(segment_size / len(df) * 100),
                'characteristics': characteristics,
                'profile': profile
            })
        
        return segments
    
    def generate_segment_profile(self, characteristics: Dict[str, Any]) -> Dict[str, Any]:
        """Generate human-readable profile for segment"""
        
        profile = {
            'name': '',
            'description': '',
            'key_traits': [],
            'targeting_recommendations': []
        }
        
        # Analyze age if available
        age_feature = next((k for k in characteristics if 'age_normalized' in k), None)
        if age_feature:
            age_mean = characteristics[age_feature]['mean']
            if age_mean > 0.5:
                profile['key_traits'].append('Older demographic')
            elif age_mean < -0.5:
                profile['key_traits'].append('Younger demographic')
            else:
                profile['key_traits'].append('Middle-aged demographic')
        
        # Analyze interests
        top_interests = []
        for feature, value in characteristics.items():
            if feature.startswith('interest_') and isinstance(value, (int, float)) and value > 30:
                interest = feature.replace('interest_', '').replace('_', ' ').title()
                top_interests.append((interest, value))
        
        top_interests.sort(key=lambda x: x[1], reverse=True)
        
        if top_interests:
            profile['key_traits'].append(f"Interested in: {', '.join([i[0] for i in top_interests[:3]])}")
        
        # Generate name based on traits
        if profile['key_traits']:
            profile['name'] = f"{profile['key_traits'][0].split()[0]} Segment"
        else:
            profile['name'] = "General Segment"
        
        # Generate recommendations
        if 'engagement_rate' in characteristics:
            eng_rate = characteristics['engagement_rate'].get('mean', 0)
            if eng_rate > 0.5:
                profile['targeting_recommendations'].append('High engagement - increase frequency')
            elif eng_rate < -0.5:
                profile['targeting_recommendations'].append('Low engagement - improve creative')
        
        return profile
    
    def predict_segment(self, 
                       new_audience: pd.DataFrame,
                       model: Any,
                       feature_columns: List[str]) -> np.ndarray:
        """Predict segment for new audience members"""
        
        # Prepare data
        df = self.prepare_audience_data(new_audience)
        
        # Ensure same features
        X = df[feature_columns].values
        X_scaled = self.scaler.transform(X)
        
        # Predict
        predictions = model.predict(X_scaled)
        
        return predictions