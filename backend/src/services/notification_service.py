"""
Notification Service for alerts and notifications
"""

import asyncio
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import aiosmtplib
import aiohttp
from app.core.config import settings
from app.models.notification import NotificationType, NotificationPriority

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for handling notifications"""
    
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.sender_email = settings.SENDER_EMAIL
        self.webhook_urls = settings.WEBHOOK_URLS
        
    async def send_notification(self,
                              user_id: str,
                              notification_type: NotificationType,
                              title: str,
                              message: str,
                              priority: NotificationPriority = NotificationPriority.MEDIUM,
                              data: Optional[Dict[str, Any]] = None) -> bool:
        """Send notification through multiple channels"""
        try:
            # Store notification in database
            notification_id = await self._store_notification(
                user_id, notification_type, title, message, priority, data
            )
            
            # Get user preferences
            user_prefs = await self._get_user_preferences(user_id)
            
            # Send through enabled channels
            tasks = []
            
            if user_prefs.get("email_enabled", True):
                tasks.append(self._send_email_notification(
                    user_prefs["email"], title, message, notification_type, data
                ))
            
            if user_prefs.get("webhook_enabled", False):
                tasks.append(self._send_webhook_notification(
                    user_id, notification_type, title, message, data
                ))
            
            if user_prefs.get("in_app_enabled", True):
                tasks.append(self._send_in_app_notification(
                    user_id, notification_id, title, message, priority
                ))
            
            # Execute all notification tasks
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Check if at least one channel succeeded
            success = any(not isinstance(r, Exception) and r for r in results)
            
            return success
            
        except Exception as e:
            logger.error(f"Error sending notification: {e}")
            return False
    
    async def send_alert(self,
                        alert_type: str,
                        severity: str,
                        title: str,
                        description: str,
                        affected_campaigns: List[str],
                        metrics: Dict[str, Any]) -> bool:
        """Send alert for critical events"""
        try:
            # Determine recipients based on alert type and severity
            recipients = await self._get_alert_recipients(alert_type, severity)
            
            # Create alert message
            alert_data = {
                "alert_type": alert_type,
                "severity": severity,
                "title": title,
                "description": description,
                "affected_campaigns": affected_campaigns,
                "metrics": metrics,
                "timestamp": datetime.now().isoformat()
            }
            
            # Send to all recipients
            tasks = []
            for recipient in recipients:
                tasks.append(self.send_notification(
                    user_id=recipient["user_id"],
                    notification_type=NotificationType.ALERT,
                    title=f"[{severity.upper()}] {title}",
                    message=description,
                    priority=self._get_priority_from_severity(severity),
                    data=alert_data
                ))
            
            results = await asyncio.gather(*tasks)
            
            return all(results)
            
        except Exception as e:
            logger.error(f"Error sending alert: {e}")
            return False
    
    async def _send_email_notification(self,
                                     email: str,
                                     title: str,
                                     message: str,
                                     notification_type: NotificationType,
                                     data: Optional[Dict[str, Any]] = None) -> bool:
        """Send email notification"""
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = title
            msg['From'] = self.sender_email
            msg['To'] = email
            
            # Create HTML content
            html_content = self._create_email_html(title, message, notification_type, data)
            
            # Create plain text content
            text_content = f"{title}\n\n{message}"
            
            # Attach parts
            msg.attach(MIMEText(text_content, 'plain'))
            msg.attach(MIMEText(html_content, 'html'))
            
            # Send email
            async with aiosmtplib.SMTP(
                hostname=self.smtp_host,
                port=self.smtp_port,
                use_tls=True
            ) as smtp:
                await smtp.login(self.smtp_username, self.smtp_password)
                await smtp.send_message(msg)
            
            logger.info(f"Email notification sent to {email}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending email notification: {e}")
            return False
    
    async def _send_webhook_notification(self,
                                       user_id: str,
                                       notification_type: NotificationType,
                                       title: str,
                                       message: str,
                                       data: Optional[Dict[str, Any]] = None) -> bool:
        """Send webhook notification"""
        try:
            webhook_url = self.webhook_urls.get(user_id)
            if not webhook_url:
                return False
            
            payload = {
                "user_id": user_id,
                "notification_type": notification_type.value,
                "title": title,
                "message": message,
                "data": data,
                "timestamp": datetime.now().isoformat()
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        logger.info(f"Webhook notification sent for user {user_id}")
                        return True
                    else:
                        logger.error(f"Webhook failed with status {response.status}")
                        return False
                        
        except Exception as e:
            logger.error(f"Error sending webhook notification: {e}")
            return False
    
    async def _send_in_app_notification(self,
                                      user_id: str,
                                      notification_id: str,
                                      title: str,
                                      message: str,
                                      priority: NotificationPriority) -> bool:
        """Send in-app notification via WebSocket"""
        try:
            # This would integrate with your WebSocket service
            # For now, we'll just log it
            logger.info(f"In-app notification queued for user {user_id}: {title}")
            
            # In real implementation, you would:
            # 1. Check if user has active WebSocket connection
            # 2. Send notification through WebSocket
            # 3. Queue for later delivery if user is offline
            
            return True
            
        except Exception as e:
            logger.error(f"Error sending in-app notification: {e}")
            return False
    
    async def _store_notification(self,
                                user_id: str,
                                notification_type: NotificationType,
                                title: str,
                                message: str,
                                priority: NotificationPriority,
                                data: Optional[Dict[str, Any]] = None) -> str:
        """Store notification in database"""
        # Mock implementation - replace with actual database storage
        notification_id = f"notif_{datetime.now().timestamp()}"
        
        # In real implementation:
        # 1. Insert into notifications table
        # 2. Return generated notification ID
        
        return notification_id
    
    async def _get_user_preferences(self, user_id: str) -> Dict[str, Any]:
        """Get user notification preferences"""
        # Mock implementation - replace with actual database query
        return {
            "email": f"user_{user_id}@example.com",
            "email_enabled": True,
            "webhook_enabled": False,
            "in_app_enabled": True,
            "alert_severities": ["critical", "high"],
            "quiet_hours": {
                "enabled": False,
                "start": "22:00",
                "end": "08:00"
            }
        }
    
    async def _get_alert_recipients(self, alert_type: str, severity: str) -> List[Dict[str, Any]]:
        """Get recipients for alerts based on type and severity"""
        # Mock implementation - replace with actual logic
        # In real implementation:
        # 1. Query users with appropriate permissions
        # 2. Filter by alert preferences
        # 3. Consider team/organization structure
        
        return [
            {"user_id": "admin_1", "role": "admin"},
            {"user_id": "manager_1", "role": "campaign_manager"}
        ]
    
    def _get_priority_from_severity(self, severity: str) -> NotificationPriority:
        """Convert severity to notification priority"""
        severity_map = {
            "critical": NotificationPriority.CRITICAL,
            "high": NotificationPriority.HIGH,
            "medium": NotificationPriority.MEDIUM,
            "low": NotificationPriority.LOW
        }
        return severity_map.get(severity.lower(), NotificationPriority.MEDIUM)
    
    def _create_email_html(self,
                         title: str,
                         message: str,
                         notification_type: NotificationType,
                         data: Optional[Dict[str, Any]] = None) -> str:
        """Create HTML content for email"""
        # Define colors based on notification type
        type_colors = {
            NotificationType.ALERT: "#ea4335",
            NotificationType.WARNING: "#fbbc04",
            NotificationType.INFO: "#1a73e8",
            NotificationType.SUCCESS: "#34a853"
        }
        
        color = type_colors.get(notification_type, "#1a73e8")
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: {color};
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }}
                .content {{
                    background-color: #f9f9f9;
                    padding: 20px;
                    border-radius: 0 0 5px 5px;
                }}
                .button {{
                    display: inline-block;
                    background-color: {color};
                    color: white;
                    padding: 10px 20px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin-top: 15px;
                }}
                .metrics {{
                    background-color: white;
                    padding: 15px;
                    border-radius: 5px;
                    margin-top: 15px;
                }}
                .metric-item {{
                    display: flex;
                    justify-content: space-between;
                    padding: 5px 0;
                    border-bottom: 1px solid #eee;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>{title}</h2>
                </div>
                <div class="content">
                    <p>{message}</p>
        """
        
        # Add metrics if available
        if data and "metrics" in data:
            html += '<div class="metrics"><h3>Metrics</h3>'
            for key, value in data["metrics"].items():
                html += f'<div class="metric-item"><span>{key}:</span><strong>{value}</strong></div>'
            html += '</div>'
        
        # Add action button
        html += f"""
                    <a href="{settings.FRONTEND_URL}/dashboard" class="button">View Dashboard</a>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html
    
    async def check_and_send_scheduled_alerts(self):
        """Check for conditions that require alerts"""
        try:
            # This would be called periodically by a scheduler
            
            # Check for budget alerts
            await self._check_budget_alerts()
            
            # Check for performance alerts
            await self._check_performance_alerts()
            
            # Check for anomaly alerts
            await self._check_anomaly_alerts()
            
        except Exception as e:
            logger.error(f"Error checking scheduled alerts: {e}")
    
    async def _check_budget_alerts(self):
        """Check for campaigns exceeding budget thresholds"""
        # Mock implementation
        # In real implementation:
        # 1. Query campaigns with budget alerts enabled
        # 2. Check current spend vs budget
        # 3. Send alerts for campaigns exceeding threshold
        pass
    
    async def _check_performance_alerts(self):
        """Check for performance degradation"""
        # Mock implementation
        # In real implementation:
        # 1. Query campaigns with performance alerts enabled
        # 2. Compare current metrics with historical baseline
        # 3. Send alerts for significant degradation
        pass
    
    async def _check_anomaly_alerts(self):
        """Check for metric anomalies"""
        # Mock implementation
        # In real implementation:
        # 1. Get recent metrics for all active campaigns
        # 2. Run anomaly detection
        # 3. Send alerts for detected anomalies
        pass


# Singleton instance
notification_service = NotificationService()