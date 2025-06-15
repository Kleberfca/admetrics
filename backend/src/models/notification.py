"""
Notification models
"""

from enum import Enum
from sqlalchemy import Column, String, DateTime, Boolean, JSON, Enum as SQLEnum
from app.db.base_class import Base
from datetime import datetime


class NotificationType(str, Enum):
    """Notification types"""
    ALERT = "alert"
    WARNING = "warning"
    INFO = "info"
    SUCCESS = "success"
    REPORT = "report"
    SYSTEM = "system"


class NotificationPriority(str, Enum):
    """Notification priority levels"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class NotificationChannel(str, Enum):
    """Notification delivery channels"""
    EMAIL = "email"
    IN_APP = "in_app"
    WEBHOOK = "webhook"
    SMS = "sms"
    SLACK = "slack"


class Notification(Base):
    """Notification model"""
    __tablename__ = "notifications"
    
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    type = Column(SQLEnum(NotificationType), nullable=False)
    priority = Column(SQLEnum(NotificationPriority), default=NotificationPriority.MEDIUM)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    data = Column(JSON, nullable=True)
    
    # Delivery status
    channels = Column(JSON, default=list)  # List of channels to deliver through
    delivered_channels = Column(JSON, default=list)  # Successfully delivered channels
    failed_channels = Column(JSON, default=list)  # Failed delivery channels
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    
    # Status flags
    is_read = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    
    def mark_as_read(self):
        """Mark notification as read"""
        self.is_read = True
        self.read_at = datetime.utcnow()
    
    def mark_as_delivered(self, channel: str):
        """Mark notification as delivered through a channel"""
        if channel not in self.delivered_channels:
            self.delivered_channels.append(channel)
        
        if not self.delivered_at:
            self.delivered_at = datetime.utcnow()
    
    def mark_delivery_failed(self, channel: str):
        """Mark delivery failed for a channel"""
        if channel not in self.failed_channels:
            self.failed_channels.append(channel)