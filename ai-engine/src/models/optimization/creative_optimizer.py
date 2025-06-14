#!/usr/bin/env python3
"""
Creative optimization model for ad creatives
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
import logging
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
import cv2
import hashlib
from collections import Counter

logger = logging.getLogger(__name__)


class CreativeOptimizer:
    """Optimize ad creatives based on performance data"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize creative optimizer"""
        self.config = config or self._get_default_config()
        self.creative_clusters = None
        self.performance_model = None
        self.scaler = StandardScaler()
        self.pca = None
        
    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration"""
        return {
            'min_impressions': 1000,
            'confidence_threshold': 0.95,
            'n_clusters': 5,
            'image_size': (224, 224),
            'color_bins': 64,
            'random_state': 42
        }
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return True  # Simple implementation for now
    
    def analyze_creatives(self, creative_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze creative performance and provide optimization insights"""
        try:
            if not creative_data:
                return self._get_empty_analysis()
            
            # Convert to DataFrame
            df = pd.DataFrame(creative_data)
            
            # Extract features
            features_df = self._extract_creative_features(df)
            
            # Analyze performance patterns
            performance_analysis = self._analyze_performance_patterns(df, features_df)
            
            # Cluster creatives
            clusters = self._cluster_creatives(features_df)
            
            # Identify winning patterns
            winning_patterns = self._identify_winning_patterns(df, features_df, clusters)
            
            # Generate recommendations
            recommendations = self._generate_creative_recommendations(
                df, winning_patterns, performance_analysis
            )
            
            # Predict performance for new creatives
            performance_predictions = self._predict_creative_performance(df, features_df)
            
            return {
                'total_creatives': len(df),
                'performance_analysis': performance_analysis,
                'winning_patterns': winning_patterns,
                'creative_clusters': self._analyze_clusters(df, clusters),
                'recommendations': recommendations,
                'performance_predictions': performance_predictions,
                'optimization_opportunities': self._identify_optimization_opportunities(df)
            }
            
        except Exception as e:
            logger.error(f"Error analyzing creatives: {e}")
            return self._get_error_analysis(str(e))
    
    def optimize_creative_mix(self, creative_data: List[Dict[str, Any]],
                            constraints: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Optimize the mix of creatives for campaigns"""
        try:
            df = pd.DataFrame(creative_data)
            constraints = constraints or {}
            
            # Calculate creative scores
            creative_scores = self._calculate_creative_scores(df)
            
            # Optimize allocation
            optimal_allocation = self._optimize_creative_allocation(
                df, creative_scores, constraints
            )
            
            # Calculate expected improvements
            expected_improvements = self._calculate_expected_improvements(
                df, optimal_allocation
            )
            
            return {
                'optimal_allocation': optimal_allocation,
                'expected_improvements': expected_improvements,
                'creative_scores': creative_scores,
                'recommendations': self._generate_allocation_recommendations(
                    df, optimal_allocation
                )
            }
            
        except Exception as e:
            logger.error(f"Error optimizing creative mix: {e}")
            return {'error': str(e)}
    
    def _extract_creative_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract features from creative data"""
        features = pd.DataFrame()
        
        # Text features
        if 'headline' in df.columns:
            text_features = self._extract_text_features(df['headline'])
            features = pd.concat([features, text_features], axis=1)
        
        if 'description' in df.columns:
            desc_features = self._extract_text_features(df['description'], prefix='desc_')
            features = pd.concat([features, desc_features], axis=1)
        
        # Visual features (if image data available)
        if 'image_url' in df.columns or 'image_data' in df.columns:
            visual_features = self._extract_visual_features(df)
            features = pd.concat([features, visual_features], axis=1)
        
        # Format features
        if 'format' in df.columns:
            format_features = pd.get_dummies(df['format'], prefix='format')
            features = pd.concat([features, format_features], axis=1)
        
        # Platform features
        if 'platform' in df.columns:
            platform_features = pd.get_dummies(df['platform'], prefix='platform')
            features = pd.concat([features, platform_features], axis=1)
        
        # Fill NaN values
        features = features.fillna(0)
        
        return features
    
    def _extract_text_features(self, text_series: pd.Series, prefix: str = '') -> pd.DataFrame:
        """Extract features from text"""
        features = pd.DataFrame()
        
        # Length features
        features[f'{prefix}length'] = text_series.str.len().fillna(0)
        features[f'{prefix}word_count'] = text_series.str.split().str.len().fillna(0)
        
        # Sentiment features
        features[f'{prefix}exclamation'] = text_series.str.count('!').fillna(0)
        features[f'{prefix}question'] = text_series.str.count('\\?').fillna(0)
        features[f'{prefix}emoji_count'] = text_series.str.count('[😀-🙏]').fillna(0)
        
        # Keywords
        power_words = ['free', 'save', 'new', 'exclusive', 'limited', 'best', 'guaranteed']
        for word in power_words:
            features[f'{prefix}has_{word}'] = text_series.str.lower().str.contains(word, na=False).astype(int)
        
        # CTA presence
        cta_words = ['shop', 'buy', 'get', 'try', 'learn', 'discover', 'start']
        features[f'{prefix}has_cta'] = text_series.str.lower().str.contains('|'.join(cta_words), na=False).astype(int)
        
        return features
    
    def _extract_visual_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract visual features from images"""
        features = pd.DataFrame()
        
        # Simplified visual features (would need actual image processing)
        # For now, create mock features
        np.random.seed(42)
        
        # Color features
        features['dominant_color_hue'] = np.random.rand(len(df))
        features['color_diversity'] = np.random.rand(len(df))
        features['brightness'] = np.random.rand(len(df))
        features['contrast'] = np.random.rand(len(df))
        
        # Composition features
        features['has_text_overlay'] = np.random.choice([0, 1], len(df))
        features['has_logo'] = np.random.choice([0, 1], len(df))
        features['has_people'] = np.random.choice([0, 1], len(df))
        features['has_product'] = np.random.choice([0, 1], len(df))
        
        return features
    
    def _analyze_performance_patterns(self, df: pd.DataFrame, 
                                    features_df: pd.DataFrame) -> Dict[str, Any]:
        """Analyze performance patterns in creatives"""
        analysis = {}
        
        # Performance metrics
        metrics = ['ctr', 'cvr', 'cpc', 'roas']
        available_metrics = [m for m in metrics if m in df.columns]
        
        for metric in available_metrics:
            # Top performing creatives
            top_performers = df.nlargest(5, metric)
            
            # Bottom performing creatives
            bottom_performers = df.nsmallest(5, metric)
            
            # Performance distribution
            analysis[metric] = {
                'mean': float(df[metric].mean()),
                'median': float(df[metric].median()),
                'std': float(df[metric].std()),
                'top_performers': top_performers[['creative_id', metric]].to_dict('records'),
                'bottom_performers': bottom_performers[['creative_id', metric]].to_dict('records')
            }
        
        # Feature correlations with performance
        if 'ctr' in df.columns:
            correlations = features_df.corrwith(df['ctr']).sort_values(ascending=False)
            analysis['ctr_correlations'] = {
                'positive': correlations.head(10).to_dict(),
                'negative': correlations.tail(10).to_dict()
            }
        
        return analysis
    
    def _cluster_creatives(self, features_df: pd.DataFrame) -> np.ndarray:
        """Cluster creatives based on features"""
        if len(features_df) < self.config['n_clusters']:
            return np.zeros(len(features_df))
        
        # Scale features
        features_scaled = self.scaler.fit_transform(features_df)
        
        # Apply PCA if high dimensional
        if features_scaled.shape[1] > 20:
            self.pca = PCA(n_components=0.95, random_state=self.config['random_state'])
            features_scaled = self.pca.fit_transform(features_scaled)
        
        # Cluster
        kmeans = KMeans(
            n_clusters=min(self.config['n_clusters'], len(features_df)),
            random_state=self.config['random_state']
        )
        clusters = kmeans.fit_predict(features_scaled)
        
        self.creative_clusters = kmeans
        
        return clusters
    
    def _identify_winning_patterns(self, df: pd.DataFrame,
                                 features_df: pd.DataFrame,
                                 clusters: np.ndarray) -> List[Dict[str, Any]]:
        """Identify patterns in winning creatives"""
        patterns = []
        
        # Add cluster labels
        df['cluster'] = clusters
        
        # Analyze each cluster
        for cluster_id in np.unique(clusters):
            cluster_mask = clusters == cluster_id
            cluster_df = df[cluster_mask]
            cluster_features = features_df[cluster_mask]
            
            if len(cluster_df) < 5:
                continue
            
            # Calculate cluster performance
            cluster_performance = {
                'cluster_id': int(cluster_id),
                'size': len(cluster_df),
                'avg_ctr': float(cluster_df['ctr'].mean()) if 'ctr' in cluster_df else 0,
                'avg_cvr': float(cluster_df['cvr'].mean()) if 'cvr' in cluster_df else 0,
                'avg_roas': float(cluster_df['roas'].mean()) if 'roas' in cluster_df else 0
            }
            
            # Identify distinguishing features
            if len(features_df) > len(cluster_features):
                other_features = features_df[~cluster_mask]
                distinguishing = {}
                
                for col in cluster_features.columns:
                    cluster_mean = cluster_features[col].mean()
                    other_mean = other_features[col].mean()
                    
                    if abs(cluster_mean - other_mean) > 0.2:  # Significant difference
                        distinguishing[col] = {
                            'cluster_mean': float(cluster_mean),
                            'other_mean': float(other_mean),
                            'difference': float(cluster_mean - other_mean)
                        }
                
                cluster_performance['distinguishing_features'] = distinguishing
            
            patterns.append(cluster_performance)
        
        # Sort by performance
        patterns.sort(key=lambda x: x.get('avg_ctr', 0), reverse=True)
        
        return patterns
    
    def _generate_creative_recommendations(self, df: pd.DataFrame,
                                         winning_patterns: List[Dict[str, Any]],
                                         performance_analysis: Dict[str, Any]) -> List[str]:
        """Generate recommendations for creative optimization"""
        recommendations = []
        
        # Performance-based recommendations
        if 'ctr' in performance_analysis:
            ctr_analysis = performance_analysis['ctr']
            if ctr_analysis['std'] > ctr_analysis['mean'] * 0.5:
                recommendations.append(
                    "High CTR variance detected. Consider pausing bottom 20% of creatives "
                    f"(CTR < {ctr_analysis['mean'] - ctr_analysis['std']:.3f})"
                )
        
        # Pattern-based recommendations
        if winning_patterns:
            top_pattern = winning_patterns[0]
            if top_pattern.get('distinguishing_features'):
                features = list(top_pattern['distinguishing_features'].keys())[:3]
                recommendations.append(
                    f"Top performing cluster has distinct features: {', '.join(features)}. "
                    "Create more creatives with these characteristics"
                )
        
        # Format recommendations
        format_performance = df.groupby('format')['ctr'].mean() if 'format' in df.columns and 'ctr' in df.columns else None
        if format_performance is not None and len(format_performance) > 1:
            best_format = format_performance.idxmax()
            recommendations.append(
                f"'{best_format}' format shows best CTR performance. "
                "Consider allocating more budget to this format"
            )
        
        # Freshness recommendations
        if 'created_at' in df.columns:
            df['age_days'] = (pd.Timestamp.now() - pd.to_datetime(df['created_at'])).dt.days
            old_creatives = df[df['age_days'] > 30]
            if len(old_creatives) > len(df) * 0.3:
                recommendations.append(
                    f"{len(old_creatives)} creatives are over 30 days old. "
                    "Consider refreshing creative assets to combat ad fatigue"
                )
        
        # A/B testing recommendations
        if len(df) < 10:
            recommendations.append(
                "Limited creative variations detected. "
                "Implement A/B testing with at least 3-5 variants per campaign"
            )
        
        return recommendations
    
    def _predict_creative_performance(self, df: pd.DataFrame,
                                    features_df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Predict performance for creatives"""
        predictions = []
        
        # Simple prediction based on cluster performance
        if hasattr(self, 'creative_clusters') and self.creative_clusters is not None:
            cluster_labels = self.creative_clusters.predict(self.scaler.transform(features_df))
            
            # Calculate cluster average performance
            cluster_performance = df.groupby('cluster')[['ctr', 'cvr', 'roas']].mean()
            
            for idx, row in df.iterrows():
                cluster = cluster_labels[idx] if idx < len(cluster_labels) else 0
                
                prediction = {
                    'creative_id': row.get('creative_id', idx),
                    'predicted_cluster': int(cluster),
                    'expected_ctr': float(cluster_performance.loc[cluster, 'ctr']) if cluster in cluster_performance.index else 0,
                    'expected_cvr': float(cluster_performance.loc[cluster, 'cvr']) if cluster in cluster_performance.index else 0,
                    'confidence': 0.7  # Simplified confidence
                }
                predictions.append(prediction)
        
        return predictions[:10]  # Return top 10
    
    def _analyze_clusters(self, df: pd.DataFrame, clusters: np.ndarray) -> List[Dict[str, Any]]:
        """Analyze creative clusters"""
        cluster_analysis = []
        
        df['cluster'] = clusters
        
        for cluster_id in np.unique(clusters):
            cluster_df = df[df['cluster'] == cluster_id]
            
            analysis = {
                'cluster_id': int(cluster_id),
                'size': len(cluster_df),
                'platforms': cluster_df['platform'].value_counts().to_dict() if 'platform' in cluster_df else {},
                'formats': cluster_df['format'].value_counts().to_dict() if 'format' in cluster_df else {},
                'performance': {
                    'avg_impressions': float(cluster_df['impressions'].mean()) if 'impressions' in cluster_df else 0,
                    'avg_clicks': float(cluster_df['clicks'].mean()) if 'clicks' in cluster_df else 0,
                    'avg_ctr': float(cluster_df['ctr'].mean()) if 'ctr' in cluster_df else 0,
                    'avg_cvr': float(cluster_df['cvr'].mean()) if 'cvr' in cluster_df else 0
                }
            }
            
            cluster_analysis.append(analysis)
        
        return cluster_analysis
    
    def _identify_optimization_opportunities(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Identify specific optimization opportunities"""
        opportunities = []
        
        # Low CTR creatives with high impressions
        if 'ctr' in df.columns and 'impressions' in df.columns:
            low_ctr_high_impression = df[
                (df['ctr'] < df['ctr'].quantile(0.25)) & 
                (df['impressions'] > df['impressions'].quantile(0.75))
            ]
            
            if not low_ctr_high_impression.empty:
                opportunities.append({
                    'type': 'low_ctr_high_impression',
                    'impact': 'high',
                    'creatives': low_ctr_high_impression['creative_id'].tolist()[:5],
                    'recommendation': 'These creatives have high reach but low engagement. Consider refreshing creative elements'
                })
        
        # High CPC creatives
        if 'cpc' in df.columns:
            high_cpc = df[df['cpc'] > df['cpc'].quantile(0.9)]
            
            if not high_cpc.empty:
                opportunities.append({
                    'type': 'high_cpc',
                    'impact': 'medium',
                    'creatives': high_cpc['creative_id'].tolist()[:5],
                    'recommendation': 'These creatives have high cost per click. Review targeting or creative relevance'
                })
        
        # Underperforming formats
        if 'format' in df.columns and 'ctr' in df.columns:
            format_performance = df.groupby('format').agg({
                'ctr': 'mean',
                'impressions': 'sum'
            })
            
            underperforming_formats = format_performance[
                format_performance['ctr'] < format_performance['ctr'].mean() * 0.8
            ]
            
            for format_type in underperforming_formats.index:
                opportunities.append({
                    'type': 'underperforming_format',
                    'impact': 'medium',
                    'format': format_type,
                    'recommendation': f"'{format_type}' format underperforms. Consider reducing allocation or improving creatives"
                })
        
        return opportunities
    
    def _calculate_creative_scores(self, df: pd.DataFrame) -> Dict[str, float]:
        """Calculate performance scores for each creative"""
        scores = {}
        
        # Normalize metrics
        metrics = ['ctr', 'cvr', 'roas']
        weights = {'ctr': 0.3, 'cvr': 0.4, 'roas': 0.3}
        
        for idx, row in df.iterrows():
            creative_id = row.get('creative_id', idx)
            score = 0
            
            for metric, weight in weights.items():
                if metric in row and pd.notna(row[metric]):
                    # Normalize (0-1)
                    if df[metric].max() > df[metric].min():
                        normalized = (row[metric] - df[metric].min()) / (df[metric].max() - df[metric].min())
                        score += normalized * weight
            
            scores[creative_id] = score
        
        return scores
    
    def _optimize_creative_allocation(self, df: pd.DataFrame,
                                    creative_scores: Dict[str, float],
                                    constraints: Dict[str, Any]) -> Dict[str, float]:
        """Optimize budget allocation across creatives"""
        # Simple allocation based on scores
        total_budget = constraints.get('total_budget', 1.0)
        min_allocation = constraints.get('min_allocation', 0.05)
        
        # Filter creatives by minimum impressions
        eligible_creatives = df[
            df['impressions'] >= self.config['min_impressions']
        ] if 'impressions' in df.columns else df
        
        # Calculate allocations proportional to scores
        total_score = sum(creative_scores.values())
        allocations = {}
        
        for creative_id, score in creative_scores.items():
            if creative_id in eligible_creatives['creative_id'].values:
                allocation = (score / total_score) * total_budget if total_score > 0 else 0
                allocation = max(allocation, min_allocation * total_budget)
                allocations[creative_id] = allocation
        
        # Normalize to ensure sum equals total budget
        allocation_sum = sum(allocations.values())
        if allocation_sum > 0:
            allocations = {
                cid: (alloc / allocation_sum) * total_budget
                for cid, alloc in allocations.items()
            }
        
        return allocations
    
    def _calculate_expected_improvements(self, df: pd.DataFrame,
                                       optimal_allocation: Dict[str, float]) -> Dict[str, Any]:
        """Calculate expected improvements from optimization"""
        current_performance = {
            'total_spend': df['spend'].sum() if 'spend' in df else 0,
            'total_clicks': df['clicks'].sum() if 'clicks' in df else 0,
            'total_conversions': df['conversions'].sum() if 'conversions' in df else 0,
            'avg_ctr': df['ctr'].mean() if 'ctr' in df else 0,
            'avg_cvr': df['cvr'].mean() if 'cvr' in df else 0
        }
        
        # Estimate optimized performance
        optimized_performance = {
            'total_spend': sum(optimal_allocation.values()),
            'total_clicks': 0,
            'total_conversions': 0
        }
        
        for creative_id, allocation in optimal_allocation.items():
            creative_data = df[df['creative_id'] == creative_id]
            if not creative_data.empty:
                row = creative_data.iloc[0]
                
                # Estimate based on historical performance
                if 'ctr' in row and 'impressions' in row:
                    est_impressions = allocation * 1000  # Simplified
                    est_clicks = est_impressions * row['ctr']
                    optimized_performance['total_clicks'] += est_clicks
                
                if 'cvr' in row and 'clicks' in row:
                    est_conversions = est_clicks * row['cvr'] if 'est_clicks' in locals() else 0
                    optimized_performance['total_conversions'] += est_conversions
        
        return {
            'current': current_performance,
            'optimized': optimized_performance,
            'expected_lift': {
                'clicks': ((optimized_performance['total_clicks'] - current_performance['total_clicks']) / 
                          current_performance['total_clicks'] * 100 if current_performance['total_clicks'] > 0 else 0),
                'conversions': ((optimized_performance['total_conversions'] - current_performance['total_conversions']) / 
                               current_performance['total_conversions'] * 100 if current_performance['total_conversions'] > 0 else 0)
            }
        }
    
    def _generate_allocation_recommendations(self, df: pd.DataFrame,
                                           optimal_allocation: Dict[str, float]) -> List[str]:
        """Generate recommendations for creative allocation"""
        recommendations = []
        
        # Identify major changes
        current_allocations = df.set_index('creative_id')['spend'] if 'spend' in df.columns else None
        
        if current_allocations is not None:
            for creative_id, new_allocation in optimal_allocation.items():
                if creative_id in current_allocations.index:
                    current = current_allocations[creative_id]
                    change_pct = ((new_allocation - current) / current * 100) if current > 0 else 0
                    
                    if change_pct > 50:
                        recommendations.append(
                            f"Increase budget for creative '{creative_id}' by {change_pct:.0f}%"
                        )
                    elif change_pct < -50:
                        recommendations.append(
                            f"Decrease budget for creative '{creative_id}' by {abs(change_pct):.0f}%"
                        )
        
        # Recommend pausing poor performers
        zero_allocation = [cid for cid in df['creative_id'] if cid not in optimal_allocation]
        if zero_allocation:
            recommendations.append(
                f"Consider pausing {len(zero_allocation)} underperforming creatives"
            )
        
        return recommendations
    
    def _get_empty_analysis(self) -> Dict[str, Any]:
        """Return empty analysis structure"""
        return {
            'total_creatives': 0,
            'performance_analysis': {},
            'winning_patterns': [],
            'creative_clusters': [],
            'recommendations': ['No creative data available for analysis'],
            'performance_predictions': [],
            'optimization_opportunities': []
        }
    
    def _get_error_analysis(self, error: str) -> Dict[str, Any]:
        """Return error analysis structure"""
        return {
            'total_creatives': 0,
            'performance_analysis': {},
            'winning_patterns': [],
            'creative_clusters': [],
            'recommendations': [f'Analysis error: {error}'],
            'performance_predictions': [],
            'optimization_opportunities': [],
            'error': error
        }