"""
Metrics model
"""

from sqlalchemy import Column, String, Integer, Float, Date, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base_class import Base
from datetime import datetime


class Metrics(Base):
    """Campaign metrics model"""
    __tablename__ = "metrics"
    
    id = Column(String, primary_key=True, index=True)
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=False)
    date = Column(Date, nullable=False)
    
    # Basic metrics
    impressions = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    conversions = Column(Integer, default=0)
    spend = Column(Float, default=0.0)
    revenue = Column(Float, default=0.0)
    
    # Engagement metrics
    reach = Column(Integer, default=0)
    frequency = Column(Float, default=0.0)
    engagements = Column(Integer, default=0)
    
    # Video metrics
    video_views = Column(Integer, default=0)
    video_completions = Column(Integer, default=0)
    
    # Lead metrics
    leads = Column(Integer, default=0)
    
    # Custom metrics (platform-specific)
    custom_metrics = Column(JSON, default={})
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, nullable=True)
    
    # Relationships
    campaign = relationship("Campaign", back_populates="metrics")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('campaign_id', 'date', name='_campaign_date_uc'),
    )
    
    def __repr__(self):
        return f"<Metrics {self.campaign_id} - {self.date}>"
    
    @property
    def ctr(self) -> float:
        """Calculate Click-Through Rate"""
        return self.clicks / self.impressions if self.impressions > 0 else 0.0
    
    @property
    def cvr(self) -> float:
        """Calculate Conversion Rate"""
        return self.conversions / self.clicks if self.clicks > 0 else 0.0
    
    @property
    def cpc(self) -> float:
        """Calculate Cost Per Click"""
        return self.spend / self.clicks if self.clicks > 0 else 0.0
    
    @property
    def cpa(self) -> float:
        """Calculate Cost Per Acquisition"""
        return self.spend / self.conversions if self.conversions > 0 else 0.0
    
    @property
    def roas(self) -> float:
        """Calculate Return on Ad Spend"""
        return self.revenue / self.spend if self.spend > 0 else 0.0
    
    @property
    def cpm(self) -> float:
        """Calculate Cost Per Mille (thousand impressions)"""
        return (self.spend / self.impressions) * 1000 if self.impressions > 0 else 0.0