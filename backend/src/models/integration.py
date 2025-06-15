"""
Integration model
"""

from sqlalchemy import Column, String, Boolean, DateTime, JSON, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base_class import Base
from app.models.campaign import PlatformType
from datetime import datetime


class Integration(Base):
    """Platform integration model"""
    __tablename__ = "integrations"
    
    id = Column(String, primary_key=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    platform = Column(Enum(PlatformType), nullable=False)
    
    # Encrypted credentials
    credentials = Column(JSON, nullable=False)
    
    # Configuration
    settings = Column(JSON, default={})
    
    # Status
    is_active = Column(Boolean, default=True)
    last_sync = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    
    # Relationships
    organization = relationship("Organization", back_populates="integrations")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('organization_id', 'platform', name='_org_platform_uc'),
    )
    
    def __repr__(self):
        return f"<Integration {self.platform} for {self.organization_id}>"