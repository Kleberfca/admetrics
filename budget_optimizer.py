"""
Budget Optimizer Model
Optimizes budget allocation across campaigns using ML algorithms
"""

import os
import pickle
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
from scipy.optimize import minimize, differential_evolution
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import cvxpy as cp

logger = logging.getLogger(__name__)

class BudgetOptimizer:
    """
    AI-powered budget optimization across multiple campaigns
    """
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or 'models/budget_optimizer'
        self.performance_models = {}  # Models to predict performance for each metric
        self.scalers = {}
        self.is_trained = False
        self.model_version = "1.0.0"
        self.last_trained = None
        
        # Optimization parameters
        self.optimization_methods = {
            'scipy': self._optimize_with_scipy,
            'evolutionary': self._optimize_with_evolutionary,
            'convex': self._optimize_with_cvxpy
        }
        
        # Ensure model directory exists
        os.makedirs(self.model_path, exist_ok=True)
    
    def train_performance_models(self, campaign_data: List[Dict]) -> Dict[str, Any]:
        """
        Train models to predict campaign performance based on budget allocation
        """
        try:
            logger.info("Training budget optimization performance models...")
            
            df = pd.DataFrame(campaign_data)
            
            if df.empty or len(df) < 50:
                raise ValueError("Insufficient data for training (minimum 50 records required)")
            
            # Prepare features
            df = self._prepare_optimization_features(df)
            
            # Define features and targets
            feature_cols = [col for col in df.columns 
                          if col not in ['campaign_id', 'date', 'conversions', 'revenue', 'clicks']]
            
            targets = ['conversions', 'revenue', 'clicks']
            
            training_results = {}
            
            for target in targets:
                if target not in df.columns:
                    logger.warning(f"Target {target} not found in data, skipping...")
                    continue
                
                # Prepare data
                X = df[feature_cols].fillna(0)
                y = df[target].fillna(0)
                
                # Remove outliers (values beyond 3 standard deviations)
                z_scores = np.abs((y - y.mean()) / y.std())
                mask = z_scores < 3
                X = X[mask]
                y = y[mask]
                
                if len(X) < 20:
                    logger.warning(f"Too few samples after outlier removal for {target}")
                    continue
                
                # Scale features
                scaler = StandardScaler()
                X_scaled = scaler.fit_transform(X)
                self.scalers[target] = scaler
                
                # Split data
                X_train, X_test, y_train, y_test = train_test_split(
                    X_scaled, y, test_size=0.2, random_state=42
                )
                
                # Train Random Forest model
                model = RandomForestRegressor(
                    n_estimators=100,
                    max_depth=15,
                    min_samples_split=5,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1
                )
                
                model.fit(X_train, y_train)
                
                # Evaluate model
                train_score = model.score(X_train, y_train)
                test_score = model.score(X_test, y_test)
                
                self.performance_models[target] = {
                    'model': model,
                    'feature_columns': feature_cols,
                    'train_score': train_score,
                    'test_score': test_score
                }
                
                training_results[target] = {
                    'train_r2': train_score,
                    'test_r2': test_score,
                    'feature_count': len(feature_cols)
                }
                
                logger.info(f"Trained {target} model - Train R²: {train_score:.3f}, Test R²: {test_score:.3f}")
            
            self.is_trained = True
            self.last_trained = datetime.utcnow()
            
            # Save models
            self.save_model()
            
            return {
                'success': True,
                'models_trained': list(training_results.keys()),
                'results': training_results
            }
            
        except Exception as e:
            logger.error(f"Error training budget optimization models: {e}")
            raise
    
    def optimize(self, campaigns: List[Dict], total_budget: float, 
                objective: str = 'maximize_conversions', constraints: Dict = None,
                method: str = 'scipy') -> Dict[str, Any]:
        """
        Optimize budget allocation across campaigns
        
        Args:
            campaigns: List of campaign data with historical performance
            total_budget: Total budget to allocate
            objective: 'maximize_conversions', 'maximize_revenue', 'maximize_roas'
            constraints: Additional constraints (min/max budgets per campaign)
            method: Optimization method ('scipy', 'evolutionary', 'convex')
        """
        try:
            if not self.is_trained and not self.load_model():
                logger.warning("No trained models found, using heuristic optimization")
                return self._heuristic_optimization(campaigns, total_budget, objective, constraints)
            
            logger.info(f"Optimizing budget allocation for {len(campaigns)} campaigns")
            
            # Prepare campaign data
            campaign_df = self._prepare_campaign_data(campaigns)
            
            if campaign_df.empty:
                raise ValueError("No valid campaign data provided")
            
            # Set default constraints
            if constraints is None:
                constraints = {}
            
            # Perform optimization based on method
            optimization_func = self.optimization_methods.get(method, self._optimize_with_scipy)
            result = optimization_func(campaign_df, total_budget, objective, constraints)
            
            # Add optimization metadata
            result.update({
                'total_budget': total_budget,
                'objective': objective,
                'method': method,
                'campaign_count': len(campaigns),
                'optimized_at': datetime.utcnow().isoformat()
            })
            
            return result
            
        except Exception as e:
            logger.error(f"Error optimizing budget: {e}")
            raise
    
    def _optimize_with_scipy(self, campaign_df: pd.DataFrame, total_budget: float,
                           objective: str, constraints: Dict) -> Dict[str, Any]:
        """
        Optimize using scipy.optimize
        """
        try:
            n_campaigns = len(campaign_df)
            
            # Initial budget allocation (equal distribution)
            x0 = np.full(n_campaigns, total_budget / n_campaigns)
            
            # Define bounds for each campaign
            bounds = []
            for i, row in campaign_df.iterrows():
                campaign_id = row['campaign_id']
                min_budget = constraints.get(f'{campaign_id}_min', total_budget * 0.01)  # 1% minimum
                max_budget = constraints.get(f'{campaign_id}_max', total_budget * 0.5)   # 50% maximum
                bounds.append((min_budget, max_budget))
            
            # Budget constraint (sum must equal total budget)
            budget_constraint = {
                'type': 'eq',
                'fun': lambda x: np.sum(x) - total_budget
            }
            
            # Objective function
            def objective_function(budget_allocation):
                return -self._calculate_objective_value(budget_allocation, campaign_df, objective)
            
            # Perform optimization
            result = minimize(
                objective_function,
                x0,
                method='SLSQP',
                bounds=bounds,
                constraints=[budget_constraint],
                options={'maxiter': 1000}
            )
            
            if not result.success:
                logger.warning(f"Optimization did not converge: {result.message}")
            
            # Format results
            optimized_budgets = result.x
            campaign_allocations = []
            
            for i, (_, row) in enumerate(campaign_df.iterrows()):
                allocation = {
                    'campaign_id': row['campaign_id'],
                    'campaign_name': row.get('campaign_name', f'Campaign {i+1}'),
                    'current_budget': row.get('current_budget', 0),
                    'optimized_budget': float(optimized_budgets[i]),
                    'budget_change': float(optimized_budgets[i] - row.get('current_budget', 0)),
                    'budget_change_percent': float(
                        ((optimized_budgets[i] - row.get('current_budget', 0)) / 
                         max(row.get('current_budget', 1), 1)) * 100
                    )
                }
                campaign_allocations.append(allocation)
            
            # Calculate expected performance
            expected_performance = self._calculate_expected_performance(
                optimized_budgets, campaign_df, objective
            )
            
            return {
                'success': result.success,
                'message': result.message,
                'campaign_allocations': campaign_allocations,
                'expected_performance': expected_performance,
                'optimization_score': -result.fun,
                'iterations': result.nit
            }
            
        except Exception as e:
            logger.error(f"Error in scipy optimization: {e}")
            raise
    
    def _optimize_with_evolutionary(self, campaign_df: pd.DataFrame, total_budget: float,
                                  objective: str, constraints: Dict) -> Dict[str, Any]:
        """
        Optimize using evolutionary algorithm
        """
        try:
            n_campaigns = len(campaign_df)
            
            # Define bounds
            bounds = []
            for i, row in campaign_df.iterrows():
                campaign_id = row['campaign_id']
                min_budget = constraints.get(f'{campaign_id}_min', total_budget * 0.01)
                max_budget = constraints.get(f'{campaign_id}_max', total_budget * 0.5)
                bounds.append((min_budget, max_budget))
            
            # Objective function with penalty for budget constraint violation
            def objective_function(budget_allocation):
                # Penalty for violating budget constraint
                budget_penalty = abs(np.sum(budget_allocation) - total_budget) * 1000
                
                objective_value = self._calculate_objective_value(budget_allocation, campaign_df, objective)
                return -(objective_value - budget_penalty)
            
            # Run evolutionary optimization
            result = differential_evolution(
                objective_function,
                bounds,
                maxiter=300,
                popsize=15,
                seed=42
            )
            
            # Normalize to exact budget
            optimized_budgets = result.x
            optimized_budgets = optimized_budgets * (total_budget / np.sum(optimized_budgets))
            
            # Format results
            campaign_allocations = []
            for i, (_, row) in enumerate(campaign_df.iterrows()):
                allocation = {
                    'campaign_id': row['campaign_id'],
                    'campaign_name': row.get('campaign_name', f'Campaign {i+1}'),
                    'current_budget': row.get('current_budget', 0),
                    'optimized_budget': float(optimized_budgets[i]),
                    'budget_change': float(optimized_budgets[i] - row.get('current_budget', 0)),
                    'budget_change_percent': float(
                        ((optimized_budgets[i] - row.get('current_budget', 0)) / 
                         max(row.get('current_budget', 1), 1)) * 100
                    )
                }
                campaign_allocations.append(allocation)
            
            expected_performance = self._calculate_expected_performance(
                optimized_budgets, campaign_df, objective
            )
            
            return {
                'success': result.success,
                'message': 'Evolutionary optimization completed',
                'campaign_allocations': campaign_allocations,
                'expected_performance': expected_performance,
                'optimization_score': -result.fun,
                'iterations': result.nit
            }
            
        except Exception as e:
            logger.error(f"Error in evolutionary optimization: {e}")
            raise
    
    def _optimize_with_cvxpy(self, campaign_df: pd.DataFrame, total_budget: float,
                           objective: str, constraints: Dict) -> Dict[str, Any]:
        """
        Optimize using convex optimization (CVXPY)
        """
        try:
            n_campaigns = len(campaign_df)
            
            # Decision variables
            budgets = cp.Variable(n_campaigns, nonneg=True)
            
            # Budget constraint
            budget_constraint = cp.sum(budgets) == total_budget
            
            # Individual campaign constraints
            campaign_constraints = [budget_constraint]
            
            for i, row in campaign_df.iterrows():
                campaign_id = row['campaign_id']
                min_budget = constraints.get(f'{campaign_id}_min', total_budget * 0.01)
                max_budget = constraints.get(f'{campaign_id}_max', total_budget * 0.5)
                
                campaign_constraints.append(budgets[i] >= min_budget)
                campaign_constraints.append(budgets[i] <= max_budget)
            
            # Simplified linear objective (for convex optimization)
            # Use historical performance ratios as coefficients
            coefficients = self._calculate_performance_coefficients(campaign_df, objective)
            
            # Objective function (maximize)
            objective_func = cp.Maximize(coefficients.T @ budgets)
            
            # Solve problem
            problem = cp.Problem(objective_func, campaign_constraints)
            problem.solve()
            
            if problem.status not in ["infeasible", "unbounded"]:
                optimized_budgets = budgets.value
                
                campaign_allocations = []
                for i, (_, row) in enumerate(campaign_df.iterrows()):
                    allocation = {
                        'campaign_id': row['campaign_id'],
                        'campaign_name': row.get('campaign_name', f'Campaign {i+1}'),
                        'current_budget': row.get('current_budget', 0),
                        'optimized_budget': float(optimized_budgets[i]),
                        'budget_change': float(optimized_budgets[i] - row.get('current_budget', 0)),
                        'budget_change_percent': float(
                            ((optimized_budgets[i] - row.get('current_budget', 0)) / 
                             max(row.get('current_budget', 1), 1)) * 100
                        )
                    }
                    campaign_allocations.append(allocation)
                
                expected_performance = self._calculate_expected_performance(
                    optimized_budgets, campaign_df, objective
                )
                
                return {
                    'success': True,
                    'message': 'Convex optimization completed',
                    'campaign_allocations': campaign_allocations,
                    'expected_performance': expected_performance,
                    'optimization_score': float(problem.value),
                    'solver_status': problem.status
                }
            else:
                raise ValueError(f"Optimization problem is {problem.status}")
                
        except Exception as e:
            logger.error(f"Error in convex optimization: {e}")
            # Fallback to scipy method
            return self._optimize_with_scipy(campaign_df, total_budget, objective, constraints)
    
    def _heuristic_optimization(self, campaigns: List[Dict], total_budget: float,
                              objective: str, constraints: Dict) -> Dict[str, Any]:
        """
        Fallback heuristic optimization when no trained models are available
        """
        try:
            logger.info("Using heuristic optimization (no trained models)")
            
            df = pd.DataFrame(campaigns)
            
            # Calculate performance scores based on historical data
            performance_scores = []
            
            for _, campaign in df.iterrows():
                if objective == 'maximize_conversions':
                    score = campaign.get('avg_conversions_per_dollar', 0)
                elif objective == 'maximize_revenue':
                    score = campaign.get('avg_revenue_per_dollar', 0)
                elif objective == 'maximize_roas':
                    score = campaign.get('avg_roas', 0)
                else:
                    # Default to conversion efficiency
                    spend = campaign.get('historical_spend', 1)
                    conversions = campaign.get('historical_conversions', 0)
                    score = conversions / spend if spend > 0 else 0
                
                performance_scores.append(score)
            
            # Normalize scores
            performance_scores = np.array(performance_scores)
            if np.sum(performance_scores) > 0:
                performance_scores = performance_scores / np.sum(performance_scores)
            else:
                # Equal allocation if no performance data
                performance_scores = np.ones(len(campaigns)) / len(campaigns)
            
            # Allocate budget proportionally to performance scores
            optimized_budgets = performance_scores * total_budget
            
            # Apply constraints
            for i, campaign in df.iterrows():
                campaign_id = campaign.get('campaign_id', campaign.get('id', f'campaign_{i}'))
                min_budget = constraints.get(f'{campaign_id}_min', total_budget * 0.01)
                max_budget = constraints.get(f'{campaign_id}_max', total_budget * 0.5)
                
                optimized_budgets[i] = max(min_budget, min(max_budget, optimized_budgets[i]))
            
            # Renormalize to total budget
            optimized_budgets = optimized_budgets * (total_budget / np.sum(optimized_budgets))
            
            # Format results
            campaign_allocations = []
            for i, campaign in df.iterrows():
                allocation = {
                    'campaign_id': campaign.get('campaign_id', campaign.get('id', f'campaign_{i}')),
                    'campaign_name': campaign.get('campaign_name', campaign.get('name', f'Campaign {i+1}')),
                    'current_budget': campaign.get('current_budget', 0),
                    'optimized_budget': float(optimized_budgets[i]),
                    'budget_change': float(optimized_budgets[i] - campaign.get('current_budget', 0)),
                    'performance_score': float(performance_scores[i])
                }
                campaign_allocations.append(allocation)
            
            return {
                'success': True,
                'message': 'Heuristic optimization completed',
                'campaign_allocations': campaign_allocations,
                'method': 'heuristic',
                'total_budget_allocated': float(np.sum(optimized_budgets))
            }
            
        except Exception as e:
            logger.error(f"Error in heuristic optimization: {e}")
            raise
    
    def calculate_expected_impact(self, optimization_result: Dict) -> Dict[str, Any]:
        """
        Calculate expected impact of budget optimization
        """
        try:
            campaign_allocations = optimization_result.get('campaign_allocations', [])
            
            if not campaign_allocations:
                return {'error': 'No campaign allocations found'}
            
            total_current_budget = sum(c.get('current_budget', 0) for c in campaign_allocations)
            total_optimized_budget = sum(c.get('optimized_budget', 0) for c in campaign_allocations)
            
            # Calculate budget redistribution
            budget_increases = [c for c in campaign_allocations if c.get('budget_change', 0) > 0]
            budget_decreases = [c for c in campaign_allocations if c.get('budget_change', 0) < 0]
            
            total_increase = sum(c.get('budget_change', 0) for c in budget_increases)
            total_decrease = abs(sum(c.get('budget_change', 0) for c in budget_decreases))
            
            # Calculate expected performance improvement
            expected_improvement = optimization_result.get('expected_performance', {})
            
            impact = {
                'budget_redistribution': {
                    'total_current': total_current_budget,
                    'total_optimized': total_optimized_budget,
                    'campaigns_increased': len(budget_increases),
                    'campaigns_decreased': len(budget_decreases),
                    'total_increase': total_increase,
                    'total_decrease': total_decrease,
                    'net_change': total_increase - total_decrease
                },
                'expected_performance': expected_improvement,
                'optimization_score': optimization_result.get('optimization_score', 0),
                'confidence': min(100, max(0, optimization_result.get('optimization_score', 0) * 10))
            }
            
            # Add recommendations
            recommendations = []
            
            if len(budget_increases) > 0:
                top_increase = max(budget_increases, key=lambda x: x.get('budget_change_percent', 0))
                recommendations.append({
                    'type': 'budget_increase',
                    'campaign': top_increase['campaign_name'],
                    'message': f"Increase budget for {top_increase['campaign_name']} by {top_increase['budget_change_percent']:.1f}%"
                })
            
            if len(budget_decreases) > 0:
                top_decrease = min(budget_decreases, key=lambda x: x.get('budget_change_percent', 0))
                recommendations.append({
                    'type': 'budget_decrease',
                    'campaign': top_decrease['campaign_name'],
                    'message': f"Consider reducing budget for {top_decrease['campaign_name']} by {abs(top_decrease['budget_change_percent']):.1f}%"
                })
            
            impact['recommendations'] = recommendations
            
            return impact
            
        except Exception as e:
            logger.error(f"Error calculating expected impact: {e}")
            return {'error': str(e)}
    
    def _prepare_optimization_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for optimization models"""
        try:
            # Create derived features
            df['spend_per_day'] = df['spend'] / df.get('days_active', 1)
            df['ctr'] = np.where(df['impressions'] > 0, df['clicks'] / df['impressions'], 0)
            df['cpc'] = np.where(df['clicks'] > 0, df['spend'] / df['clicks'], 0)
            df['conversion_rate'] = np.where(df['clicks'] > 0, df['conversions'] / df['clicks'], 0)
            df['cost_per_conversion'] = np.where(df['conversions'] > 0, df['spend'] / df['conversions'], 0)
            
            # Platform encoding
            if 'platform' in df.columns:
                platform_dummies = pd.get_dummies(df['platform'], prefix='platform')
                df = pd.concat([df, platform_dummies], axis=1)
            
            # Fill missing values
            df = df.fillna(0)
            
            return df
            
        except Exception as e:
            logger.error(f"Error preparing optimization features: {e}")
            return df
    
    def _prepare_campaign_data(self, campaigns: List[Dict]) -> pd.DataFrame:
        """Prepare campaign data for optimization"""
        try:
            df = pd.DataFrame(campaigns)
            
            # Ensure required columns exist
            required_cols = ['campaign_id']
            for col in required_cols:
                if col not in df.columns:
                    if 'id' in df.columns:
                        df['campaign_id'] = df['id']
                    else:
                        df['campaign_id'] = [f'campaign_{i}' for i in range(len(df))]
            
            # Add default values for missing columns
            if 'current_budget' not in df.columns:
                df['current_budget'] = 0
            
            return df
            
        except Exception as e:
            logger.error(f"Error preparing campaign data: {e}")
            return pd.DataFrame()
    
    def _calculate_objective_value(self, budget_allocation: np.ndarray, 
                                 campaign_df: pd.DataFrame, objective: str) -> float:
        """Calculate objective value for given budget allocation"""
        try:
            if not self.is_trained:
                # Fallback to simple heuristic
                if objective == 'maximize_conversions':
                    return np.sum(budget_allocation * campaign_df.get('conversion_rate', 0.01))
                elif objective == 'maximize_revenue':
                    return np.sum(budget_allocation * campaign_df.get('revenue_per_dollar', 0.1))
                else:
                    return np.sum(budget_allocation * campaign_df.get('roas', 1.0))
            
            # Use trained models to predict performance
            total_value = 0
            
            for i, budget in enumerate(budget_allocation):
                campaign_features = self._extract_campaign_features(campaign_df.iloc[i], budget)
                
                if objective == 'maximize_conversions' and 'conversions' in self.performance_models:
                    model_data = self.performance_models['conversions']
                    scaler = self.scalers['conversions']
                    scaled_features = scaler.transform([campaign_features])
                    predicted_conversions = model_data['model'].predict(scaled_features)[0]
                    total_value += predicted_conversions
                    
                elif objective == 'maximize_revenue' and 'revenue' in self.performance_models:
                    model_data = self.performance_models['revenue']
                    scaler = self.scalers['revenue']
                    scaled_features = scaler.transform([campaign_features])
                    predicted_revenue = model_data['model'].predict(scaled_features)[0]
                    total_value += predicted_revenue
                    
                else:  # maximize_roas or fallback
                    if 'conversions' in self.performance_models:
                        model_data = self.performance_models['conversions']
                        scaler = self.scalers['conversions']
                        scaled_features = scaler.transform([campaign_features])
                        predicted_conversions = model_data['model'].predict(scaled_features)[0]
                        roas = (predicted_conversions * 100) / max(budget, 1)  # Assume $100 per conversion
                        total_value += roas
            
            return total_value
            
        except Exception as e:
            logger.error(f"Error calculating objective value: {e}")
            return 0
    
    def _calculate_expected_performance(self, budget_allocation: np.ndarray,
                                      campaign_df: pd.DataFrame, objective: str) -> Dict[str, float]:
        """Calculate expected performance metrics for budget allocation"""
        try:
            total_conversions = 0
            total_revenue = 0
            total_clicks = 0
            
            for i, budget in enumerate(budget_allocation):
                # Simple performance estimation based on historical ratios
                campaign = campaign_df.iloc[i]
                
                conversion_rate = campaign.get('conversion_rate', 0.01)
                revenue_per_conversion = campaign.get('revenue_per_conversion', 100)
                cpc = campaign.get('cpc', 1.0)
                
                estimated_clicks = budget / cpc if cpc > 0 else 0
                estimated_conversions = estimated_clicks * conversion_rate
                estimated_revenue = estimated_conversions * revenue_per_conversion
                
                total_clicks += estimated_clicks
                total_conversions += estimated_conversions
                total_revenue += estimated_revenue
            
            total_budget = np.sum(budget_allocation)
            
            return {
                'total_conversions': float(total_conversions),
                'total_revenue': float(total_revenue),
                'total_clicks': float(total_clicks),
                'average_cpa': float(total_budget / total_conversions) if total_conversions > 0 else 0,
                'total_roas': float(total_revenue / total_budget) if total_budget > 0 else 0,
                'average_cpc': float(total_budget / total_clicks) if total_clicks > 0 else 0
            }
            
        except Exception as e:
            logger.error(f"Error calculating expected performance: {e}")
            return {}
    
    def _calculate_performance_coefficients(self, campaign_df: pd.DataFrame, objective: str) -> np.ndarray:
        """Calculate performance coefficients for linear optimization"""
        try:
            coefficients = []
            
            for _, campaign in campaign_df.iterrows():
                if objective == 'maximize_conversions':
                    coeff = campaign.get('conversion_rate', 0.01)
                elif objective == 'maximize_revenue':
                    coeff = campaign.get('revenue_per_dollar', 0.1)
                else:  # maximize_roas
                    coeff = campaign.get('roas', 1.0)
                
                coefficients.append(coeff)
            
            return np.array(coefficients)
            
        except Exception as e:
            logger.error(f"Error calculating performance coefficients: {e}")
            return np.ones(len(campaign_df))
    
    def _extract_campaign_features(self, campaign_row: pd.Series, budget: float) -> List[float]:
        """Extract features for a campaign with given budget"""
        features = []
        
        # Budget feature
        features.append(budget)
        
        # Campaign characteristics
        features.extend([
            campaign_row.get('historical_ctr', 0),
            campaign_row.get('historical_cpc', 0),
            campaign_row.get('historical_conversion_rate', 0),
            campaign_row.get('quality_score', 5),
            campaign_row.get('competition_level', 0.5)
        ])
        
        return features
    
    def save_model(self) -> bool:
        """Save the trained model to disk"""
        try:
            model_data = {
                'performance_models': self.performance_models,
                'scalers': self.scalers,
                'model_version': self.model_version,
                'last_trained': self.last_trained,
                'is_trained': self.is_trained
            }
            
            model_file = os.path.join(self.model_path, 'budget_optimizer.pkl')
            with open(model_file, 'wb') as f:
                pickle.dump(model_data, f)
            
            logger.info(f"Budget optimizer model saved to {model_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving budget optimizer model: {e}")
            return False
    
    def load_model(self) -> bool:
        """Load a trained model from disk"""
        try:
            model_file = os.path.join(self.model_path, 'budget_optimizer.pkl')
            
            if not os.path.exists(model_file):
                logger.warning(f"Budget optimizer model file not found: {model_file}")
                return False
            
            with open(model_file, 'rb') as f:
                model_data = pickle.load(f)
            
            self.performance_models = model_data['performance_models']
            self.scalers = model_data['scalers']
            self.model_version = model_data.get('model_version', '1.0.0')
            self.last_trained = model_data.get('last_trained')
            self.is_trained = model_data.get('is_trained', True)
            
            logger.info(f"Budget optimizer model loaded from {model_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading budget optimizer model: {e}")
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
    optimizer = BudgetOptimizer()
    
    # Mock campaign data
    campaigns = [
        {
            'campaign_id': 'camp_1',
            'campaign_name': 'Search Campaign',
            'current_budget': 1000,
            'conversion_rate': 0.05,
            'cpc': 2.0,
            'revenue_per_conversion': 100
        },
        {
            'campaign_id': 'camp_2', 
            'campaign_name': 'Display Campaign',
            'current_budget': 800,
            'conversion_rate': 0.02,
            'cpc': 1.0,
            'revenue_per_conversion': 80
        }
    ]
    
    # Optimize budget allocation
    # result = optimizer.optimize(campaigns, total_budget=2000, objective='maximize_conversions')
    # print(f"Optimization result: {result}")