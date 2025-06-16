#!/usr/bin/env python3
"""
Budget optimization using genetic algorithms and linear programming
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple
from scipy.optimize import linprog
from deap import base, creator, tools, algorithms
import random

logger = logging.getLogger(__name__)


class BudgetOptimizer:
    """AI-powered budget optimization across campaigns"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.population_size = config.get('population_size', 100)
        self.generations = config.get('generations', 50)
        self.mutation_rate = config.get('mutation_rate', 0.1)
        self.crossover_rate = config.get('crossover_rate', 0.8)
        
        # Setup DEAP
        self._setup_genetic_algorithm()
    
    def _setup_genetic_algorithm(self):
        """Initialize genetic algorithm components"""
        # Create fitness and individual classes
        creator.create("FitnessMax", base.Fitness, weights=(1.0,))
        creator.create("Individual", list, fitness=creator.FitnessMax)
        
        self.toolbox = base.Toolbox()
        
    def prepare_optimization_data(self, campaigns_data: List[Dict[str, Any]]) -> pd.DataFrame:
        """Prepare campaign data for optimization"""
        df = pd.DataFrame(campaigns_data)
        
        # Calculate efficiency metrics
        df['cpa'] = df['spend'] / (df['conversions'] + 1e-6)
        df['roas'] = df['revenue'] / (df['spend'] + 1e-6)
        df['conversion_rate'] = df['conversions'] / (df['clicks'] + 1e-6)
        
        # Historical performance metrics
        df['avg_daily_spend'] = df['spend'] / df['days_active']
        df['avg_daily_conversions'] = df['conversions'] / df['days_active']
        
        return df
    
    def linear_optimization(self,
                          campaigns_df: pd.DataFrame,
                          total_budget: float,
                          objective: str = 'conversions',
                          constraints: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Linear programming optimization"""
        n_campaigns = len(campaigns_df)
        
        if objective == 'conversions':
            # Maximize conversions per dollar spent
            c = -campaigns_df['avg_daily_conversions'].values / (campaigns_df['avg_daily_spend'].values + 1e-6)
        elif objective == 'revenue':
            # Maximize ROAS
            c = -campaigns_df['roas'].values
        else:
            raise ValueError(f"Unknown objective: {objective}")
        
        # Constraints
        A_ub = []
        b_ub = []
        
        # Total budget constraint
        A_ub.append(np.ones(n_campaigns))
        b_ub.append(total_budget)
        
        # Individual campaign constraints
        bounds = []
        for idx, row in campaigns_df.iterrows():
            min_budget = constraints.get('min_campaign_budget', 10) if constraints else 10
            max_budget = min(
                constraints.get('max_campaign_budget', total_budget) if constraints else total_budget,
                total_budget
            )
            bounds.append((min_budget, max_budget))
        
        # Solve
        result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method='highs')
        
        if result.success:
            allocations = result.x
            expected_performance = self._calculate_expected_performance(
                campaigns_df, allocations, objective
            )
            
            return {
                'success': True,
                'allocations': {
                    campaigns_df.iloc[i]['campaign_id']: float(allocations[i])
                    for i in range(n_campaigns)
                },
                'expected_performance': expected_performance,
                'total_allocated': float(np.sum(allocations))
            }
        else:
            return {
                'success': False,
                'message': 'Optimization failed',
                'status': result.message
            }
    
    def genetic_optimization(self,
                           campaigns_df: pd.DataFrame,
                           total_budget: float,
                           objective: str = 'conversions') -> Dict[str, Any]:
        """Genetic algorithm optimization"""
        n_campaigns = len(campaigns_df)
        
        # Define individual creation
        self.toolbox.register("attr_float", random.uniform, 0, 1)
        self.toolbox.register("individual", tools.initRepeat, creator.Individual,
                            self.toolbox.attr_float, n_campaigns)
        self.toolbox.register("population", tools.initRepeat, list, self.toolbox.individual)
        
        # Define fitness function
        def evaluate_individual(individual):
            # Normalize to sum to 1
            normalized = np.array(individual) / np.sum(individual)
            allocations = normalized * total_budget
            
            # Calculate fitness based on objective
            if objective == 'conversions':
                fitness = np.sum(
                    allocations * campaigns_df['avg_daily_conversions'].values / 
                    (campaigns_df['avg_daily_spend'].values + 1e-6)
                )
            elif objective == 'revenue':
                fitness = np.sum(allocations * campaigns_df['roas'].values)
            else:
                fitness = 0
            
            return (fitness,)
        
        # Register genetic operators
        self.toolbox.register("evaluate", evaluate_individual)
        self.toolbox.register("mate", tools.cxTwoPoint)
        self.toolbox.register("mutate", tools.mutGaussian, mu=0, sigma=0.1, indpb=0.2)
        self.toolbox.register("select", tools.selTournament, tournsize=3)
        
        # Create initial population
        population = self.toolbox.population(n=self.population_size)
        
        # Run genetic algorithm
        algorithms.eaSimple(
            population, self.toolbox,
            cxpb=self.crossover_rate,
            mutpb=self.mutation_rate,
            ngen=self.generations,
            verbose=False
        )
        
        # Get best solution
        best_ind = tools.selBest(population, 1)[0]
        normalized = np.array(best_ind) / np.sum(best_ind)
        allocations = normalized * total_budget
        
        expected_performance = self._calculate_expected_performance(
            campaigns_df, allocations, objective
        )
        
        return {
            'success': True,
            'allocations': {
                campaigns_df.iloc[i]['campaign_id']: float(allocations[i])
                for i in range(n_campaigns)
            },
            'expected_performance': expected_performance,
            'total_allocated': float(np.sum(allocations))
        }
    
    def optimize_budget(self,
                       campaigns_data: List[Dict[str, Any]],
                       total_budget: float,
                       objective: str = 'conversions',
                       method: str = 'hybrid',
                       constraints: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Main optimization method"""
        
        # Prepare data
        campaigns_df = self.prepare_optimization_data(campaigns_data)
        
        if len(campaigns_df) == 0:
            return {
                'success': False,
                'message': 'No campaigns to optimize'
            }
        
        # Run optimization
        if method == 'linear':
            return self.linear_optimization(campaigns_df, total_budget, objective, constraints)
        elif method == 'genetic':
            return self.genetic_optimization(campaigns_df, total_budget, objective)
        elif method == 'hybrid':
            # Start with linear optimization
            linear_result = self.linear_optimization(campaigns_df, total_budget, objective, constraints)
            
            if linear_result['success']:
                # Refine with genetic algorithm
                genetic_result = self.genetic_optimization(campaigns_df, total_budget, objective)
                
                # Choose better result
                if genetic_result['expected_performance'].get('total_conversions', 0) > \
                   linear_result['expected_performance'].get('total_conversions', 0):
                    return genetic_result
                else:
                    return linear_result
            else:
                return self.genetic_optimization(campaigns_df, total_budget, objective)
        else:
            raise ValueError(f"Unknown optimization method: {method}")
    
    def _calculate_expected_performance(self,
                                      campaigns_df: pd.DataFrame,
                                      allocations: np.ndarray,
                                      objective: str) -> Dict[str, float]:
        """Calculate expected performance metrics"""
        expected_conversions = np.sum(
            allocations * campaigns_df['avg_daily_conversions'].values / 
            (campaigns_df['avg_daily_spend'].values + 1e-6)
        )
        
        expected_revenue = np.sum(
            allocations * campaigns_df['roas'].values
        )
        
        return {
            'total_conversions': float(expected_conversions),
            'total_revenue': float(expected_revenue),
            'average_cpa': float(np.sum(allocations) / (expected_conversions + 1e-6)),
            'average_roas': float(expected_revenue / (np.sum(allocations) + 1e-6))
        }
    
    def get_reallocation_recommendations(self,
                                       current_allocations: Dict[str, float],
                                       optimized_allocations: Dict[str, float],
                                       threshold: float = 0.1) -> List[Dict[str, Any]]:
        """Generate actionable reallocation recommendations"""
        recommendations = []
        
        for campaign_id in current_allocations:
            current = current_allocations.get(campaign_id, 0)
            optimized = optimized_allocations.get(campaign_id, 0)
            change = optimized - current
            change_pct = (change / (current + 1e-6)) * 100
            
            if abs(change_pct) > threshold * 100:
                recommendations.append({
                    'campaign_id': campaign_id,
                    'current_budget': current,
                    'recommended_budget': optimized,
                    'change_amount': change,
                    'change_percentage': change_pct,
                    'action': 'increase' if change > 0 else 'decrease'
                })
        
        # Sort by absolute change amount
        recommendations.sort(key=lambda x: abs(x['change_amount']), reverse=True)
        
        return recommendations