"""
Campaign schemas
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
from app.models.campaign import CampaignStatus, PlatformType


class CampaignBase(BaseModel):
    """Base campaign schema"""
    name: str = Field(..., min_length=1, max_length=255)
    platform: PlatformType
    status: Optional[CampaignStatus] = CampaignStatus.DRAFT
    budget: Optional[float] = Field(None, ge=0)
    daily_budget: Optional[float] = Field(None, ge=0)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    objective: Optional[str] = None
    target_audience: Optional[Dict[str, Any]] = {}
    settings: Optional[Dict[str, Any]] = {}
    
    @validator('end_date')
    def validate_dates(cls, v, values):
        if v and 'start_date' in values and values['start_date']:
            if v <= values['start_date']:
                raise ValueError('end_date must be after start_date')
        return v


class CampaignCreate(CampaignBase):
    """Schema for creating campaign"""
    pass


class CampaignUpdate(BaseModel):
    """Schema for updating campaign"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    status: Optional[CampaignStatus] = None
    budget: Optional[float] = Field(None, ge=0)
    daily_budget: Optional[float] = Field(None, ge=0)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    objective: Optional[str] = None
    target_audience: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None


class CampaignInDBBase(CampaignBase):
    """Base schema for campaign in DB"""
    id: str
    organization_id: str
    external_id: Optional[str] = None
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class Campaign(CampaignInDBBase):
    """Schema for campaign response"""
    is_active: bool = False
    
    @validator('is_active', always=True)
    def calculate_is_active(cls, v, values):
        if 'status' in values and values['status'] != CampaignStatus.ACTIVE:
            return False
        
        now = datetime.utcnow()
        if 'start_date' in values and values['start_date'] and now < values['start_date']:
            return False
        if 'end_date' in values and values['end_date'] and now > values['end_date']:
            return False
            
        return True


class CampaignWithMetrics(Campaign):
    """Campaign with aggregated metrics"""
    total_impressions: int = 0
    total_clicks: int = 0
    total_conversions: int = 0
    total_spend: float = 0
    total_revenue: float = 0
    avg_ctr: float = 0
    avg_cvr: float = 0
    avg_cpc: float = 0
    avg_cpa: float = 0
    roas: float = 0


class CampaignList(BaseModel):
    """List of campaigns with pagination"""
    items: List[Campaign]
    total: int
    page: int
    size: int
    pages: int