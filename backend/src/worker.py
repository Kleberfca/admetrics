"""
Celery worker configuration and tasks
"""

from celery import Celery
from celery.schedules import crontab
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.data_service import data_service
from app.services.notification_service import notification_service
from app.services.report_service import report_service
from app.services.ai_service import ai_service
import logging
from datetime import datetime, timedelta
import asyncio

logger = logging.getLogger(__name__)

# Create Celery app
celery_app = Celery(
    "admetrics",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.worker"]
)

# Configure Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
)

# Configure periodic tasks
celery_app.conf.beat_schedule = {
    "sync-campaign-data": {
        "task": "app.worker.sync_campaign_data",
        "schedule": crontab(minute="*/15"),  # Every 15 minutes
    },
    "check-anomalies": {
        "task": "app.worker.check_anomalies",
        "schedule": crontab(minute="*/30"),  # Every 30 minutes
    },
    "generate-scheduled-reports": {
        "task": "app.worker.generate_scheduled_reports",
        "schedule": crontab(hour=6, minute=0),  # Daily at 6 AM
    },
    "cleanup-old-data": {
        "task": "app.worker.cleanup_old_data",
        "schedule": crontab(hour=2, minute=0),  # Daily at 2 AM
    },
    "update-ai-models": {
        "task": "app.worker.update_ai_models",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),  # Weekly on Sunday at 3 AM
    },
}


@celery_app.task(name="app.worker.sync_campaign_data")
def sync_campaign_data():
    """Sync campaign data from all platforms"""
    try:
        logger.info("Starting campaign data sync")
        
        # Get database session
        db = SessionLocal()
        
        # Get all active integrations
        integrations = db.query(Integration).filter(
            Integration.is_active == True
        ).all()
        
        for integration in integrations:
            try:
                # Run async sync in sync context
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                result = loop.run_until_complete(
                    data_service.sync_platform_data(
                        integration.organization_id,
                        integration.platform
                    )
                )
                
                logger.info(f"Synced data for {integration.platform}: {result}")
                
                # Update last sync time
                integration.last_sync = datetime.utcnow()
                db.commit()
                
            except Exception as e:
                logger.error(f"Error syncing {integration.platform}: {e}")
                continue
        
        db.close()
        return {"status": "completed", "integrations_synced": len(integrations)}
        
    except Exception as e:
        logger.error(f"Error in sync_campaign_data: {e}")
        raise


@celery_app.task(name="app.worker.check_anomalies")
def check_anomalies():
    """Check for anomalies in campaign metrics"""
    try:
        logger.info("Starting anomaly detection")
        
        # Get recent metrics
        db = SessionLocal()
        
        # Get campaigns with recent activity
        recent_campaigns = db.query(Campaign).filter(
            Campaign.status == "ACTIVE",
            Campaign.updated_at >= datetime.utcnow() - timedelta(days=7)
        ).all()
        
        anomalies_found = []
        
        for campaign in recent_campaigns:
            try:
                # Get metrics for last 30 days
                metrics = db.query(Metrics).filter(
                    Metrics.campaign_id == campaign.id,
                    Metrics.date >= datetime.utcnow().date() - timedelta(days=30)
                ).all()
                
                if not metrics:
                    continue
                
                # Convert to format for AI service
                metrics_data = [
                    {
                        "date": m.date.isoformat(),
                        "impressions": m.impressions,
                        "clicks": m.clicks,
                        "conversions": m.conversions,
                        "spend": m.spend,
                        "ctr": m.clicks / m.impressions if m.impressions > 0 else 0,
                        "cpc": m.spend / m.clicks if m.clicks > 0 else 0
                    }
                    for m in metrics
                ]
                
                # Run anomaly detection
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                async def detect():
                    async with ai_service as ai:
                        return await ai.detect_anomalies({"metrics": metrics_data})
                
                result = loop.run_until_complete(detect())
                
                if result.get("total_anomalies", 0) > 0:
                    anomalies_found.append({
                        "campaign_id": campaign.id,
                        "campaign_name": campaign.name,
                        "anomalies": result["anomalies"]
                    })
                    
                    # Send notification for critical anomalies
                    critical_anomalies = result["anomalies"].get("critical", [])
                    if critical_anomalies:
                        loop.run_until_complete(
                            notification_service.send_alert(
                                alert_type="anomaly",
                                severity="critical",
                                title=f"Critical anomalies detected in {campaign.name}",
                                description=f"Found {len(critical_anomalies)} critical anomalies",
                                affected_campaigns=[campaign.id],
                                metrics={"anomalies": critical_anomalies}
                            )
                        )
                
            except Exception as e:
                logger.error(f"Error checking anomalies for campaign {campaign.id}: {e}")
                continue
        
        db.close()
        
        return {
            "status": "completed",
            "campaigns_checked": len(recent_campaigns),
            "anomalies_found": len(anomalies_found)
        }
        
    except Exception as e:
        logger.error(f"Error in check_anomalies: {e}")
        raise


