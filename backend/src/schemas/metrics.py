"""
Metrics schemas
"""

from typing import Optional, List, Dict, Any
from datetime import date, datetime
from pydantic import BaseModel, Field


class MetricsBase(BaseModel):
    """Base metrics schema"""
    impressions: int = Field(0, ge=0)
    clicks: int = Field(0, ge=0)
    conversions: int = Field(0, ge=0)
    spend: float = Field(0, ge=0)
    revenue: float = Field(0, ge=0)
    reach: Optional[int] = Field(0, ge=0)
    frequency: Optional[float] = Field(0, ge=0)
    engagements: Optional[int] = Field(0, ge=0)
    video_views: Optional[int] = Field(0, ge=0)
    video_completions: Optional[int] = Field(0, ge=0)
    leads: Optional[int] = Field(0, ge=0)
    custom_metrics: Optional[Dict[str, Any]] = {}


class MetricsCreate(MetricsBase):
    """Schema for creating metrics"""
    campaign_id: str
    date: date


class MetricsUpdate(MetricsBase):
    """Schema for updating metrics"""
    pass


class MetricsInDBBase(MetricsBase):
    """Base schema for metrics in DB"""
    id: str
    campaign_id: str
    date: date
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Calculated fields
    ctr: float = 0
    cvr: float = 0
    cpc: float = 0
    cpa: float = 0
    roas: float = 0
    cpm: float = 0
    
    class Config:
        from_attributes = True


class Metrics(MetricsInDBBase):
    """Schema for metrics response"""
    pass


class MetricsSummary(BaseModel):
    """Aggregated metrics summary"""
    impressions: int = 0
    clicks: int = 0
    conversions: int = 0
    spend: float = 0
    revenue: float = 0
    ctr: float = 0
    cvr: float = 0
    cpc: float = 0
    cpa: float = 0
    roas: float = 0
    
    
class MetricsTimeSeries(BaseModel):
    """Time series metrics data"""
    date: date
    impressions: int = 0
    clicks: int = 0
    conversions: int = 0
    spend: float = 0
    revenue: float = 0


class DashboardMetrics(BaseModel):
    """Dashboard metrics response"""
    summary: MetricsSummary
    time_series: List[MetricsTimeSeries]
    date_range: Dict[str, str]
    
    class Config:
        schema_extra = {
            "example": {
                "summary": {
                    "impressions": 1000000,
                    "clicks": 25000,
                    "conversions": 1500,
                    "spend": 5000.0,
                    "revenue": 15000.0,
                    "ctr": 0.025,
                    "cvr": 0.06,
                    "cpc": 0.20,
                    "cpa": 3.33,
                    "roas": 3.0
                },
                "time_series": [
                    {
                        "date": "2024-01-01",
                        "impressions": 50000,
                        "clicks": 1250,
                        "conversions": 75,
                        "spend": 250.0,
                        "revenue": 750.0
                    }
                ],
                "date_range": {
                    "start": "2024-01-01",
                    "end": "2024-01-31"
                }
            }
        }