#!/usr/bin/env python3
"""
Audience segmentation model for targeted advertising
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
import logging
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score, davies_bouldin_score
import json

logger = logging.getLogger(__name__)


class AudienceSegmenter:
    """Segment audiences based on behavior and attributes"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize audience segmenter"""
        self.config = config or self._get_default_config()
        self.scaler = StandardScaler()
        self.pca = None
        self.encoders = {}
        self.clustering_model = None
        self.segments = None
        self.feature_importance = None
        
    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration"""
        return {
            'algorithm': 'kmeans',
            'min_clusters': 3,
            'max_clusters': 10,
            'features': [
                'age', 'gender', 'location', 'interests',
                'device_type', 'behavior_score', 'purchase_history'
            ],
            'pca_components': 0.95,  # Explained variance ratio
            'random_state': 42
        }
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.clustering_model is not None
    
    def segment(self, audience_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Segment audience based on attributes and behavior"""
        try:
            # Convert to DataFrame
            df = pd.DataFrame(audience_data)
            
            if len(df) < self.config['min_clusters']:
                logger.warning(f"Not enough data for segmentation: {len(df)} records")
                return self._get_single_segment_result(df)
            
            # Preprocess data
            features_df = self._preprocess_audience_data(df)
            
            # Determine optimal number of clusters
            optimal_k = self._find_optimal_clusters(features_df)
            
            # Perform clustering
            self.clustering_model = self._get_clustering_model(optimal_k)
            clusters = self.clustering_model.fit_predict(features_df)
            
            # Analyze segments
            segments = self._analyze_segments(df, features_df, clusters)
            
            # Calculate segment quality metrics
            quality_metrics = self._calculate_quality_metrics(features_df, clusters)
            
            # Generate recommendations
            recommendations = self._generate_segment_recommendations(segments)
            
            # Store results
            self.segments = segments
            
            return {
                'num_segments': len(segments),
                'segments': segments,
                'quality_metrics': quality_metrics,
                'recommendations': recommendations,
                'feature_importance': self.feature_importance,
                'visualization_data': self._prepare_visualization_data(features_df, clusters)
            }
            
        except Exception as e:
            logger.error(f"Error in audience segmentation: {e}")
            return self._get_error_result(str(e))
    
    def predict_segment(self, user_attributes: Dict[str, Any]) -> Dict[str, Any]:
        """Predict which segment a user belongs to"""
        if self.clustering_model is None or self.segments is None:
            return {'error': 'Model not trained. Run segment() first.'}
        
        try:
            # Preprocess user data
            user_df = pd.DataFrame([user_attributes])
            features = self._preprocess_audience_data(user_df)
            
            # Predict cluster
            cluster_id = self.clustering_model.predict(features)[0]
            
            # Get segment info
            segment = self.segments[cluster_id]
            
            return {
                'segment_id': int(cluster_id),
                'segment_name': segment['name'],
                'segment_characteristics': segment['characteristics'],
                'confidence': self._calculate_prediction_confidence(features, cluster_id)
            }
            
        except Exception as e:
            logger.error(f"Error predicting segment: {e}")
            return {'error': str(e)}
    
    def _preprocess_audience_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Preprocess audience data for clustering"""
        features_list = []
        
        # Age processing
        if 'age' in df.columns:
            age_features = self._process_age(df['age'])
            features_list.append(age_features)
        
        # Gender processing
        if 'gender' in df.columns:
            gender_features = self._process_gender(df['gender'])
            features_list.append(gender_features)
        
        # Location processing
        if 'location' in df.columns:
            location_features = self._process_location(df['location'])
            features_list.append(location_features)
        
        # Interests processing
        if 'interests' in df.columns:
            interests_features = self._process_interests(df['interests'])
            features_list.append(interests_features)
        
        # Device type processing
        if 'device_type' in df.columns:
            device_features = self._process_device_type(df['device_type'])
            features_list.append(device_features)
        
        # Behavior score
        if 'behavior_score' in df.columns:
            behavior_features = df[['behavior_score']].fillna(0)
            features_list.append(behavior_features)
        
        # Purchase history
        if 'purchase_history' in df.columns:
            purchase_features = self._process_purchase_history(df['purchase_history'])
            features_list.append(purchase_features)
        
        # Engagement metrics
        engagement_cols = ['clicks', 'impressions', 'conversions', 'time_spent']
        engagement_features = []
        for col in engagement_cols:
            if col in df.columns:
                engagement_features.append(df[[col]].fillna(0))
        
        if engagement_features:
            features_list.extend(engagement_features)
        
        # Combine all features
        if not features_list:
            raise ValueError("No valid features found for segmentation")
        
        features_df = pd.concat(features_list, axis=1)
        
        # Scale features
        features_scaled = self.scaler.fit_transform(features_df)
        
        # Apply PCA if needed
        if features_scaled.shape[1] > 10:
            if self.pca is None:
                self.pca = PCA(n_components=self.config['pca_components'], random_state=self.config['random_state'])
                features_scaled = self.pca.fit_transform(features_scaled)
            else:
                features_scaled = self.pca.transform(features_scaled)
            
            # Store feature importance
            self.feature_importance = self._calculate_feature_importance(features_df.columns)
        
        return pd.DataFrame(features_scaled)
    
    def _process_age(self, age_series: pd.Series) -> pd.DataFrame:
        """Process age feature"""
        df = pd.DataFrame()
        
        # Fill missing values with median
        age_filled = age_series.fillna(age_series.median())
        
        # Age groups
        df['age'] = age_filled
        df['age_group_18_24'] = (age_filled >= 18) & (age_filled < 25)
        df['age_group_25_34'] = (age_filled >= 25) & (age_filled < 35)
        df['age_group_35_44'] = (age_filled >= 35) & (age_filled < 45)
        df['age_group_45_54'] = (age_filled >= 45) & (age_filled < 55)
        df['age_group_55_plus'] = age_filled >= 55
        
        return df.astype(float)
    
    def _process_gender(self, gender_series: pd.Series) -> pd.DataFrame:
        """Process gender feature"""
        # One-hot encode gender
        gender_filled = gender_series.fillna('unknown')
        
        if 'gender' not in self.encoders:
            self.encoders['gender'] = LabelEncoder()
            gender_encoded = self.encoders['gender'].fit_transform(gender_filled)
        else:
            gender_encoded = self.encoders['gender'].transform(gender_filled)
        
        return pd.DataFrame({'gender_encoded': gender_encoded})
    
    def _process_location(self, location_series: pd.Series) -> pd.DataFrame:
        """Process location feature"""
        df = pd.DataFrame()
        
        # Extract country/region if structured
        if location_series.dtype == 'object':
            # Simple encoding for now
            location_filled = location_series.fillna('unknown')
            
            if 'location' not in self.encoders:
                self.encoders['location'] = LabelEncoder()
                location_encoded = self.encoders['location'].fit_transform(location_filled)
            else:
                location_encoded = self.encoders['location'].transform(location_filled)
            
            df['location_encoded'] = location_encoded
        
        return df
    
    def _process_interests(self, interests_series: pd.Series) -> pd.DataFrame:
        """Process interests feature"""
        # Convert interests to feature vector
        all_interests = set()
        
        for interests in interests_series.dropna():
            if isinstance(interests, str):
                interest_list = interests.split(',')
            elif isinstance(interests, list):
                interest_list = interests
            else:
                continue
            
            all_interests.update([i.strip().lower() for i in interest_list])
        
        # Create binary features for top interests
        interest_features = pd.DataFrame()
        top_interests = list(all_interests)[:20]  # Limit to top 20
        
        for interest in top_interests:
            interest_features[f'interest_{interest}'] = interests_series.apply(
                lambda x: 1 if x and interest in str(x).lower() else 0
            )
        
        return interest_features
    
    def _process_device_type(self, device_series: pd.Series) -> pd.DataFrame:
        """Process device type feature"""
        device_filled = device_series.fillna('unknown')
        
        # One-hot encode main device types
        device_types = ['mobile', 'desktop', 'tablet']
        df = pd.DataFrame()
        
        for device in device_types:
            df[f'device_{device}'] = device_filled.str.lower().str.contains(device, na=False).astype(int)
        
        return df
    
    def _process_purchase_history(self, purchase_series: pd.Series) -> pd.DataFrame:
        """Process purchase history feature"""
        df = pd.DataFrame()
        
        # Extract purchase metrics
        purchase_data = []
        for purchases in purchase_series:
            if pd.isna(purchases):
                purchase_data.append({'count': 0, 'total': 0, 'avg': 0})
            elif isinstance(purchases, dict):
                purchase_data.append(purchases)
            elif isinstance(purchases, (int, float)):
                purchase_data.append({'count': 1, 'total': purchases, 'avg': purchases})
            else:
                purchase_data.append({'count': 0, 'total': 0, 'avg': 0})
        
        purchase_df = pd.DataFrame(purchase_data)
        df['purchase_count'] = purchase_df.get('count', 0).fillna(0)
        df['purchase_total'] = purchase_df.get('total', 0).fillna(0)
        df['purchase_avg'] = purchase_df.get('avg', 0).fillna(0)
        
        # Create purchase frequency categories
        df['is_frequent_buyer'] = (df['purchase_count'] > df['purchase_count'].median()).astype(int)
        df['is_high_value_buyer'] = (df['purchase_avg'] > df['purchase_avg'].median()).astype(int)
        
        return df
    
    def _find_optimal_clusters(self, features_df: pd.DataFrame) -> int:
        """Find optimal number of clusters using elbow method and silhouette score"""
        min_k = self.config['min_clusters']
        max_k = min(self.config['max_clusters'], len(features_df) - 1)
        
        scores = []
        
        for k in range(min_k, max_k + 1):
            kmeans = KMeans(n_clusters=k, random_state=self.config['random_state'])
            labels = kmeans.fit_predict(features_df)
            
            # Calculate silhouette score
            if k > 1:
                silhouette = silhouette_score(features_df, labels)
                scores.append((k, silhouette))
        
        # Find k with highest silhouette score
        if scores:
            optimal_k = max(scores, key=lambda x: x[1])[0]
        else:
            optimal_k = min_k
        
        logger.info(f"Optimal number of clusters: {optimal_k}")
        return optimal_k
    
    def _get_clustering_model(self, n_clusters: int):
        """Get clustering model based on algorithm"""
        algorithm = self.config['algorithm']
        
        if algorithm == 'kmeans':
            return KMeans(
                n_clusters=n_clusters,
                random_state=self.config['random_state'],
                n_init=10
            )
        elif algorithm == 'dbscan':
            return DBSCAN(
                eps=0.5,
                min_samples=5
            )
        elif algorithm == 'hierarchical':
            return AgglomerativeClustering(
                n_clusters=n_clusters,
                linkage='ward'
            )
        else:
            raise ValueError(f"Unknown clustering algorithm: {algorithm}")
    
    def _analyze_segments(self, original_df: pd.DataFrame, 
                         features_df: pd.DataFrame, 
                         clusters: np.ndarray) -> List[Dict[str, Any]]:
        """Analyze characteristics of each segment"""
        segments = []
        
        # Add cluster labels to original data
        original_df['cluster'] = clusters
        
        for cluster_id in np.unique(clusters):
            cluster_mask = clusters == cluster_id
            cluster_data = original_df[original_df['cluster'] == cluster_id]
            cluster_size = len(cluster_data)
            
            # Basic statistics
            segment = {
                'id': int(cluster_id),
                'size': cluster_size,
                'percentage': cluster_size / len(original_df) * 100,
                'name': f'Segment {cluster_id + 1}',
                'characteristics': {}
            }
            
            # Age characteristics
            if 'age' in cluster_data.columns:
                segment['characteristics']['age'] = {
                    'mean': float(cluster_data['age'].mean()),
                    'median': float(cluster_data['age'].median()),
                    'range': [float(cluster_data['age'].min()), float(cluster_data['age'].max())]
                }
            
            # Gender distribution
            if 'gender' in cluster_data.columns:
                gender_dist = cluster_data['gender'].value_counts(normalize=True).to_dict()
                segment['characteristics']['gender_distribution'] = gender_dist
            
            # Location distribution
            if 'location' in cluster_data.columns:
                top_locations = cluster_data['location'].value_counts().head(5).to_dict()
                segment['characteristics']['top_locations'] = top_locations
            
            # Device usage
            if 'device_type' in cluster_data.columns:
                device_dist = cluster_data['device_type'].value_counts(normalize=True).to_dict()
                segment['characteristics']['device_distribution'] = device_dist
            
            # Behavior metrics
            behavior_metrics = ['clicks', 'impressions', 'conversions', 'behavior_score']
            for metric in behavior_metrics:
                if metric in cluster_data.columns:
                    segment['characteristics'][metric] = {
                        'mean': float(cluster_data[metric].mean()),
                        'median': float(cluster_data[metric].median())
                    }
            
            # Purchase behavior
            if 'purchase_history' in original_df.columns:
                purchase_stats = self._analyze_purchase_behavior(cluster_data['purchase_history'])
                segment['characteristics']['purchase_behavior'] = purchase_stats
            
            # Assign segment name based on characteristics
            segment['name'] = self._generate_segment_name(segment['characteristics'])
            
            # Calculate segment value score
            segment['value_score'] = self._calculate_segment_value(segment['characteristics'])
            
            segments.append(segment)
        
        # Sort by value score
        segments.sort(key=lambda x: x['value_score'], reverse=True)
        
        return segments
    
    def _analyze_purchase_behavior(self, purchase_data: pd.Series) -> Dict[str, Any]:
        """Analyze purchase behavior for a segment"""
        total_purchases = 0
        total_value = 0
        purchase_counts = []
        
        for purchases in purchase_data:
            if isinstance(purchases, dict):
                count = purchases.get('count', 0)
                value = purchases.get('total', 0)
            elif isinstance(purchases, (int, float)):
                count = 1
                value = purchases
            else:
                count = 0
                value = 0
            
            total_purchases += count
            total_value += value
            purchase_counts.append(count)
        
        return {
            'avg_purchases_per_user': total_purchases / len(purchase_data) if len(purchase_data) > 0 else 0,
            'avg_purchase_value': total_value / total_purchases if total_purchases > 0 else 0,
            'total_segment_value': total_value,
            'high_value_users_pct': sum(1 for c in purchase_counts if c > np.median(purchase_counts)) / len(purchase_counts) * 100 if purchase_counts else 0
        }
    
    def _generate_segment_name(self, characteristics: Dict[str, Any]) -> str:
        """Generate descriptive name for segment"""
        name_parts = []
        
        # Age-based naming
        if 'age' in characteristics:
            avg_age = characteristics['age']['mean']
            if avg_age < 25:
                name_parts.append("Young")
            elif avg_age < 35:
                name_parts.append("Millennial")
            elif avg_age < 50:
                name_parts.append("Mid-Age")
            else:
                name_parts.append("Mature")
        
        # Behavior-based naming
        if 'conversions' in characteristics:
            conv_mean = characteristics['conversions']['mean']
            if conv_mean > 0:
                name_parts.append("Converters")
        
        # Purchase-based naming
        if 'purchase_behavior' in characteristics:
            avg_purchases = characteristics['purchase_behavior']['avg_purchases_per_user']
            if avg_purchases > 2:
                name_parts.append("Frequent Buyers")
            elif avg_purchases > 0:
                name_parts.append("Occasional Buyers")
            else:
                name_parts.append("Browsers")
        
        # Device-based naming
        if 'device_distribution' in characteristics:
            top_device = max(characteristics['device_distribution'].items(), key=lambda x: x[1])[0]
            if 'mobile' in top_device.lower():
                name_parts.append("Mobile Users")
        
        return " ".join(name_parts) if name_parts else "General Audience"
    
    def _calculate_segment_value(self, characteristics: Dict[str, Any]) -> float:
        """Calculate value score for a segment"""
        value_score = 0.0
        
        # Conversion rate contributes to value
        if 'conversions' in characteristics:
            value_score += characteristics['conversions']['mean'] * 10
        
        # Purchase behavior contributes to value
        if 'purchase_behavior' in characteristics:
            pb = characteristics['purchase_behavior']
            value_score += pb['avg_purchases_per_user'] * 5
            value_score += pb['avg_purchase_value'] * 0.1
        
        # Engagement contributes to value
        if 'clicks' in characteristics:
            value_score += characteristics['clicks']['mean'] * 0.5
        
        return value_score
    
    def _calculate_quality_metrics(self, features_df: pd.DataFrame, clusters: np.ndarray) -> Dict[str, float]:
        """Calculate clustering quality metrics"""
        metrics = {}
        
        # Silhouette score
        if len(np.unique(clusters)) > 1:
            metrics['silhouette_score'] = silhouette_score(features_df, clusters)
            metrics['davies_bouldin_score'] = davies_bouldin_score(features_df, clusters)
        else:
            metrics['silhouette_score'] = 0
            metrics['davies_bouldin_score'] = 0
        
        # Cluster size variance
        cluster_sizes = pd.Series(clusters).value_counts()
        metrics['size_variance'] = cluster_sizes.std() / cluster_sizes.mean() if len(cluster_sizes) > 0 else 0
        
        # Overall quality score (0-1)
        quality_score = 0
        if metrics['silhouette_score'] > 0:
            quality_score += metrics['silhouette_score'] * 0.5
        if metrics['davies_bouldin_score'] > 0:
            quality_score += (1 / (1 + metrics['davies_bouldin_score'])) * 0.3
        quality_score += (1 - min(1, metrics['size_variance'])) * 0.2
        
        metrics['overall_quality'] = quality_score
        
        return metrics
    
    def _generate_segment_recommendations(self, segments: List[Dict[str, Any]]) -> List[str]:
        """Generate recommendations based on segments"""
        recommendations = []
        
        # High-value segment recommendations
        high_value_segments = [s for s in segments if s['value_score'] > np.mean([s['value_score'] for s in segments])]
        if high_value_segments:
            recommendations.append(
                f"Focus budget on {len(high_value_segments)} high-value segments "
                f"representing {sum(s['percentage'] for s in high_value_segments):.1f}% of audience"
            )
        
        # Small segment recommendations
        small_segments = [s for s in segments if s['percentage'] < 10]
        if len(small_segments) > len(segments) / 2:
            recommendations.append(
                "Consider consolidating small segments for more efficient targeting"
            )
        
        # Segment-specific recommendations
        for segment in segments[:3]:  # Top 3 segments
            if 'purchase_behavior' in segment['characteristics']:
                pb = segment['characteristics']['purchase_behavior']
                if pb['avg_purchases_per_user'] > 2:
                    recommendations.append(
                        f"'{segment['name']}' shows high purchase frequency - "
                        "consider loyalty programs or upselling"
                    )
                elif pb['avg_purchases_per_user'] < 0.5:
                    recommendations.append(
                        f"'{segment['name']}' has low conversion - "
                        "test different messaging or offers"
                    )
        
        # Device-specific recommendations
        mobile_heavy_segments = [
            s for s in segments 
            if 'device_distribution' in s['characteristics'] 
            and s['characteristics']['device_distribution'].get('mobile', 0) > 0.7
        ]
        if mobile_heavy_segments:
            recommendations.append(
                f"{len(mobile_heavy_segments)} segments are mobile-dominant - "
                "ensure mobile-optimized creatives and landing pages"
            )
        
        return recommendations
    
    def _calculate_feature_importance(self, feature_names: List[str]) -> Dict[str, float]:
        """Calculate feature importance from PCA"""
        if self.pca is None:
            return {}
        
        # Get absolute values of loadings
        loadings = np.abs(self.pca.components_)
        
        # Sum loadings across components weighted by explained variance
        importance = np.zeros(len(feature_names))
        for i, component in enumerate(loadings):
            importance += component * self.pca.explained_variance_ratio_[i]
        
        # Normalize
        importance = importance / importance.sum()
        
        # Create importance dict
        importance_dict = {
            feature: float(imp) 
            for feature, imp in zip(feature_names, importance)
        }
        
        # Sort by importance
        return dict(sorted(importance_dict.items(), key=lambda x: x[1], reverse=True))
    
    def _prepare_visualization_data(self, features_df: pd.DataFrame, clusters: np.ndarray) -> Dict[str, Any]:
        """Prepare data for visualization"""
        # Use first 2 PCA components for 2D visualization
        if features_df.shape[1] > 2:
            pca_2d = PCA(n_components=2, random_state=self.config['random_state'])
            coords_2d = pca_2d.fit_transform(features_df)
        else:
            coords_2d = features_df.values
        
        return {
            'scatter_data': {
                'x': coords_2d[:, 0].tolist(),
                'y': coords_2d[:, 1].tolist(),
                'cluster': clusters.tolist()
            },
            'explained_variance': float(pca_2d.explained_variance_ratio_.sum()) if 'pca_2d' in locals() else 1.0
        }
    
    def _calculate_prediction_confidence(self, features: pd.DataFrame, cluster_id: int) -> float:
        """Calculate confidence of cluster prediction"""
        if hasattr(self.clustering_model, 'transform'):
            # For KMeans, use distance to cluster center
            distances = self.clustering_model.transform(features)
            cluster_distance = distances[0, cluster_id]
            all_distances = distances[0]
            
            # Convert to confidence (inverse of relative distance)
            min_distance = all_distances.min()
            confidence = 1 - (cluster_distance - min_distance) / (all_distances.max() - min_distance)
            return float(confidence)
        
        return 0.8  # Default confidence
    
    def _get_single_segment_result(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Return result when data is too small for segmentation"""
        return {
            'num_segments': 1,
            'segments': [{
                'id': 0,
                'size': len(df),
                'percentage': 100.0,
                'name': 'All Users',
                'characteristics': {
                    'note': 'Insufficient data for segmentation'
                },
                'value_score': 0
            }],
            'quality_metrics': {'overall_quality': 0},
            'recommendations': ['Collect more audience data for effective segmentation'],
            'feature_importance': {},
            'visualization_data': {}
        }
    
    def _get_error_result(self, error_message: str) -> Dict[str, Any]:
        """Return error result"""
        return {
            'num_segments': 0,
            'segments': [],
            'quality_metrics': {},
            'recommendations': [f'Error occurred: {error_message}'],
            'feature_importance': {},
            'visualization_data': {},
            'error': error_message
        }