"""
Report Service for generating and managing reports
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
import logging
from datetime import datetime, timedelta
import pandas as pd
import io
import json
from app.core.config import settings
from app.services.data_service import data_service
from app.utils.report_generator import ReportGenerator
from app.utils.s3_client import s3_client
import uuid

logger = logging.getLogger(__name__)


class ReportService:
    """Service for report generation and management"""
    
    def __init__(self):
        self.report_generator = ReportGenerator()
        self.report_storage_bucket = settings.REPORT_STORAGE_BUCKET
        
    async def generate_report(self,
                            user_id: str,
                            report_type: str,
                            campaign_ids: List[str],
                            start_date: datetime,
                            end_date: datetime,
                            metrics: List[str],
                            dimensions: List[str],
                            filters: Optional[Dict[str, Any]] = None,
                            format: str = "pdf") -> Dict[str, Any]:
        """Generate a report"""
        try:
            report_id = str(uuid.uuid4())
            
            # Fetch data
            campaign_data = await self._fetch_campaign_data(
                campaign_ids, start_date, end_date
            )
            
            metrics_data = await self._fetch_metrics_data(
                campaign_ids, start_date, end_date, metrics, dimensions, filters
            )
            
            # Get AI insights if requested
            insights = {}
            if report_type in ["comprehensive", "ai_insights"]:
                insights = await self._get_ai_insights(campaign_data, metrics_data)
            
            # Generate report
            if format == "pdf":
                content = self.report_generator.generate_campaign_report(
                    campaign_data, metrics_data, insights, format="pdf"
                )
                content_type = "application/pdf"
                filename = f"report_{report_id}.pdf"
                
            elif format == "excel":
                content = self.report_generator.generate_campaign_report(
                    campaign_data, metrics_data, insights, format="excel"
                )
                content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                filename = f"report_{report_id}.xlsx"
                
            elif format == "csv":
                content = self._generate_csv_report(metrics_data)
                content_type = "text/csv"
                filename = f"report_{report_id}.csv"
                
            else:
                content = self.report_generator.generate_campaign_report(
                    campaign_data, metrics_data, insights, format="json"
                )
                content_type = "application/json"
                filename = f"report_{report_id}.json"
            
            # Store report
            download_url = await self._store_report(
                report_id, content, filename, content_type
            )
            
            # Save metadata
            await self._save_report_metadata(
                report_id=report_id,
                user_id=user_id,
                report_type=report_type,
                filename=filename,
                format=format,
                download_url=download_url,
                size_bytes=len(content) if isinstance(content, bytes) else len(content.encode()),
                parameters={
                    "campaign_ids": campaign_ids,
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "metrics": metrics,
                    "dimensions": dimensions,
                    "filters": filters
                }
            )
            
            return {
                "report_id": report_id,
                "download_url": download_url,
                "filename": filename,
                "format": format,
                "size_bytes": len(content) if isinstance(content, bytes) else len(content.encode())
            }
            
        except Exception as e:
            logger.error(f"Error generating report: {e}")
            raise
    
    async def get_report_metadata(self, report_id: str) -> Optional[Dict[str, Any]]:
        """Get report metadata"""
        # Mock implementation - replace with database query
        return {
            "report_id": report_id,
            "user_id": "user_123",
            "filename": f"report_{report_id}.pdf",
            "format": "pdf",
            "generated_at": datetime.now() - timedelta(hours=1),
            "expires_at": datetime.now() + timedelta(hours=23),
            "size_bytes": 1024000,
            "download_url": f"https://reports.admetrics.com/{report_id}"
        }
    
    async def get_report_content(self, report_id: str) -> Tuple[bytes, str, str]:
        """Get report content"""
        # Get metadata
        metadata = await self.get_report_metadata(report_id)
        if not metadata:
            raise ValueError("Report not found")
        
        # Download from storage
        content = await s3_client.download_file(
            self.report_storage_bucket,
            f"reports/{report_id}/{metadata['filename']}"
        )
        
        content_type = self._get_content_type(metadata['format'])
        
        return content, content_type, metadata['filename']
    
    async def get_templates(self, user_id: str) -> List[Dict[str, Any]]:
        """Get report templates"""
        # Mock implementation - replace with database query
        return [
            {
                "template_id": "tmpl_1",
                "name": "Weekly Performance Report",
                "description": "Comprehensive weekly campaign performance analysis",
                "report_type": "performance",
                "metrics": ["impressions", "clicks", "conversions", "spend", "roas"],
                "dimensions": ["campaign", "platform", "date"],
                "filters": {},
                "created_at": datetime.now() - timedelta(days=30)
            },
            {
                "template_id": "tmpl_2",
                "name": "Monthly Executive Summary",
                "description": "High-level monthly overview for executives",
                "report_type": "executive",
                "metrics": ["spend", "revenue", "roas", "conversions"],
                "dimensions": ["platform", "month"],
                "filters": {"status": "ACTIVE"},
                "created_at": datetime.now() - timedelta(days=60)
            },
            {
                "template_id": "tmpl_3",
                "name": "Campaign Comparison",
                "description": "Side-by-side campaign performance comparison",
                "report_type": "comparison",
                "metrics": ["ctr", "cvr", "cpc", "cpa", "roas"],
                "dimensions": ["campaign"],
                "filters": {},
                "created_at": datetime.now() - timedelta(days=15)
            }
        ]
    
    async def create_template(self,
                            user_id: str,
                            name: str,
                            description: str,
                            report_type: str,
                            metrics: List[str],
                            dimensions: List[str],
                            filters: Dict[str, Any],
                            schedule: Optional[Dict[str, Any]] = None) -> str:
        """Create a report template"""
        template_id = f"tmpl_{uuid.uuid4().hex[:8]}"
        
        # Save template to database
        # Mock implementation
        
        return template_id
    
    async def schedule_report(self,
                            user_id: str,
                            template_id: str,
                            frequency: str,
                            recipients: List[str],
                            format: str,
                            timezone: str) -> str:
        """Schedule a recurring report"""
        schedule_id = f"sched_{uuid.uuid4().hex[:8]}"
        
        # Save schedule to database
        # Mock implementation
        
        # Schedule task
        await self._schedule_task(schedule_id, frequency, timezone)
        
        return schedule_id
    
    async def get_scheduled_reports(self, user_id: str) -> List[Dict[str, Any]]:
        """Get user's scheduled reports"""
        # Mock implementation
        return [
            {
                "schedule_id": "sched_123",
                "template_id": "tmpl_1",
                "template_name": "Weekly Performance Report",
                "frequency": "weekly",
                "recipients": ["user@example.com", "manager@example.com"],
                "format": "pdf",
                "timezone": "America/New_York",
                "next_run": datetime.now() + timedelta(days=3),
                "last_run": datetime.now() - timedelta(days=4),
                "status": "active"
            }
        ]
    
    async def get_schedule(self, schedule_id: str) -> Optional[Dict[str, Any]]:
        """Get schedule details"""
        # Mock implementation
        return {
            "schedule_id": schedule_id,
            "user_id": "user_123",
            "template_id": "tmpl_1",
            "frequency": "weekly",
            "status": "active"
        }
    
    async def cancel_schedule(self, schedule_id: str):
        """Cancel a scheduled report"""
        # Update database
        # Cancel scheduled task
        pass
    
    async def get_next_run_time(self, schedule_id: str) -> datetime:
        """Get next run time for scheduled report"""
        # Calculate based on frequency and timezone
        return datetime.now() + timedelta(days=7)
    
    async def get_report_history(self,
                               user_id: str,
                               limit: int,
                               offset: int) -> Dict[str, Any]:
        """Get user's report generation history"""
        # Mock implementation
        reports = []
        for i in range(limit):
            reports.append({
                "report_id": f"report_{i + offset}",
                "report_type": "performance",
                "format": "pdf",
                "generated_at": datetime.now() - timedelta(hours=i * 24),
                "expires_at": datetime.now() + timedelta(hours=(24 - i * 24)),
                "size_bytes": 1024000 + i * 10000,
                "filename": f"report_{i + offset}.pdf",
                "parameters": {
                    "start_date": (datetime.now() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.now().isoformat(),
                    "campaign_count": 5
                }
            })
        
        return {
            "reports": reports,
            "total": 50
        }
    
    async def export_dashboard(self,
                             dashboard_id: str,
                             user_id: str,
                             format: str) -> Dict[str, Any]:
        """Export dashboard as report"""
        # Get dashboard data
        dashboard_data = await self._get_dashboard_data(dashboard_id)
        
        if format == "pdf":
            # Generate PDF with dashboard screenshots
            content = await self._generate_dashboard_pdf(dashboard_data)
            content_type = "application/pdf"
            filename = f"dashboard_{dashboard_id}_{datetime.now().strftime('%Y%m%d')}.pdf"
            
        elif format == "png":
            # Generate dashboard image
            content = await self._generate_dashboard_image(dashboard_data)
            content_type = "image/png"
            filename = f"dashboard_{dashboard_id}_{datetime.now().strftime('%Y%m%d')}.png"
            
        else:  # csv
            # Export dashboard data as CSV
            content = self._generate_dashboard_csv(dashboard_data)
            content_type = "text/csv"
            filename = f"dashboard_{dashboard_id}_{datetime.now().strftime('%Y%m%d')}.csv"
        
        return {
            "content": content,
            "content_type": content_type,
            "filename": filename
        }
    
    async def email_report(self,
                         report_id: str,
                         recipients: List[str],
                         subject: str,
                         message: Optional[str],
                         sender_name: str):
        """Email a report to recipients"""
        # Get report content
        content, content_type, filename = await self.get_report_content(report_id)
        
        # Send email with attachment
        from app.services.notification_service import notification_service
        
        for recipient in recipients:
            await notification_service._send_email_notification(
                email=recipient,
                title=subject,
                message=message or f"Please find the attached report from {sender_name}.",
                notification_type="REPORT",
                data={
                    "attachment": {
                        "filename": filename,
                        "content": content,
                        "content_type": content_type
                    }
                }
            )
    
    async def _fetch_campaign_data(self,
                                 campaign_ids: List[str],
                                 start_date: datetime,
                                 end_date: datetime) -> pd.DataFrame:
        """Fetch campaign data"""
        # Mock implementation - replace with actual data fetching
        data = []
        for campaign_id in campaign_ids:
            data.append({
                "campaign_id": campaign_id,
                "campaign_name": f"Campaign {campaign_id[-3:]}",
                "platform": "GOOGLE_ADS" if int(campaign_id[-1]) % 2 == 0 else "FACEBOOK_ADS",
                "status": "ACTIVE",
                "budget": 5000 + int(campaign_id[-3:]) * 100,
                "spend": 4500 + int(campaign_id[-3:]) * 80,
                "impressions": 100000 + int(campaign_id[-3:]) * 1000,
                "clicks": 2500 + int(campaign_id[-3:]) * 50,
                "conversions": 150 + int(campaign_id[-3:]) * 5,
                "revenue": 15000 + int(campaign_id[-3:]) * 500,
                "ctr": 0.025,
                "cvr": 0.06,
                "roas": 3.33
            })
        
        return pd.DataFrame(data)
    
    async def _fetch_metrics_data(self,
                                campaign_ids: List[str],
                                start_date: datetime,
                                end_date: datetime,
                                metrics: List[str],
                                dimensions: List[str],
                                filters: Optional[Dict[str, Any]]) -> pd.DataFrame:
        """Fetch metrics data"""
        # Mock implementation - replace with actual data fetching
        data = []
        
        current_date = start_date
        while current_date <= end_date:
            for campaign_id in campaign_ids:
                row = {
                    "date": current_date,
                    "campaign_id": campaign_id,
                    "platform": "GOOGLE_ADS" if int(campaign_id[-1]) % 2 == 0 else "FACEBOOK_ADS"
                }
                
                # Add requested metrics
                if "impressions" in metrics:
                    row["impressions"] = 10000 + (current_date.day * 100)
                if "clicks" in metrics:
                    row["clicks"] = 250 + (current_date.day * 10)
                if "conversions" in metrics:
                    row["conversions"] = 15 + current_date.day
                if "spend" in metrics:
                    row["spend"] = 500 + (current_date.day * 20)
                if "revenue" in metrics:
                    row["revenue"] = 1500 + (current_date.day * 50)
                
                # Calculate derived metrics
                if "ctr" in metrics and "clicks" in row and "impressions" in row:
                    row["ctr"] = row["clicks"] / row["impressions"]
                if "cvr" in metrics and "conversions" in row and "clicks" in row:
                    row["cvr"] = row["conversions"] / row["clicks"] if row["clicks"] > 0 else 0
                if "roas" in metrics and "revenue" in row and "spend" in row:
                    row["roas"] = row["revenue"] / row["spend"] if row["spend"] > 0 else 0
                
                data.append(row)
            
            current_date += timedelta(days=1)
        
        df = pd.DataFrame(data)
        
        # Apply filters
        if filters:
            for key, value in filters.items():
                if key in df.columns:
                    df = df[df[key] == value]
        
        return df
    
    async def _get_ai_insights(self,
                             campaign_data: pd.DataFrame,
                             metrics_data: pd.DataFrame) -> Dict[str, Any]:
        """Get AI insights for report"""
        from app.services.ai_service import ai_service
        
        insights = {
            "recommendations": [],
            "anomalies": [],
            "forecasts": {}
        }
        
        # Get recommendations
        async with ai_service as ai:
            # Analyze performance trends
            if not metrics_data.empty:
                # Detect anomalies
                anomalies = await ai.detect_anomalies(
                    metrics_data.to_dict('records')
                )
                if "anomalies" in anomalies:
                    insights["anomalies"] = anomalies["anomalies"].get("critical", [])
            
            # Get optimization recommendations
            if not campaign_data.empty:
                for _, campaign in campaign_data.iterrows():
                    recommendations = await ai.get_optimization_recommendations(
                        campaign["campaign_id"]
                    )
                    if "recommendations" in recommendations:
                        insights["recommendations"].extend(
                            recommendations["recommendations"]
                        )
        
        return insights
    
    async def _store_report(self,
                          report_id: str,
                          content: bytes,
                          filename: str,
                          content_type: str) -> str:
        """Store report in S3"""
        # Upload to S3
        key = f"reports/{report_id}/{filename}"
        
        await s3_client.upload_file(
            self.report_storage_bucket,
            key,
            content,
            content_type
        )
        
        # Generate presigned URL
        download_url = await s3_client.generate_presigned_url(
            self.report_storage_bucket,
            key,
            expiration=86400  # 24 hours
        )
        
        return download_url
    
    async def _save_report_metadata(self, **kwargs):
        """Save report metadata to database"""
        # Mock implementation - save to database
        pass
    
    def _generate_csv_report(self, metrics_data: pd.DataFrame) -> bytes:
        """Generate CSV report"""
        buffer = io.StringIO()
        metrics_data.to_csv(buffer, index=False)
        return buffer.getvalue().encode('utf-8')
    
    def _get_content_type(self, format: str) -> str:
        """Get content type for format"""
        content_types = {
            "pdf": "application/pdf",
            "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "csv": "text/csv",
            "json": "application/json"
        }
        return content_types.get(format, "application/octet-stream")
    
    async def _schedule_task(self, schedule_id: str, frequency: str, timezone: str):
        """Schedule recurring task"""
        # This would integrate with your task scheduler (Celery, etc.)
        pass
    
    async def _get_dashboard_data(self, dashboard_id: str) -> Dict[str, Any]:
        """Get dashboard data"""
        # Mock implementation
        return {
            "dashboard_id": dashboard_id,
            "title": "Campaign Performance Dashboard",
            "widgets": [],
            "filters": {}
        }
    
    async def _generate_dashboard_pdf(self, dashboard_data: Dict[str, Any]) -> bytes:
        """Generate PDF from dashboard"""
        # This would use a headless browser to capture dashboard
        # For now, return mock PDF
        return b"Mock PDF content"
    
    async def _generate_dashboard_image(self, dashboard_data: Dict[str, Any]) -> bytes:
        """Generate image from dashboard"""
        # This would use a headless browser to capture dashboard
        # For now, return mock image
        return b"Mock PNG content"
    
    def _generate_dashboard_csv(self, dashboard_data: Dict[str, Any]) -> bytes:
        """Generate CSV from dashboard data"""
        # Extract data from dashboard widgets
        # For now, return mock CSV
        return b"date,metric,value\n2024-01-01,impressions,10000\n"


# Singleton instance
report_service = ReportService()