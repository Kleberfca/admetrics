"""
AI Insights schemas for request/response validation
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum


class OptimizationGoal(str, Enum):
    """Optimization goals"""
    CONVERSIONS = "conversions"
    CLICKS = "clicks"
    IMPRESSIONS = "impressions"
    ROAS = "roas"
    CPA = "cpa"


class PredictionRequest(BaseModel):
    """Campaign prediction request"""
    campaign_id: str = Field(..., description="Campaign ID to predict")
    prediction_days: int = Field(30, ge=1, le=365, description="Number of days to predict")
    
    class Config:
        schema_extra = {
            "example": {
                "campaign_id": "camp_123",
                "prediction_days": 30
            }
        }


class PredictionResponse(BaseModel):
    """Campaign prediction response"""
    campaign_id: str
    prediction_days: int
    predictions: List[Dict[str, Any]]
    confidence_score: float = Field(..., ge=0, le=1)
    trend: str
    insights: List[str]
    
    class Config:
        schema_extra = {
            "example": {
                "campaign_id": "camp_123",
                "prediction_days": 30,
                "predictions": [
                    {
                        "date": "2024-02-01",
                        "predicted_impressions": 15000,
                        "predicted_clicks": 450,
                        "predicted_conversions": 25,
                        "confidence_interval": {
                            "lower": {"impressions": 13500, "clicks": 400, "conversions": 20},
                            "upper": {"impressions": 16500, "clicks": 500, "conversions": 30}
                        }
                    }
                ],
                "confidence_score": 0.85,
                "trend": "increasing",
                "insights": [
                    "Campaign performance is expected to improve by 15% over the next 30 days",
                    "Weekend performance shows stronger engagement patterns"
                ]
            }
        }


class OptimizationRequest(BaseModel):
    """Budget optimization request"""
    campaign_ids: List[str] = Field(..., min_items=1, description="Campaign IDs to optimize")
    total_budget: float = Field(..., gt=0, description="Total budget to allocate")
    optimization_goal: OptimizationGoal = Field(OptimizationGoal.CONVERSIONS, description="Optimization goal")
    constraints: Optional[Dict[str, Any]] = Field(None, description="Additional constraints")
    
    class Config:
        schema_extra = {
            "example": {
                "campaign_ids": ["camp_123", "camp_456", "camp_789"],
                "total_budget": 10000.0,
                "optimization_goal": "conversions",
                "constraints": {
                    "min_budget_per_campaign": 500,
                    "max_budget_per_campaign": 5000
                }
            }
        }


class OptimizationResponse(BaseModel):
    """Budget optimization response"""
    optimized_allocations: Dict[str, float]
    expected_results: Dict[str, Any]
    optimization_score: float
    recommendations: List[str]
    
    class Config:
        schema_extra = {
            "example": {
                "optimized_allocations": {
                    "camp_123": 4500.0,
                    "camp_456": 3500.0,
                    "camp_789": 2000.0
                },
                "expected_results": {
                    "total_conversions": 250,
                    "total_clicks": 5000,
                    "average_cpa": 40.0,
                    "improvement_percentage": 25.5
                },
                "optimization_score": 0.92,
                "recommendations": [
                    "Increase budget for camp_123 by 50% for optimal performance",
                    "Consider pausing camp_789 due to high CPA"
                ]
            }
        }


class AnomalyResponse(BaseModel):
    """Anomaly detection response"""
    anomalies: Dict[str, List[Dict[str, Any]]]
    total_anomalies: int
    insights: List[str]
    metrics_analyzed: List[str]
    time_range: Dict[str, Optional[str]]
    
    class Config:
        schema_extra = {
            "example": {
                "anomalies": {
                    "critical": [
                        {
                            "date": "2024-01-15",
                            "metric": "cpc",
                            "value": 15.5,
                            "expected_range": [2.0, 5.0],
                            "type": "spike",
                            "description": "CPC increased by 300% compared to average"
                        }
                    ],
                    "warning": [],
                    "info": []
                },
                "total_anomalies": 1,
                "insights": [
                    "Critical CPC spike detected on 2024-01-15",
                    "Investigate bid adjustments or increased competition"
                ],
                "metrics_analyzed": ["clicks", "impressions", "spend", "cpc"],
                "time_range": {
                    "start": "2024-01-01",
                    "end": "2024-01-31"
                }
            }
        }


class InsightResponse(BaseModel):
    """Comprehensive insights response"""
    campaign_id: str
    generated_at: datetime
    insights: Dict[str, Any]
    
    class Config:
        schema_extra = {
            "example": {
                "campaign_id": "camp_123",
                "generated_at": "2024-01-31T10:00:00Z",
                "insights": {
                    "predictions": {
                        "30_day_forecast": {...},
                        "trend": "increasing"
                    },
                    "anomalies": {
                        "total": 2,
                        "critical": 1
                    },
                    "optimization": {
                        "recommendations": [
                            "Increase daily budget to $500",
                            "Adjust bid strategy to maximize conversions"
                        ],
                        "potential_improvement": "25% increase in conversions"
                    }
                }
            }
        }


class AdCopyRequest(BaseModel):
    """Ad copy generation request"""
    product: str = Field(..., description="Product or service name")
    target_audience: str = Field(..., description="Target audience description")
    platform: str = Field(..., description="Advertising platform")
    tone: str = Field("professional", description="Tone of voice")
    keywords: Optional[List[str]] = Field(None, description="Keywords to include")
    
    class Config:
        schema_extra = {
            "example": {
                "product": "Eco-friendly Water Bottles",
                "target_audience": "Health-conscious millennials",
                "platform": "FACEBOOK_ADS",
                "tone": "friendly",
                "keywords": ["sustainable", "BPA-free", "reusable"]
            }
        }


class AdCopyResponse(BaseModel):
    """Ad copy generation response"""
    variations: List[Dict[str, Any]]
    platform: str
    recommendations: List[str]
    
    class Config:
        schema_extra = {
            "example": {
                "variations": [
                    {
                        "headline": "Stay Hydrated, Save the Planet",
                        "description": "Our eco-friendly water bottles are perfect for your active lifestyle. BPA-free, sustainable, and stylish!",
                        "cta": "Shop Now",
                        "quality_score": 0.92
                    }
                ],
                "platform": "FACEBOOK_ADS",
                "recommendations": [
                    "Use emojis to increase engagement",
                    "Test different CTA buttons"
                ]
            }
        }


class SentimentAnalysisRequest(BaseModel):
    """Sentiment analysis request"""
    comments: List[Dict[str, Any]] = Field(..., min_items=1)
    
    class Config:
        schema_extra = {
            "example": {
                "comments": [
                    {
                        "id": "comment_1",
                        "text": "Love this product! Fast delivery and great quality.",
                        "timestamp": "2024-01-15T10:00:00Z",
                        "platform": "facebook"
                    }
                ]
            }
        }


class AudienceSegmentRequest(BaseModel):
    """Audience segmentation request"""
    audience_data: List[Dict[str, Any]] = Field(..., min_items=10)
    segmentation_criteria: Optional[List[str]] = None
    min_segment_size: int = Field(100, ge=10)
    
    class Config:
        schema_extra = {
            "example": {
                "audience_data": [
                    {
                        "user_id": "user_1",
                        "age": 25,
                        "gender": "female",
                        "interests": ["fitness", "nutrition"],
                        "purchase_history": {"count": 3, "total": 150.0}
                    }
                ],
                "segmentation_criteria": ["age", "interests", "purchase_behavior"],
                "min_segment_size": 100
            }
        }


class CreativeAnalysisRequest(BaseModel):
    """Creative analysis request"""
    creative_data: List[Dict[str, Any]] = Field(..., min_items=1)
    optimization_goal: str = Field("ctr", description="Metric to optimize for")
    
    class Config:
        schema_extra = {
            "example": {
                "creative_data": [
                    {
                        "creative_id": "creative_1",
                        "type": "image",
                        "headline": "Summer Sale!",
                        "impressions": 10000,
                        "clicks": 250,
                        "conversions": 15
                    }
                ],
                "optimization_goal": "ctr"
            }
        }


class ForecastRequest(BaseModel):
    """Metric forecast request"""
    metric: str = Field(..., description="Metric to forecast")
    campaign_id: Optional[str] = Field(None, description="Specific campaign ID")
    periods: int = Field(30, ge=1, le=365, description="Number of periods to forecast")
    
    class Config:
        schema_extra = {
            "example": {
                "metric": "conversions",
                "campaign_id": "camp_123",
                "periods": 30
            }
        }