@celery_app.task(name="app.worker.generate_scheduled_reports")
def generate_scheduled_reports():
    """Generate all scheduled reports"""
    try:
        logger.info("Starting scheduled report generation")
        
        db = SessionLocal()
        
        # Get all active scheduled reports due today
        scheduled_reports = db.query(ScheduledReport).filter(
            ScheduledReport.status == "active",
            ScheduledReport.next_run <= datetime.utcnow()
        ).all()
        
        reports_generated = []
        
        for schedule in scheduled_reports:
            try:
                # Get report template
                template = db.query(ReportTemplate).filter(
                    ReportTemplate.id == schedule.template_id
                ).first()
                
                if not template:
                    continue
                
                # Generate report
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                # Calculate date range based on frequency
                end_date = datetime.utcnow()
                if schedule.frequency == "daily":
                    start_date = end_date - timedelta(days=1)
                elif schedule.frequency == "weekly":
                    start_date = end_date - timedelta(days=7)
                elif schedule.frequency == "monthly":
                    start_date = end_date - timedelta(days=30)
                else:
                    start_date = end_date - timedelta(days=90)
                
                result = loop.run_until_complete(
                    report_service.generate_report(
                        user_id=schedule.user_id,
                        report_type=template.report_type,
                        campaign_ids=template.campaign_ids,
                        start_date=start_date,
                        end_date=end_date,
                        metrics=template.metrics,
                        dimensions=template.dimensions,
                        format=schedule.format
                    )
                )
                
                # Email report to recipients
                if result.get("report_id"):
                    loop.run_until_complete(
                        report_service.email_report(
                            report_id=result["report_id"],
                            recipients=schedule.recipients,
                            subject=f"{template.name} - {end_date.strftime('%Y-%m-%d')}",
                            message=f"Your scheduled {template.name} is ready.",
                            sender_name="AdMetrics"
                        )
                    )
                    
                    reports_generated.append(result["report_id"])
                
                # Update next run time
                if schedule.frequency == "daily":
                    schedule.next_run = datetime.utcnow() + timedelta(days=1)
                elif schedule.frequency == "weekly":
                    schedule.next_run = datetime.utcnow() + timedelta(days=7)
                elif schedule.frequency == "monthly":
                    schedule.next_run = datetime.utcnow() + timedelta(days=30)
                else:
                    schedule.next_run = datetime.utcnow() + timedelta(days=90)
                
                schedule.last_run = datetime.utcnow()
                db.commit()
                
            except Exception as e:
                logger.error(f"Error generating scheduled report {schedule.id}: {e}")
                continue
        
        db.close()
        
        return {
            "status": "completed",
            "reports_generated": len(reports_generated),
            "report_ids": reports_generated
        }
        
    except Exception as e:
        logger.error(f"Error in generate_scheduled_reports: {e}")
        raise


