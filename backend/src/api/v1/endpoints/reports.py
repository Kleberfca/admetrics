"""
Reports API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from app.models.user import User
from app.api.deps import get_current_user
from app.services.report_service import report_service
from app.schemas.reports import (
    ReportRequest,
    ReportResponse,
    ReportTemplate,
    ScheduledReport
)
import logging
import io

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/generate", response_model=ReportResponse)
async def generate_report(
    request: ReportRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate a custom report
    """
    try:
        # Validate date range
        if request.end_date <= request.start_date:
            raise HTTPException(
                status_code=400,
                detail="End date must be after start date"
            )
        
        # Check user permissions for campaigns
        for campaign_id in request.campaign_ids:
            if not await _user_has_campaign_access(current_user.id, campaign_id):
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied to campaign {campaign_id}"
                )
        
        # Generate report
        report = await report_service.generate_report(
            user_id=current_user.id,
            report_type=request.report_type,
            campaign_ids=request.campaign_ids,
            start_date=request.start_date,
            end_date=request.end_date,
            metrics=request.metrics,
            dimensions=request.dimensions,
            filters=request.filters,
            format=request.format
        )
        
        return ReportResponse(
            report_id=report["report_id"],
            status="completed",
            download_url=report["download_url"],
            generated_at=datetime.now(),
            expires_at=datetime.now() + timedelta(hours=24)
        )
        
    except Exception as e:
        logger.error(f"Error generating report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{report_id}")
async def download_report(
    report_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Download a generated report
    """
    try:
        # Get report metadata
        report_meta = await report_service.get_report_metadata(report_id)
        
        if not report_meta:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Check permissions
        if report_meta["user_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Check if report is expired
        if datetime.now() > report_meta["expires_at"]:
            raise HTTPException(status_code=410, detail="Report has expired")
        
        # Get report content
        content, content_type, filename = await report_service.get_report_content(report_id)
        
        # Return file response
        return StreamingResponse(
            io.BytesIO(content),
            media_type=content_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates", response_model=List[ReportTemplate])
async def get_report_templates(
    current_user: User = Depends(get_current_user)
):
    """
    Get available report templates
    """
    try:
        templates = await report_service.get_templates(current_user.id)
        return templates
        
    except Exception as e:
        logger.error(f"Error getting report templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/templates")
async def create_report_template(
    template: ReportTemplate,
    current_user: User = Depends(get_current_user)
):
    """
    Create a custom report template
    """
    try:
        template_id = await report_service.create_template(
            user_id=current_user.id,
            name=template.name,
            description=template.description,
            report_type=template.report_type,
            metrics=template.metrics,
            dimensions=template.dimensions,
            filters=template.filters,
            schedule=template.schedule
        )
        
        return {"template_id": template_id, "message": "Template created successfully"}
        
    except Exception as e:
        logger.error(f"Error creating report template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule")
async def schedule_report(
    scheduled_report: ScheduledReport,
    current_user: User = Depends(get_current_user)
):
    """
    Schedule a recurring report
    """
    try:
        schedule_id = await report_service.schedule_report(
            user_id=current_user.id,
            template_id=scheduled_report.template_id,
            frequency=scheduled_report.frequency,
            recipients=scheduled_report.recipients,
            format=scheduled_report.format,
            timezone=scheduled_report.timezone
        )
        
        return {
            "schedule_id": schedule_id,
            "message": "Report scheduled successfully",
            "next_run": await report_service.get_next_run_time(schedule_id)
        }
        
    except Exception as e:
        logger.error(f"Error scheduling report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scheduled", response_model=List[ScheduledReport])
async def get_scheduled_reports(
    current_user: User = Depends(get_current_user)
):
    """
    Get user's scheduled reports
    """
    try:
        scheduled_reports = await report_service.get_scheduled_reports(current_user.id)
        return scheduled_reports
        
    except Exception as e:
        logger.error(f"Error getting scheduled reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/scheduled/{schedule_id}")
async def cancel_scheduled_report(
    schedule_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Cancel a scheduled report
    """
    try:
        # Verify ownership
        schedule = await report_service.get_schedule(schedule_id)
        if not schedule or schedule["user_id"] != current_user.id:
            raise HTTPException(status_code=404, detail="Schedule not found")
        
        await report_service.cancel_schedule(schedule_id)
        
        return {"message": "Scheduled report cancelled successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling scheduled report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_report_history(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user)
):
    """
    Get user's report generation history
    """
    try:
        history = await report_service.get_report_history(
            user_id=current_user.id,
            limit=limit,
            offset=offset
        )
        
        return {
            "reports": history["reports"],
            "total": history["total"],
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error getting report history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export/dashboard")
async def export_dashboard(
    dashboard_id: str,
    format: str = Query("pdf", regex="^(pdf|png|csv)$"),
    current_user: User = Depends(get_current_user)
):
    """
    Export dashboard as report
    """
    try:
        # Verify dashboard access
        if not await _user_has_dashboard_access(current_user.id, dashboard_id):
            raise HTTPException(status_code=403, detail="Access denied to dashboard")
        
        # Generate dashboard export
        export = await report_service.export_dashboard(
            dashboard_id=dashboard_id,
            user_id=current_user.id,
            format=format
        )
        
        # Return file
        return StreamingResponse(
            io.BytesIO(export["content"]),
            media_type=export["content_type"],
            headers={
                "Content-Disposition": f"attachment; filename={export['filename']}"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/email")
async def email_report(
    report_id: str,
    recipients: List[str],
    subject: Optional[str] = None,
    message: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Email a generated report
    """
    try:
        # Verify report ownership
        report_meta = await report_service.get_report_metadata(report_id)
        if not report_meta or report_meta["user_id"] != current_user.id:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Send email
        await report_service.email_report(
            report_id=report_id,
            recipients=recipients,
            subject=subject or f"Report from {current_user.name}",
            message=message,
            sender_name=current_user.name
        )
        
        return {"message": "Report sent successfully", "recipients": recipients}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error emailing report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Helper functions
async def _user_has_campaign_access(user_id: str, campaign_id: str) -> bool:
    """Check if user has access to campaign"""
    # Mock implementation - replace with actual access control
    return True


async def _user_has_dashboard_access(user_id: str, dashboard_id: str) -> bool:
    """Check if user has access to dashboard"""
    # Mock implementation - replace with actual access control
    return True