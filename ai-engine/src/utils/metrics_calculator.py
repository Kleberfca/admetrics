#!/usr/bin/env python3
"""
Metrics calculation utilities for AdMetrics
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Union
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class MetricsCalculator:
    """Calculate and aggregate advertising metrics"""
    
    def __init__(self):
        self.metric_definitions = self._get_metric_definitions()
        
    def _get_metric_definitions(self) -> Dict[str, Dict[str, Any]]:
        """Get metric definitions and formulas"""
        return {
            'ctr': {
                'name': 'Click-Through Rate',
                'formula': 'clicks / impressions',
                'format': 'percentage',
                'requires': ['clicks', 'impressions']
            },
            'cvr': {
                'name': 'Conversion Rate',
                'formula': 'conversions / clicks',
                'format': 'percentage',
                'requires': ['conversions', 'clicks']
            },
            'cpc': {
                'name': 'Cost Per Click',
                'formula': 'spend / clicks',
                'format': 'currency',
                'requires': ['spend', 'clicks']
            },
            'cpm': {
                'name': 'Cost Per Mille',
                'formula': '(spend / impressions) * 1000',
                'format': 'currency',
                'requires': ['spend', 'impressions']
            },
            'cpa': {
                'name': 'Cost Per Acquisition',
                'formula': 'spend / conversions',
                'format': 'currency',
                'requires': ['spend', 'conversions']
            },
            'roas': {
                'name': 'Return on Ad Spend',
                'formula': 'revenue / spend',
                'format': 'ratio',
                'requires': ['revenue', 'spend']
            },
            'roi': {
                'name': 'Return on Investment',
                'formula': '(revenue - spend) / spend',
                'format': 'percentage',
                'requires': ['revenue', 'spend']
            },
            'aov': {
                'name': 'Average Order Value',
                'formula': 'revenue / conversions',
                'format': 'currency',
                'requires': ['revenue', 'conversions']
            },
            'frequency': {
                'name': 'Frequency',
                'formula': 'impressions / reach',
                'format': 'decimal',
                'requires': ['impressions', 'reach']
            },
            'engagement_rate': {
                'name': 'Engagement Rate',
                'formula': 'engagements / impressions',
                'format': 'percentage',
                'requires': ['engagements', 'impressions']
            }
        }
    
    def calculate_metrics(self, data: Union[pd.DataFrame, Dict[str, Any]], 
                         metrics: Optional[List[str]] = None) -> Dict[str, Any]:
        """Calculate specified metrics from data"""
        try:
            # Convert to dict if DataFrame
            if isinstance(data, pd.DataFrame):
                data_dict = data.to_dict('records')[0] if len(data) == 1 else data.sum().to_dict()
            else:
                data_dict = data
            
            # Calculate all metrics if none specified
            if metrics is None:
                metrics = list(self.metric_definitions.keys())
            
            results = {}
            
            for metric in metrics:
                if metric in self.metric_definitions:
                    value = self._calculate_single_metric(data_dict, metric)
                    if value is not None:
                        results[metric] = value
            
            # Add calculated totals
            results.update(self._get_totals(data_dict))
            
            return results
            
        except Exception as e:
            logger.error(f"Error calculating metrics: {e}")
            return {}
    
    def _calculate_single_metric(self, data: Dict[str, Any], metric: str) -> Optional[float]:
        """Calculate a single metric"""
        definition = self.metric_definitions.get(metric)
        if not definition:
            return None
        
        # Check if required fields are present
        required_fields = definition['requires']
        if not all(field in data for field in required_fields):
            return None
        
        # Calculate based on metric type
        try:
            if metric == 'ctr':
                impressions = data.get('impressions', 0)
                if impressions > 0:
                    return data.get('clicks', 0) / impressions
                return 0.0
            
            elif metric == 'cvr':
                clicks = data.get('clicks', 0)
                if clicks > 0:
                    return data.get('conversions', 0) / clicks
                return 0.0
            
            elif metric == 'cpc':
                clicks = data.get('clicks', 0)
                if clicks > 0:
                    return data.get('spend', 0) / clicks
                return 0.0
            
            elif metric == 'cpm':
                impressions = data.get('impressions', 0)
                if impressions > 0:
                    return (data.get('spend', 0) / impressions) * 1000
                return 0.0
            
            elif metric == 'cpa':
                conversions = data.get('conversions', 0)
                if conversions > 0:
                    return data.get('spend', 0) / conversions
                return 0.0
            
            elif metric == 'roas':
                spend = data.get('spend', 0)
                if spend > 0:
                    return data.get('revenue', 0) / spend
                return 0.0
            
            elif metric == 'roi':
                spend = data.get('spend', 0)
                if spend > 0:
                    revenue = data.get('revenue', 0)
                    return (revenue - spend) / spend
                return 0.0
            
            elif metric == 'aov':
                conversions = data.get('conversions', 0)
                if conversions > 0:
                    return data.get('revenue', 0) / conversions
                return 0.0
            
            elif metric == 'frequency':
                reach = data.get('reach', 0)
                if reach > 0:
                    return data.get('impressions', 0) / reach
                return 0.0
            
            elif metric == 'engagement_rate':
                impressions = data.get('impressions', 0)
                if impressions > 0:
                    return data.get('engagements', 0) / impressions
                return 0.0
            
        except Exception as e:
            logger.error(f"Error calculating {metric}: {e}")
            return None
    
    def _get_totals(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Get total values from data"""
        totals = {}
        
        total_fields = [
            'impressions', 'clicks', 'conversions', 'spend', 
            'revenue', 'reach', 'engagements', 'leads',
            'video_views', 'video_completions'
        ]
        
        for field in total_fields:
            if field in data:
                totals[f'total_{field}'] = data[field]
        
        return totals
    
    def calculate_campaign_metrics(self, campaign_data: pd.DataFrame) -> pd.DataFrame:
        """Calculate metrics for campaign data"""
        # Calculate metrics for each row
        metrics_list = []
        
        for idx, row in campaign_data.iterrows():
            metrics = self.calculate_metrics(row.to_dict())
            metrics['index'] = idx
            metrics_list.append(metrics)
        
        # Create metrics DataFrame
        metrics_df = pd.DataFrame(metrics_list).set_index('index')
        
        # Combine with original data
        result_df = pd.concat([campaign_data, metrics_df], axis=1)
        
        return result_df
    
    def aggregate_metrics(self, data: pd.DataFrame, 
                         group_by: List[str],
                         metrics: Optional[List[str]] = None) -> pd.DataFrame:
        """Aggregate metrics by specified dimensions"""
        # Define aggregation rules
        agg_rules = {
            'impressions': 'sum',
            'clicks': 'sum',
            'conversions': 'sum',
            'spend': 'sum',
            'revenue': 'sum',
            'reach': 'sum',
            'engagements': 'sum',
            'leads': 'sum',
            'video_views': 'sum',
            'video_completions': 'sum'
        }
        
        # Apply aggregation
        aggregated = data.groupby(group_by).agg(agg_rules).reset_index()
        
        # Recalculate derived metrics
        for idx, row in aggregated.iterrows():
            calculated_metrics = self.calculate_metrics(row.to_dict(), metrics)
            for metric, value in calculated_metrics.items():
                if metric not in group_by:
                    aggregated.at[idx, metric] = value
        
        return aggregated
    
    def calculate_period_over_period(self, current_data: Dict[str, Any],
                                   previous_data: Dict[str, Any],
                                   metrics: Optional[List[str]] = None) -> Dict[str, Any]:
        """Calculate period-over-period changes"""
        current_metrics = self.calculate_metrics(current_data, metrics)
        previous_metrics = self.calculate_metrics(previous_data, metrics)
        
        changes = {}
        
        for metric in current_metrics:
            if metric in previous_metrics:
                current_val = current_metrics[metric]
                previous_val = previous_metrics[metric]
                
                # Calculate absolute change
                absolute_change = current_val - previous_val
                changes[f'{metric}_change'] = absolute_change
                
                # Calculate percentage change
                if previous_val != 0:
                    pct_change = (absolute_change / previous_val) * 100
                    changes[f'{metric}_change_pct'] = pct_change
                else:
                    changes[f'{metric}_change_pct'] = 100.0 if current_val > 0 else 0.0
        
        # Add current and previous values
        changes['current_period'] = current_metrics
        changes['previous_period'] = previous_metrics
        
        return changes
    
    def format_metric(self, value: float, metric_type: str) -> str:
        """Format metric value for display"""
        if pd.isna(value):
            return 'N/A'
        
        format_type = self.metric_definitions.get(metric_type, {}).get('format', 'decimal')
        
        if format_type == 'percentage':
            return f"{value * 100:.2f}%"
        elif format_type == 'currency':
            return f"${value:,.2f}"
        elif format_type == 'ratio':
            return f"{value:.2f}x"
        else:
            if value >= 1000000:
                return f"{value/1000000:.1f}M"
            elif value >= 1000:
                return f"{value/1000:.1f}K"
            else:
                return f"{value:.2f}"
    
    def calculate_benchmarks(self, data: pd.DataFrame, 
                           metric: str,
                           dimensions: Optional[List[str]] = None) -> Dict[str, Any]:
        """Calculate benchmark statistics for metrics"""
        benchmarks = {
            'mean': data[metric].mean(),
            'median': data[metric].median(),
            'std': data[metric].std(),
            'min': data[metric].min(),
            'max': data[metric].max(),
            'p25': data[metric].quantile(0.25),
            'p75': data[metric].quantile(0.75),
            'p90': data[metric].quantile(0.90)
        }
        
        if dimensions:
            # Calculate benchmarks by dimensions
            dimensional_benchmarks = {}
            for dim in dimensions:
                if dim in data.columns:
                    dim_benchmarks = data.groupby(dim)[metric].agg([
                        'mean', 'median', 'std', 'min', 'max'
                    ]).to_dict('index')
                    dimensional_benchmarks[dim] = dim_benchmarks
            
            benchmarks['by_dimension'] = dimensional_benchmarks
        
        return benchmarks
    
    def identify_top_performers(self, data: pd.DataFrame,
                              metric: str,
                              group_by: str,
                              top_n: int = 10) -> pd.DataFrame:
        """Identify top performing entities"""
        # Aggregate by group
        aggregated = data.groupby(group_by).agg({
            metric: 'mean',
            'impressions': 'sum',
            'spend': 'sum'
        }).reset_index()
        
        # Sort by metric
        top_performers = aggregated.nlargest(top_n, metric)
        
        # Add rank
        top_performers['rank'] = range(1, len(top_performers) + 1)
        
        return top_performers
    
    def calculate_contribution_analysis(self, data: pd.DataFrame,
                                      dimension: str,
                                      metric: str) -> pd.DataFrame:
        """Calculate contribution of each dimension value to total"""
        # Calculate totals by dimension
        dimension_totals = data.groupby(dimension)[metric].sum().reset_index()
        
        # Calculate total
        total = dimension_totals[metric].sum()
        
        # Calculate contribution
        dimension_totals['contribution_pct'] = (dimension_totals[metric] / total) * 100
        dimension_totals['cumulative_pct'] = dimension_totals['contribution_pct'].cumsum()
        
        # Sort by contribution
        dimension_totals = dimension_totals.sort_values('contribution_pct', ascending=False)
        
        return dimension_totals