"""
AI Service for backend integration with AI Engine
"""

import aiohttp
import asyncio
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime, timedelta
import json
from app.core.config import settings

logger = logging.getLogger(__name__)


class AIService:
    """Service for AI Engine integration"""
    
    def __init__(self):
        self.ai_engine_url = settings.AI_ENGINE_URL
        self.timeout = aiohttp.ClientTimeout(total=60)
        self.session = None
        
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
    
    async def predict_campaign_performance(self, 
                                         campaign_id: str,
                                         prediction_days: int = 30) -> Dict[str, Any]:
        """Get campaign performance predictions"""
        try:
            endpoint = f"{self.ai_engine_url}/predict/campaign"
            
            data = {
                "campaign_id": campaign_id,
                "prediction_days": prediction_days
            }
            
            async with self.session.post(endpoint, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Prediction failed: {response.status}")
                    return {"error": "Prediction failed", "status": response.status}
                    
        except asyncio.TimeoutError:
            logger.error("Prediction request timed out")
            return {"error": "Request timed out"}
        except Exception as e:
            logger.error(f"Error predicting campaign performance: {e}")
            return {"error": str(e)}
    
    async def optimize_budget_allocation(self,
                                       campaign_ids: List[str],
                                       total_budget: float,
                                       optimization_goal: str = "conversions") -> Dict[str, Any]:
        """Get optimized budget allocation"""
        try:
            endpoint = f"{self.ai_engine_url}/optimize/budget"
            
            data = {
                "campaign_ids": campaign_ids,
                "total_budget": total_budget,
                "optimization_goal": optimization_goal
            }
            
            async with self.session.post(endpoint, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Budget optimization failed: {response.status}")
                    return {"error": "Optimization failed", "status": response.status}
                    
        except Exception as e:
            logger.error(f"Error optimizing budget: {e}")
            return {"error": str(e)}
    
    async def segment_audience(self, audience_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Get audience segmentation"""
        try:
            endpoint = f"{self.ai_engine_url}/segment/audience"
            
            data = {
                "audience_data": audience_data
            }
            
            async with self.session.post(endpoint, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Audience segmentation failed: {response.status}")
                    return {"error": "Segmentation failed", "status": response.status}
                    
        except Exception as e:
            logger.error(f"Error segmenting audience: {e}")
            return {"error": str(e)}
    
    async def analyze_sentiment(self, comments: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze sentiment of comments"""
        try:
            endpoint = f"{self.ai_engine_url}/analyze/sentiment"
            
            data = {
                "comments": comments
            }
            
            async with self.session.post(endpoint, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Sentiment analysis failed: {response.status}")
                    return {"error": "Analysis failed", "status": response.status}
                    
        except Exception as e:
            logger.error(f"Error analyzing sentiment: {e}")
            return {"error": str(e)}
    
    async def generate_ad_copy(self,
                             product: str,
                             target_audience: str,
                             platform: str,
                             tone: str = "professional") -> Dict[str, Any]:
        """Generate ad copy suggestions"""
        try:
            endpoint = f"{self.ai_engine_url}/generate/ad-copy"
            
            data = {
                "product": product,
                "target_audience": target_audience,
                "platform": platform,
                "tone": tone
            }
            
            async with self.session.post(endpoint, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Ad copy generation failed: {response.status}")
                    return {"error": "Generation failed", "status": response.status}
                    
        except Exception as e:
            logger.error(f"Error generating ad copy: {e}")
            return {"error": str(e)}
    
    async def detect_anomalies(self,
                             metrics_data: Dict[str, Any],
                             metric_type: str = "all") -> Dict[str, Any]:
        """Detect anomalies in metrics"""
        try:
            endpoint = f"{self.ai_engine_url}/detect/anomalies"
            
            data = {
                "metrics_data": metrics_data,
                "metric_type": metric_type
            }
            
            async with self.session.post(endpoint, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Anomaly detection failed: {response.status}")
                    return {"error": "Detection failed", "status": response.status}
                    
        except Exception as e:
            logger.error(f"Error detecting anomalies: {e}")
            return {"error": str(e)}
    
    async def optimize_bids(self,
                          campaign_data: List[Dict[str, Any]],
                          constraints: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Optimize campaign bids"""
        try:
            endpoint = f"{self.ai_engine_url}/optimize/bids"
            
            data = {
                "campaign_data": campaign_data,
                "constraints": constraints or {}
            }
            
            async with self.session.post(endpoint, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Bid optimization failed: {response.status}")
                    return {"error": "Optimization failed", "status": response.status}
                    
        except Exception as e:
            logger.error(f"Error optimizing bids: {e}")
            return {"error": str(e)}
    
    async def analyze_creatives(self, creative_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze creative performance"""
        try:
            endpoint = f"{self.ai_engine_url}/analyze/creatives"
            
            data = {
                "creative_data": creative_data
            }
            
            async with self.session.post(endpoint, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Creative analysis failed: {response.status}")
                    return {"error": "Analysis failed", "status": response.status}
                    
        except Exception as e:
            logger.error(f"Error analyzing creatives: {e}")
            return {"error": str(e)}
    
    async def forecast_metrics(self,
                             historical_data: List[Dict[str, Any]],
                             metric: str,
                             periods: int = 30) -> Dict[str, Any]:
        """Forecast future metrics"""
        try:
            endpoint = f"{self.ai_engine_url}/forecast/metrics"
            
            data = {
                "historical_data": historical_data,
                "metric": metric,
                "periods": periods
            }
            
            async with self.session.post(endpoint, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Metric forecasting failed: {response.status}")
                    return {"error": "Forecasting failed", "status": response.status}
                    
        except Exception as e:
            logger.error(f"Error forecasting metrics: {e}")
            return {"error": str(e)}
    
    async def get_optimization_recommendations(self,
                                             campaign_id: str,
                                             optimization_type: str = "all") -> Dict[str, Any]:
        """Get AI-powered optimization recommendations"""
        try:
            # Get campaign data first
            campaign_metrics = await self._get_campaign_metrics(campaign_id)
            
            recommendations = {
                "campaign_id": campaign_id,
                "generated_at": datetime.now().isoformat(),
                "recommendations": []
            }
            
            # Performance prediction
            if optimization_type in ["all", "performance"]:
                prediction = await self.predict_campaign_performance(campaign_id)
                if "error" not in prediction:
                    recommendations["performance_forecast"] = prediction
            
            # Bid optimization
            if optimization_type in ["all", "bids"]:
                bid_optimization = await self.optimize_bids([campaign_metrics])
                if "error" not in bid_optimization:
                    recommendations["bid_recommendations"] = bid_optimization
            
            # Anomaly detection
            if optimization_type in ["all", "anomalies"]:
                anomalies = await self.detect_anomalies(campaign_metrics)
                if "error" not in anomalies and anomalies.get("total_anomalies", 0) > 0:
                    recommendations["anomaly_alerts"] = anomalies
            
            # Generate actionable recommendations
            recommendations["recommendations"] = self._generate_recommendations(
                recommendations,
                campaign_metrics
            )
            
            return recommendations
            
        except Exception as e:
            logger.error(f"Error getting recommendations: {e}")
            return {"error": str(e)}
    
    async def _get_campaign_metrics(self, campaign_id: str) -> Dict[str, Any]:
        """Get campaign metrics (mock implementation)"""
        # In real implementation, this would fetch from database
        return {
            "campaign_id": campaign_id,
            "impressions": 100000,
            "clicks": 2500,
            "conversions": 150,
            "spend": 5000,
            "revenue": 15000,
            "ctr": 0.025,
            "cvr": 0.06,
            "roas": 3.0
        }
    
    def _generate_recommendations(self, 
                                analysis_results: Dict[str, Any],
                                campaign_metrics: Dict[str, Any]) -> List[str]:
        """Generate actionable recommendations based on analysis"""
        recommendations = []
        
        # Performance-based recommendations
        if "performance_forecast" in analysis_results:
            forecast = analysis_results["performance_forecast"]
            if forecast.get("trend") == "declining":
                recommendations.append(
                    "Performance is forecasted to decline. Consider refreshing ad creatives "
                    "or adjusting targeting parameters."
                )
        
        # Bid-based recommendations
        if "bid_recommendations" in analysis_results:
            bid_recs = analysis_results["bid_recommendations"]
            if bid_recs.get("optimization_summary", {}).get("expected_conversion_lift", 0) > 10:
                recommendations.append(
                    f"Bid optimization can improve conversions by "
                    f"{bid_recs['optimization_summary']['expected_conversion_lift']:.1f}%. "
                    "Consider implementing suggested bid adjustments."
                )
        
        # Anomaly-based recommendations
        if "anomaly_alerts" in analysis_results:
            anomalies = analysis_results["anomaly_alerts"]
            critical_anomalies = anomalies.get("anomalies", {}).get("critical", [])
            if critical_anomalies:
                recommendations.append(
                    f"Detected {len(critical_anomalies)} critical anomalies. "
                    "Immediate investigation recommended to prevent budget waste."
                )
        
        # Metric-based recommendations
        if campaign_metrics.get("ctr", 0) < 0.01:
            recommendations.append(
                "CTR is below 1%. Consider improving ad relevance, "
                "testing new headlines, or refining audience targeting."
            )
        
        if campaign_metrics.get("roas", 0) < 2.0:
            recommendations.append(
                "ROAS is below 2.0x. Focus on high-converting audiences "
                "and consider pausing underperforming ad sets."
            )
        
        return recommendations


# Singleton instance
ai_service = AIService()