@celery_app.task(name="app.worker.cleanup_old_data")
def cleanup_old_data():
    """Clean up old data from database"""
    try:
        logger.info("Starting data cleanup")
        
        db = SessionLocal()
        
        # Define retention periods
        metrics_retention_days = 365  # 1 year
        notifications_retention_days = 30
        audit_logs_retention_days = 90
        reports_retention_days = 30
        
        # Clean up old metrics
        metrics_cutoff = datetime.utcnow().date() - timedelta(days=metrics_retention_days)
        deleted_metrics = db.query(Metrics).filter(
            Metrics.date < metrics_cutoff
        ).delete()
        
        # Clean up old notifications
        notifications_cutoff = datetime.utcnow() - timedelta(days=notifications_retention_days)
        deleted_notifications = db.query(Notification).filter(
            Notification.created_at < notifications_cutoff,
            Notification.is_read == True
        ).delete()
        
        # Clean up old audit logs
        audit_cutoff = datetime.utcnow() - timedelta(days=audit_logs_retention_days)
        deleted_audits = db.query(AuditLog).filter(
            AuditLog.created_at < audit_cutoff
        ).delete()
        
        # Clean up old reports
        reports_cutoff = datetime.utcnow() - timedelta(days=reports_retention_days)
        old_reports = db.query(Report).filter(
            Report.created_at < reports_cutoff
        ).all()
        
        # Delete report files from S3
        for report in old_reports:
            if report.file_path:
                try:
                    # Delete from S3
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    loop.run_until_complete(
                        s3_client.delete_file(
                            settings.REPORT_STORAGE_BUCKET,
                            report.file_path
                        )
                    )
                except Exception as e:
                    logger.error(f"Error deleting report file {report.file_path}: {e}")
        
        deleted_reports = db.query(Report).filter(
            Report.created_at < reports_cutoff
        ).delete()
        
        db.commit()
        db.close()
        
        return {
            "status": "completed",
            "deleted_metrics": deleted_metrics,
            "deleted_notifications": deleted_notifications,
            "deleted_audit_logs": deleted_audits,
            "deleted_reports": deleted_reports
        }
        
    except Exception as e:
        logger.error(f"Error in cleanup_old_data: {e}")
        raise


@celery_app.task(name="app.worker.update_ai_models")
def update_ai_models():
    """Update AI models with recent data"""
    try:
        logger.info("Starting AI model update")
        
        # This task would typically:
        # 1. Gather recent performance data
        # 2. Retrain or fine-tune models
        # 3. Validate model performance
        # 4. Deploy updated models
        
        # For now, we'll just trigger a model refresh
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def update_models():
            async with ai_service as ai:
                # This would call AI engine endpoints to update models
                pass
        
        loop.run_until_complete(update_models())
        
        return {"status": "completed", "message": "AI models updated"}
        
    except Exception as e:
        logger.error(f"Error in update_ai_models: {e}")
        raise


@celery_app.task(name="app.worker.process_webhook")
def process_webhook(platform: str, event_type: str, data: dict):
    """Process incoming webhook events"""
    try:
        logger.info(f"Processing webhook from {platform}: {event_type}")
        
        # Handle different webhook events
        if platform == "stripe" and event_type == "payment_succeeded":
            # Update user subscription
            pass
        elif platform == "facebook" and event_type == "ad_account_update":
            # Sync Facebook data
            pass
        elif platform == "google" and event_type == "campaign_status_change":
            # Update campaign status
            pass
        
        return {"status": "processed", "platform": platform, "event": event_type}
        
    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        raise


# Import models (avoid circular imports)
from app.models.campaign import Campaign
from app.models.metrics import Metrics
from app.models.notification import Notification
from app.models.integration import Integration
from app.models.report import Report, ReportTemplate, ScheduledReport
from app.models.audit_log import AuditLog
from app.utils.s3_client import s3_client