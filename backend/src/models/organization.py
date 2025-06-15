"""
Organization models
"""

from sqlalchemy import Column, String, Boolean, DateTime, JSON, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.db.base_class import Base
from app.models.user import UserRole
from datetime import datetime


class Organization(Base):
    """Organization model"""
    __tablename__ = "organizations"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    
    # Settings
    settings = Column(JSON, default={})
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, nullable=True)
    
    # Relationships
    owner = relationship("User")
    members = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="organization")
    integrations = relationship("Integration", back_populates="organization")
    reports = relationship("Report", back_populates="organization")
    
    def __repr__(self):
        return f"<Organization {self.name}>"


class OrganizationMember(Base):
    """Organization member model"""
    __tablename__ = "organization_members"
    
    id = Column(String, primary_key=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    
    # Timestamps
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    organization = relationship("Organization", back_populates="members")
    user = relationship("User", back_populates="organizations")
    
    # Constraints
    __table_args__ = (
        {"extend_existing": True},
    )
    
    def __repr__(self):
        return f"<OrganizationMember {self.user_id} in {self.organization_id}>"