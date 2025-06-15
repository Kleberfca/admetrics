"""
User schemas
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, validator
from app.models.user import UserRole


class UserBase(BaseModel):
    """Base user schema"""
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = True
    role: Optional[UserRole] = UserRole.VIEWER
    phone: Optional[str] = None
    company: Optional[str] = None
    timezone: Optional[str] = "UTC"


class UserCreate(UserBase):
    """Schema for creating user"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    
    @validator('username')
    def username_alphanumeric(cls, v):
        assert v.replace('_', '').replace('-', '').isalnum(), 'Username must be alphanumeric'
        return v


class UserUpdate(UserBase):
    """Schema for updating user"""
    password: Optional[str] = Field(None, min_length=8)


class UserInDBBase(UserBase):
    """Base schema for user in DB"""
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    email_verified: bool = False
    
    class Config:
        from_attributes = True


class User(UserInDBBase):
    """Schema for user response"""
    pass


class UserInDB(UserInDBBase):
    """Schema for user in DB with password"""
    hashed_password: str


class UserPreferences(BaseModel):
    """User preferences schema"""
    notifications_enabled: bool = True
    email_notifications: bool = True
    dashboard_layout: Optional[dict] = {}
    default_date_range: str = "last_30_days"
    preferred_currency: str = "USD"
    
    class Config:
        schema_extra = {
            "example": {
                "notifications_enabled": True,
                "email_notifications": True,
                "dashboard_layout": {"widgets": ["metrics", "campaigns", "alerts"]},
                "default_date_range": "last_30_days",
                "preferred_currency": "USD"
            }
        }


class PasswordChange(BaseModel):
    """Password change schema"""
    current_password: str
    new_password: str = Field(..., min_length=8)


class PasswordReset(BaseModel):
    """Password reset schema"""
    token: str
    new_password: str = Field(..., min_length=8)