"""
AI Insights API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from app.models.user import User
from app.api.deps import get_current_user
from app.services.ai_service import ai_service
from app.schemas.ai_insights import (
    PredictionRequest,
    PredictionResponse,
    OptimizationRequest,
    OptimizationResponse,
    AnomalyResponse,
    InsightResponse
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/predict/campaign", response_model=PredictionResponse)
async def predict_campaign_performance(
    request: PredictionRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Predict future performance for a campaign
    """
    try:
        # Verify user has access to campaign
        if not await _user_has_campaign_access(current_user.id, request.campaign_id):
            raise HTTPException(status_code=403, detail="Access denied to campaign")
        
        async with ai_service as ai:
            prediction = await ai.predict_campaign_performance(
                campaign_id=request.campaign_id,
                prediction_days=request.prediction_days
            )
        
        if "error" in prediction:
            raise HTTPException(status_code=500, detail=prediction["error"])
        
        return PredictionResponse(**prediction)
        
    except Exception as e:
        logger.error(f"Error predicting campaign performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize/budget", response_model=OptimizationResponse)
async def optimize_budget_allocation(
    request: OptimizationRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Get optimized budget allocation across campaigns
    """
    try:
        # Verify user has access to all campaigns
        for campaign_id in request.campaign_ids:
            if not await _user_has_campaign_access(current_user.id, campaign_id):
                raise HTTPException(
                    status_code=403, 
                    detail=f"Access denied to campaign {campaign_id}"
                )
        
        async with ai_service as ai:
            optimization = await ai.optimize_budget_allocation(
                campaign_ids=request.campaign_ids,
                total_budget=request.total_budget,
                optimization_goal=request.optimization_goal
            )
        
        if "error" in optimization:
            raise HTTPException(status_code=500, detail=optimization["error"])
        
        return OptimizationResponse(**optimization)
        
    except Exception as e:
        logger.error(f"Error optimizing budget: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/anomalies/detect", response_model=AnomalyResponse)
async def detect_anomalies(
    campaign_id: Optional[str] = Query(None, description="Campaign ID"),
    metric_type: str = Query("all", description="Metric type to analyze"),
    time_range: int = Query(7, description="Days to analyze"),
    current_user: User = Depends(get_current_user)
):
    """
    Detect anomalies in campaign metrics
    """
    try:
        # Get metrics data
        metrics_data = await _get_campaign_metrics(
            campaign_id=campaign_id,
            user_id=current_user.id,
            days=time_range
        )
        
        async with ai_service as ai:
            anomalies = await ai.detect_anomalies(
                metrics_data=metrics_data,
                metric_type=metric_type
            )
        
        if "error" in anomalies:
            raise HTTPException(status_code=500, detail=anomalies["error"])
        
        return AnomalyResponse(**anomalies)
        
    except Exception as e:
        logger.error(f"Error detecting anomalies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights/campaign/{campaign_id}", response_model=InsightResponse)
async def get_campaign_insights(
    campaign_id: str,
    include_predictions: bool = Query(True),
    include_anomalies: bool = Query(True),
    include_optimization: bool = Query(True),
    current_user: User = Depends(get_current_user)
):
    """
    Get comprehensive AI insights for a campaign
    """
    try:
        # Verify access
        if not await _user_has_campaign_access(current_user.id, campaign_id):
            raise HTTPException(status_code=403, detail="Access denied to campaign")
        
        insights = {
            "campaign_id": campaign_id,
            "generated_at": datetime.now(),
            "insights": {}
        }
        
        async with ai_service as ai:
            # Get predictions
            if include_predictions:
                prediction = await ai.predict_campaign_performance(campaign_id)
                if "error" not in prediction:
                    insights["insights"]["predictions"] = prediction
            
            # Get anomalies
            if include_anomalies:
                metrics_data = await _get_campaign_metrics(campaign_id, current_user.id, 30)
                anomalies = await ai.detect_anomalies(metrics_data)
                if "error" not in anomalies:
                    insights["insights"]["anomalies"] = anomalies
            
            # Get optimization recommendations
            if include_optimization:
                recommendations = await ai.get_optimization_recommendations(
                    campaign_id,
                    optimization_type="all"
                )
                if "error" not in recommendations:
                    insights["insights"]["optimization"] = recommendations
        
        return InsightResponse(**insights)
        
    except Exception as e:
        logger.error(f"Error getting campaign insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate/ad-copy")
async def generate_ad_copy(
    product: str,
    target_audience: str,
    platform: str,
    tone: str = "professional",
    variations: int = Query(3, ge=1, le=10),
    current_user: User = Depends(get_current_user)
):
    """
    Generate AI-powered ad copy suggestions
    """
    try:
        async with ai_service as ai:
            ad_copies = await ai.generate_ad_copy(
                product=product,
                target_audience=target_audience,
                platform=platform,
                tone=tone
            )
        
        if "error" in ad_copies:
            raise HTTPException(status_code=500, detail=ad_copies["error"])
        
        # Limit variations
        if "variations" in ad_copies:
            ad_copies["variations"] = ad_copies["variations"][:variations]
        
        return ad_copies
        
    except Exception as e:
        logger.error(f"Error generating ad copy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/sentiment")
async def analyze_comment_sentiment(
    comments: List[Dict[str, Any]],
    current_user: User = Depends(get_current_user)
):
    """
    Analyze sentiment of campaign comments/feedback
    """
    try:
        async with ai_service as ai:
            sentiment_analysis = await ai.analyze_sentiment(comments)
        
        if "error" in sentiment_analysis:
            raise HTTPException(status_code=500, detail=sentiment_analysis["error"])
        
        return sentiment_analysis
        
    except Exception as e:
        logger.error(f"Error analyzing sentiment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segment/audience")
async def segment_audience(
    audience_data: List[Dict[str, Any]],
    segmentation_criteria: Optional[List[str]] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Segment audience using AI clustering
    """
    try:
        async with ai_service as ai:
            segmentation = await ai.segment_audience(audience_data)
        
        if "error" in segmentation:
            raise HTTPException(status_code=500, detail=segmentation["error"])
        
        return segmentation
        
    except Exception as e:
        logger.error(f"Error segmenting audience: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize/creatives")
async def analyze_creative_performance(
    creative_data: List[Dict[str, Any]],
    optimization_goal: str = "ctr",
    current_user: User = Depends(get_current_user)
):
    """
    Analyze and optimize creative performance
    """
    try:
        async with ai_service as ai:
            creative_analysis = await ai.analyze_creatives(creative_data)
        
        if "error" in creative_analysis:
            raise HTTPException(status_code=500, detail=creative_analysis["error"])
        
        return creative_analysis
        
    except Exception as e:
        logger.error(f"Error analyzing creatives: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast/{metric}")
async def forecast_metric(
    metric: str,
    campaign_id: Optional[str] = Query(None),
    periods: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    """
    Forecast future values for a specific metric
    """
    try:
        # Get historical data
        historical_data = await _get_historical_metrics(
            metric=metric,
            campaign_id=campaign_id,
            user_id=current_user.id,
            days=90  # Use 90 days of history for forecasting
        )
        
        if not historical_data:
            raise HTTPException(
                status_code=400,
                detail="Insufficient historical data for forecasting"
            )
        
        async with ai_service as ai:
            forecast = await ai.forecast_metrics(
                historical_data=historical_data,
                metric=metric,
                periods=periods
            )
        
        if "error" in forecast:
            raise HTTPException(status_code=500, detail=forecast["error"])
        
        return forecast
        
    except Exception as e:
        logger.error(f"Error forecasting metric: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Helper functions
async def _user_has_campaign_access(user_id: str, campaign_id: str) -> bool:
    """Check if user has access to campaign"""
    # Mock implementation - replace with actual access control
    return True


async def _get_campaign_metrics(
    campaign_id: Optional[str],
    user_id: str,
    days: int
) -> Dict[str, Any]:
    """Get campaign metrics for analysis"""
    # Mock implementation - replace with actual database query
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    # In real implementation, query from database
    metrics_data = {
        "campaign_id": campaign_id,
        "user_id": user_id,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "metrics": [
            {
                "date": (start_date + timedelta(days=i)).isoformat(),
                "impressions": 10000 + i * 100,
                "clicks": 250 + i * 10,
                "conversions": 15 + i,
                "spend": 500 + i * 20,
                "revenue": 1500 + i * 50
            }
            for i in range(days)
        ]
    }
    
    return metrics_data


async def _get_historical_metrics(
    metric: str,
    campaign_id: Optional[str],
    user_id: str,
    days: int
) -> List[Dict[str, Any]]:
    """Get historical metric data"""
    # Mock implementation - replace with actual database query
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    historical_data = []
    for i in range(days):
        date = start_date + timedelta(days=i)
        value = 100 + i * 5  # Mock increasing trend
        
        if metric == "spend":
            value *= 10
        elif metric == "conversions":
            value /= 10
        
        historical_data.append({
            "date": date.isoformat(),
            "value": value + (i % 7) * 10  # Add weekly seasonality
        })
    
    return historical_data