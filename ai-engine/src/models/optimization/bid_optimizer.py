#!/usr/bin/env python3
"""
Bid optimization model for automated bidding strategies
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
import logging
from scipy.optimize import minimize, differential_evolution
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')

logger = logging.getLogger(__name__)


class BidOptimizer:
    """Optimize bids for advertising campaigns"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize bid optimizer"""
        self.config = config or self._get_default_config()
        self.bid_predictor = None
        self.scaler = StandardScaler()
        self.optimization_history = []
        self.performance_model = None
        
    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration"""
        return {
            'min_bid': 0.01,
            'max_bid': 100.0,
            'learning_rate': 0.1,
            'exploration_rate': 0.2,
            'optimization_method': 'differential_evolution',
            'confidence_threshold': 0.8,
            'safety_margin': 0.1,
            'bid_adjustment_cap': 0.5,  # Max 50% change per optimization
            'random_state': 42
        }
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.bid_predictor is not None
    
    def optimize_bids(self, campaign_data: pd.DataFrame, 
                     constraints: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Optimize bids for campaigns"""
        try:
            logger.info(f"Optimizing bids for {len(campaign_data)} campaigns")
            
            # Prepare data
            features, current_bids = self._prepare_campaign_data(campaign_data)
            
            # Train performance model if needed
            if self.performance_model is None:
                self._train_performance_model(features, campaign_data)
            
            # Set constraints
            constraints = constraints or {}
            total_budget = constraints.get('total_budget', sum(campaign_data['daily_budget']))
            min_roi = constraints.get('min_roi', 1.0)
            
            # Optimize bids
            if self.config['optimization_method'] == 'differential_evolution':
                optimized_bids = self._optimize_with_de(
                    features, current_bids, total_budget, min_roi
                )
            else:
                optimized_bids = self._optimize_with_gradient(
                    features, current_bids, total_budget, min_roi
                )
            
            # Apply safety checks
            safe_bids = self._apply_safety_constraints(current_bids, optimized_bids)
            
            # Calculate expected improvements
            improvements = self._calculate_expected_improvements(
                features, current_bids, safe_bids, campaign_data
            )
            
            # Generate recommendations
            recommendations = self._generate_bid_recommendations(
                campaign_data, current_bids, safe_bids, improvements
            )
            
            # Store optimization history
            self._update_optimization_history(campaign_data, safe_bids, improvements)
            
            return {
                'optimized_bids': safe_bids,
                'expected_improvements': improvements,
                'recommendations': recommendations,
                'constraints_satisfied': self._check_constraints_satisfied(
                    safe_bids, total_budget, improvements, min_roi
                ),
                'optimization_summary': self._create_optimization_summary(
                    current_bids, safe_bids, improvements
                )
            }
            
        except Exception as e:
            logger.error(f"Error optimizing bids: {e}")
            return self._get_fallback_optimization(campaign_data)
    
    def simulate_bid_changes(self, campaign_data: pd.DataFrame,
                           bid_multipliers: Dict[str, float]) -> Dict[str, Any]:
        """Simulate the impact of bid changes"""
        try:
            # Prepare data
            features, current_bids = self._prepare_campaign_data(campaign_data)
            
            # Apply multipliers
            simulated_bids = {}
            for campaign_id, current_bid in current_bids.items():
                multiplier = bid_multipliers.get(campaign_id, 1.0)
                simulated_bids[campaign_id] = current_bid * multiplier
            
            # Predict performance
            predictions = self._predict_performance(features, list(simulated_bids.values()))
            
            # Calculate changes
            current_performance = self._predict_performance(features, list(current_bids.values()))
            
            return {
                'simulated_performance': predictions,
                'current_performance': current_performance,
                'expected_changes': {
                    'clicks': predictions['clicks'] - current_performance['clicks'],
                    'conversions': predictions['conversions'] - current_performance['conversions'],
                    'cost': predictions['cost'] - current_performance['cost'],
                    'roi': predictions['roi'] - current_performance['roi']
                }
            }
            
        except Exception as e:
            logger.error(f"Error simulating bid changes: {e}")
            return {'error': str(e)}
    
    def _prepare_campaign_data(self, campaign_data: pd.DataFrame) -> Tuple[np.ndarray, Dict[str, float]]:
        """Prepare campaign data for optimization"""
        # Extract features
        feature_columns = [
            'impressions', 'clicks', 'conversions', 'ctr', 'cvr',
            'quality_score', 'competition_level', 'dayparting_performance'
        ]
        
        available_features = []
        for col in feature_columns:
            if col in campaign_data.columns:
                available_features.append(col)
        
        # Add derived features
        if 'impressions' in campaign_data.columns and 'clicks' in campaign_data.columns:
            campaign_data['ctr'] = campaign_data['clicks'] / (campaign_data['impressions'] + 1)
        
        if 'clicks' in campaign_data.columns and 'conversions' in campaign_data.columns:
            campaign_data['cvr'] = campaign_data['conversions'] / (campaign_data['clicks'] + 1)
        
        # Fill missing values
        campaign_data['quality_score'] = campaign_data.get('quality_score', 5.0)
        campaign_data['competition_level'] = campaign_data.get('competition_level', 0.5)
        campaign_data['dayparting_performance'] = campaign_data.get('dayparting_performance', 1.0)
        
        # Extract features
        features = campaign_data[available_features].fillna(0).values
        
        # Scale features
        features_scaled = self.scaler.fit_transform(features)
        
        # Extract current bids
        current_bids = {}
        for idx, row in campaign_data.iterrows():
            campaign_id = row.get('campaign_id', idx)
            current_bid = row.get('current_bid', row.get('max_cpc', 1.0))
            current_bids[campaign_id] = current_bid
        
        return features_scaled, current_bids
    
    def _train_performance_model(self, features: np.ndarray, campaign_data: pd.DataFrame):
        """Train model to predict performance based on bids"""
        # Create training data with bid variations
        X_train = []
        y_train_clicks = []
        y_train_conversions = []
        y_train_cost = []
        
        for i, row in campaign_data.iterrows():
            feature_row = features[i]
            current_bid = row.get('max_cpc', 1.0)
            
            # Create variations
            bid_multipliers = [0.5, 0.7, 0.9, 1.0, 1.1, 1.3, 1.5]
            for multiplier in bid_multipliers:
                bid = current_bid * multiplier
                
                # Simulate performance (simplified model)
                expected_clicks = row['clicks'] * (multiplier ** 0.3)
                expected_conversions = row['conversions'] * (multiplier ** 0.2)
                expected_cost = row['spend'] * multiplier
                
                # Add bid as feature
                X_train.append(np.append(feature_row, bid))
                y_train_clicks.append(expected_clicks)
                y_train_conversions.append(expected_conversions)
                y_train_cost.append(expected_cost)
        
        X_train = np.array(X_train)
        
        # Train models
        self.performance_model = {
            'clicks': RandomForestRegressor(n_estimators=50, random_state=self.config['random_state']),
            'conversions': RandomForestRegressor(n_estimators=50, random_state=self.config['random_state']),
            'cost': RandomForestRegressor(n_estimators=50, random_state=self.config['random_state'])
        }
        
        self.performance_model['clicks'].fit(X_train, y_train_clicks)
        self.performance_model['conversions'].fit(X_train, y_train_conversions)
        self.performance_model['cost'].fit(X_train, y_train_cost)
    
    def _optimize_with_de(self, features: np.ndarray, current_bids: Dict[str, float],
                         total_budget: float, min_roi: float) -> Dict[str, float]:
        """Optimize using differential evolution"""
        campaign_ids = list(current_bids.keys())
        current_bid_values = list(current_bids.values())
        
        # Define objective function
        def objective(bids):
            predictions = self._predict_performance_for_bids(features, bids)
            
            # Maximize conversions while respecting constraints
            if predictions['cost'] > total_budget:
                return 1e6  # Penalty for exceeding budget
            
            if predictions['roi'] < min_roi:
                return 1e6  # Penalty for low ROI
            
            # Negative because we minimize
            return -predictions['conversions']
        
        # Set bounds
        bounds = []
        for current_bid in current_bid_values:
            min_bid = max(self.config['min_bid'], current_bid * (1 - self.config['bid_adjustment_cap']))
            max_bid = min(self.config['max_bid'], current_bid * (1 + self.config['bid_adjustment_cap']))
            bounds.append((min_bid, max_bid))
        
        # Optimize
        result = differential_evolution(
            objective,
            bounds,
            seed=self.config['random_state'],
            maxiter=100
        )
        
        # Convert back to dictionary
        optimized_bids = {
            campaign_id: float(bid)
            for campaign_id, bid in zip(campaign_ids, result.x)
        }
        
        return optimized_bids
    
    def _optimize_with_gradient(self, features: np.ndarray, current_bids: Dict[str, float],
                              total_budget: float, min_roi: float) -> Dict[str, float]:
        """Optimize using gradient-based method"""
        campaign_ids = list(current_bids.keys())
        current_bid_values = np.array(list(current_bids.values()))
        
        # Define objective function
        def objective(bids):
            predictions = self._predict_performance_for_bids(features, bids)
            
            # Add penalties for constraint violations
            penalty = 0
            if predictions['cost'] > total_budget:
                penalty += 1000 * (predictions['cost'] - total_budget)
            
            if predictions['roi'] < min_roi:
                penalty += 1000 * (min_roi - predictions['roi'])
            
            return -predictions['conversions'] + penalty
        
        # Set bounds
        bounds = []
        for current_bid in current_bid_values:
            min_bid = max(self.config['min_bid'], current_bid * (1 - self.config['bid_adjustment_cap']))
            max_bid = min(self.config['max_bid'], current_bid * (1 + self.config['bid_adjustment_cap']))
            bounds.append((min_bid, max_bid))
        
        # Optimize
        result = minimize(
            objective,
            current_bid_values,
            method='L-BFGS-B',
            bounds=bounds
        )
        
        # Convert back to dictionary
        optimized_bids = {
            campaign_id: float(bid)
            for campaign_id, bid in zip(campaign_ids, result.x)
        }
        
        return optimized_bids
    
    def _predict_performance_for_bids(self, features: np.ndarray, bids: np.ndarray) -> Dict[str, float]:
        """Predict performance for given bids"""
        # Add bids to features
        X = np.column_stack([features, bids])
        
        # Predict
        clicks = np.sum(self.performance_model['clicks'].predict(X))
        conversions = np.sum(self.performance_model['conversions'].predict(X))
        cost = np.sum(self.performance_model['cost'].predict(X))
        
        # Calculate ROI (assuming $100 per conversion)
        revenue = conversions * 100
        roi = revenue / cost if cost > 0 else 0
        
        return {
            'clicks': clicks,
            'conversions': conversions,
            'cost': cost,
            'revenue': revenue,
            'roi': roi
        }
    
    def _predict_performance(self, features: np.ndarray, bids: List[float]) -> Dict[str, float]:
        """Predict performance metrics"""
        return self._predict_performance_for_bids(features, np.array(bids))
    
    def _apply_safety_constraints(self, current_bids: Dict[str, float],
                                optimized_bids: Dict[str, float]) -> Dict[str, float]:
        """Apply safety constraints to bid changes"""
        safe_bids = {}
        
        for campaign_id, current_bid in current_bids.items():
            optimized_bid = optimized_bids.get(campaign_id, current_bid)
            
            # Limit change magnitude
            max_increase = current_bid * (1 + self.config['bid_adjustment_cap'])
            max_decrease = current_bid * (1 - self.config['bid_adjustment_cap'])
            
            safe_bid = max(max_decrease, min(max_increase, optimized_bid))
            
            # Ensure within global bounds
            safe_bid = max(self.config['min_bid'], min(self.config['max_bid'], safe_bid))
            
            safe_bids[campaign_id] = safe_bid
        
        return safe_bids
    
    def _calculate_expected_improvements(self, features: np.ndarray,
                                       current_bids: Dict[str, float],
                                       optimized_bids: Dict[str, float],
                                       campaign_data: pd.DataFrame) -> Dict[str, Any]:
        """Calculate expected improvements from optimization"""
        # Current performance
        current_perf = self._predict_performance(features, list(current_bids.values()))
        
        # Optimized performance
        optimized_perf = self._predict_performance(features, list(optimized_bids.values()))
        
        # Calculate improvements
        improvements = {
            'clicks_change': optimized_perf['clicks'] - current_perf['clicks'],
            'clicks_change_pct': ((optimized_perf['clicks'] - current_perf['clicks']) / 
                                 current_perf['clicks'] * 100 if current_perf['clicks'] > 0 else 0),
            'conversions_change': optimized_perf['conversions'] - current_perf['conversions'],
            'conversions_change_pct': ((optimized_perf['conversions'] - current_perf['conversions']) / 
                                      current_perf['conversions'] * 100 if current_perf['conversions'] > 0 else 0),
            'cost_change': optimized_perf['cost'] - current_perf['cost'],
            'cost_change_pct': ((optimized_perf['cost'] - current_perf['cost']) / 
                               current_perf['cost'] * 100 if current_perf['cost'] > 0 else 0),
            'roi_change': optimized_perf['roi'] - current_perf['roi'],
            'current_performance': current_perf,
            'optimized_performance': optimized_perf
        }
        
        # Campaign-level improvements
        campaign_improvements = []
        for i, (campaign_id, row) in enumerate(campaign_data.iterrows()):
            current_bid = current_bids.get(campaign_id, row.get('max_cpc', 1.0))
            optimized_bid = optimized_bids.get(campaign_id, current_bid)
            
            campaign_improvements.append({
                'campaign_id': campaign_id,
                'campaign_name': row.get('campaign_name', f'Campaign {campaign_id}'),
                'current_bid': current_bid,
                'optimized_bid': optimized_bid,
                'bid_change': optimized_bid - current_bid,
                'bid_change_pct': ((optimized_bid - current_bid) / current_bid * 100 
                                  if current_bid > 0 else 0)
            })
        
        improvements['campaign_details'] = campaign_improvements
        
        return improvements
    
    def _generate_bid_recommendations(self, campaign_data: pd.DataFrame,
                                    current_bids: Dict[str, float],
                                    optimized_bids: Dict[str, float],
                                    improvements: Dict[str, Any]) -> List[str]:
        """Generate actionable bid recommendations"""
        recommendations = []
        
        # Overall performance improvement
        if improvements['conversions_change_pct'] > 10:
            recommendations.append(
                f"Bid optimization can increase conversions by {improvements['conversions_change_pct']:.1f}% "
                f"with {improvements['cost_change_pct']:.1f}% change in spend"
            )
        
        # Campaign-specific recommendations
        campaign_details = improvements['campaign_details']
        
        # Identify biggest changes
        bid_increases = [c for c in campaign_details if c['bid_change_pct'] > 20]
        bid_decreases = [c for c in campaign_details if c['bid_change_pct'] < -20]
        
        if bid_increases:
            top_increases = sorted(bid_increases, key=lambda x: x['bid_change_pct'], reverse=True)[:3]
            for campaign in top_increases:
                recommendations.append(
                    f"Increase bid for '{campaign['campaign_name']}' by {campaign['bid_change_pct']:.1f}% "
                    f"to ${campaign['optimized_bid']:.2f}"
                )
        
        if bid_decreases:
            top_decreases = sorted(bid_decreases, key=lambda x: x['bid_change_pct'])[:3]
            for campaign in top_decreases:
                recommendations.append(
                    f"Decrease bid for '{campaign['campaign_name']}' by {abs(campaign['bid_change_pct']):.1f}% "
                    f"to ${campaign['optimized_bid']:.2f} to improve efficiency"
                )
        
        # ROI improvement
        if improvements['roi_change'] > 0.1:
            recommendations.append(
                f"Overall ROI expected to improve from {improvements['current_performance']['roi']:.2f} "
                f"to {improvements['optimized_performance']['roi']:.2f}"
            )
        
        # Budget utilization
        current_utilization = improvements['current_performance']['cost'] / campaign_data['daily_budget'].sum() * 100
        optimized_utilization = improvements['optimized_performance']['cost'] / campaign_data['daily_budget'].sum() * 100
        
        if optimized_utilization > current_utilization + 10:
            recommendations.append(
                f"Budget utilization will increase from {current_utilization:.1f}% to {optimized_utilization:.1f}%"
            )
        
        # Warning for significant changes
        high_risk_campaigns = [c for c in campaign_details if abs(c['bid_change_pct']) > 40]
        if high_risk_campaigns:
            recommendations.append(
                f"⚠️ {len(high_risk_campaigns)} campaigns have significant bid changes (>40%). "
                "Consider gradual implementation"
            )
        
        return recommendations
    
    def _check_constraints_satisfied(self, optimized_bids: Dict[str, float],
                                   total_budget: float,
                                   improvements: Dict[str, Any],
                                   min_roi: float) -> Dict[str, bool]:
        """Check if optimization satisfies constraints"""
        optimized_perf = improvements['optimized_performance']
        
        return {
            'budget_constraint': optimized_perf['cost'] <= total_budget,
            'roi_constraint': optimized_perf['roi'] >= min_roi,
            'bid_bounds': all(
                self.config['min_bid'] <= bid <= self.config['max_bid']
                for bid in optimized_bids.values()
            )
        }
    
    def _create_optimization_summary(self, current_bids: Dict[str, float],
                                   optimized_bids: Dict[str, float],
                                   improvements: Dict[str, Any]) -> Dict[str, Any]:
        """Create summary of optimization results"""
        return {
            'total_campaigns': len(current_bids),
            'campaigns_with_bid_increase': sum(
                1 for cid in current_bids 
                if optimized_bids.get(cid, 0) > current_bids[cid]
            ),
            'campaigns_with_bid_decrease': sum(
                1 for cid in current_bids 
                if optimized_bids.get(cid, 0) < current_bids[cid]
            ),
            'average_bid_change': np.mean([
                optimized_bids.get(cid, current_bids[cid]) - current_bids[cid]
                for cid in current_bids
            ]),
            'expected_conversion_lift': improvements['conversions_change_pct'],
            'expected_roi_change': improvements['roi_change'],
            'optimization_confidence': self._calculate_optimization_confidence(improvements)
        }
    
    def _calculate_optimization_confidence(self, improvements: Dict[str, Any]) -> float:
        """Calculate confidence in optimization results"""
        # Simple confidence based on expected improvements
        confidence = 0.5  # Base confidence
        
        # Positive improvements increase confidence
        if improvements['conversions_change'] > 0:
            confidence += 0.2
        
        if improvements['roi_change'] > 0:
            confidence += 0.2
        
        # Reasonable cost change
        if abs(improvements['cost_change_pct']) < 30:
            confidence += 0.1
        
        return min(1.0, confidence)
    
    def _update_optimization_history(self, campaign_data: pd.DataFrame,
                                   optimized_bids: Dict[str, float],
                                   improvements: Dict[str, Any]):
        """Update optimization history for learning"""
        self.optimization_history.append({
            'timestamp': pd.Timestamp.now(),
            'campaign_count': len(campaign_data),
            'optimized_bids': optimized_bids.copy(),
            'expected_improvements': improvements.copy()
        })
        
        # Keep only recent history
        if len(self.optimization_history) > 100:
            self.optimization_history.pop(0)
    
    def _get_fallback_optimization(self, campaign_data: pd.DataFrame) -> Dict[str, Any]:
        """Provide fallback optimization when main optimization fails"""
        # Simple rule-based optimization
        recommendations = []
        optimized_bids = {}
        
        for idx, row in campaign_data.iterrows():
            campaign_id = row.get('campaign_id', idx)
            current_bid = row.get('max_cpc', 1.0)
            
            # Simple rules
            if row.get('ctr', 0) > 0.05 and row.get('cvr', 0) > 0.02:
                # High performance - increase bid
                optimized_bids[campaign_id] = current_bid * 1.1
                recommendations.append(f"Increase bid for high-performing campaign {campaign_id}")
            elif row.get('ctr', 0) < 0.01 or row.get('cvr', 0) < 0.005:
                # Low performance - decrease bid
                optimized_bids[campaign_id] = current_bid * 0.9
                recommendations.append(f"Decrease bid for low-performing campaign {campaign_id}")
            else:
                # Maintain current bid
                optimized_bids[campaign_id] = current_bid
        
        return {
            'optimized_bids': optimized_bids,
            'expected_improvements': {
                'note': 'Fallback optimization used due to error'
            },
            'recommendations': recommendations,
            'constraints_satisfied': {'all': True},
            'optimization_summary': {
                'method': 'rule-based fallback'
            }
        }