"""
Campaign model
"""

from sqlalchemy import Column, String, Float, DateTime, JSON, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base_class import Base
from datetime import datetime
import enum


class CampaignStatus(str, enum.Enum):
    """Campaign status"""
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class PlatformType(str, enum.Enum):
    """Advertising platforms"""
    GOOGLE_ADS = "GOOGLE_ADS"
    FACEBOOK_ADS = "FACEBOOK_ADS"
    INSTAGRAM_ADS = "INSTAGRAM_ADS"
    TIKTOK_ADS = "TIKTOK_ADS"
    LINKEDIN_ADS = "LINKEDIN_ADS"
    TWITTER_ADS = "TWITTER_ADS"
    YOUTUBE_ADS = "YOUTUBE_ADS"
    PINTEREST_ADS = "PINTEREST_ADS"
    SNAPCHAT_ADS = "SNAPCHAT_ADS"


class Campaign(Base):
    """Campaign model"""
    __tablename__ = "campaigns"
    
    id = Column(String, primary_key=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String, nullable=False)
    platform = Column(Enum(PlatformType), nullable=False)
    external_id = Column(String, nullable=True)  # Platform's campaign ID
    status = Column(Enum(CampaignStatus), default=CampaignStatus.DRAFT, nullable=False)
    
    # Budget
    budget = Column(Float, nullable=True)
    daily_budget = Column(Float, nullable=True)
    
    # Schedule
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    
    # Configuration
    objective = Column(String, nullable=True)
    target_audience = Column(JSON, default={})
    settings = Column(JSON, default={})
    
    # Metadata
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, nullable=True)
    
    # Relationships
    organization = relationship("Organization", back_populates="campaigns")
    created_by_user = relationship("User", back_populates="campaigns")
    metrics = relationship("Metrics", back_populates="campaign", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Campaign {self.name} ({self.platform})>"
    
    @property
    def is_active(self) -> bool:
        """Check if campaign is currently active"""
        if self.status != CampaignStatus.ACTIVE:
            return False
            
        now = datetime.utcnow()
        if self.start_date and now < self.start_date:
            return False
        if self.end_date and now > self.end_date:
            return False
            
        return True