"""
User model
"""

from sqlalchemy import Column, String, Boolean, DateTime, JSON, Enum
from sqlalchemy.orm import relationship
from app.db.base_class import Base
from datetime import datetime
import enum


class UserRole(str, enum.Enum):
    """User roles"""
    ADMIN = "admin"
    MANAGER = "manager"
    ANALYST = "analyst"
    VIEWER = "viewer"


class User(Base):
    """User model"""
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    role = Column(Enum(UserRole), default=UserRole.VIEWER, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, nullable=True)
    last_login = Column(DateTime, nullable=True)
    
    # Additional fields
    email_verified = Column(Boolean, default=False)
    phone = Column(String, nullable=True)
    company = Column(String, nullable=True)
    timezone = Column(String, default="UTC")
    preferences = Column(JSON, default={})
    api_key = Column(String, unique=True, nullable=True)
    
    # Relationships
    organizations = relationship("OrganizationMember", back_populates="user")
    campaigns = relationship("Campaign", back_populates="created_by_user")
    notifications = relationship("Notification", back_populates="user")
    reports = relationship("Report", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")
    
    def __repr__(self):
        return f"<User {self.email}>"
    
    def has_permission(self, permission: str) -> bool:
        """Check if user has specific permission"""
        if self.is_superuser:
            return True
            
        # Role-based permissions
        permissions_map = {
            UserRole.ADMIN: ["*"],
            UserRole.MANAGER: [
                "campaigns.view", "campaigns.create", "campaigns.edit", "campaigns.delete",
                "reports.view", "reports.create", "integrations.view", "integrations.manage"
            ],
            UserRole.ANALYST: [
                "campaigns.view", "reports.view", "reports.create", "integrations.view"
            ],
            UserRole.VIEWER: ["campaigns.view", "reports.view"]
        }
        
        role_permissions = permissions_map.get(self.role, [])
        return "*" in role_permissions or permission in role_permissions