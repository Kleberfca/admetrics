"""
Reports schemas for request/response validation
"""

from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum


class ReportType(str, Enum):
    """Report types"""
    PERFORMANCE = "performance"
    EXECUTIVE = "executive"
    COMPARISON = "comparison"
    COMPREHENSIVE = "comprehensive"
    AI_INSIGHTS = "ai_insights"
    CUSTOM = "custom"


class ReportFormat(str, Enum):
    """Report output formats"""
    PDF = "pdf"
    EXCEL = "excel"
    CSV = "csv"
    JSON = "json"


class ReportFrequency(str, Enum):
    """Report schedule frequency"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class ReportRequest(BaseModel):
    """Report generation request"""
    report_type: ReportType = Field(..., description="Type of report to generate")
    campaign_ids: List[str] = Field(..., min_items=1, description="Campaign IDs to include")
    start_date: datetime = Field(..., description="Report start date")
    end_date: datetime = Field(..., description="Report end date")
    metrics: List[str] = Field(..., min_items=1, description="Metrics to include")
    dimensions: List[str] = Field(default=["date", "campaign"], description="Dimensions for grouping")
    filters: Optional[Dict[str, Any]] = Field(None, description="Additional filters")
    format: ReportFormat = Field(ReportFormat.PDF, description="Output format")
    include_charts: bool = Field(True, description="Include visualizations")
    include_insights: bool = Field(True, description="Include AI insights")
    
    @validator('end_date')
    def validate_date_range(cls, v, values):
        if 'start_date' in values and v <= values['start_date']:
            raise ValueError('end_date must be after start_date')
        return v
    
    class Config:
        schema_extra = {
            "example": {
                "report_type": "performance",
                "campaign_ids": ["camp_123", "camp_456"],
                "start_date": "2024-01-01T00:00:00Z",
                "end_date": "2024-01-31T23:59:59Z",
                "metrics": ["impressions", "clicks", "conversions", "spend", "roas"],
                "dimensions": ["date", "campaign", "platform"],
                "filters": {"status": "ACTIVE"},
                "format": "pdf",
                "include_charts": True,
                "include_insights": True
            }
        }


class ReportResponse(BaseModel):
    """Report generation response"""
    report_id: str = Field(..., description="Unique report ID")
    status: str = Field(..., description="Report generation status")
    download_url: Optional[str] = Field(None, description="URL to download report")
    generated_at: datetime = Field(..., description="Report generation timestamp")
    expires_at: datetime = Field(..., description="Report expiration timestamp")
    
    class Config:
        schema_extra = {
            "example": {
                "report_id": "rpt_abc123",
                "status": "completed",
                "download_url": "https://reports.admetrics.com/download/rpt_abc123",
                "generated_at": "2024-01-31T10:30:00Z",
                "expires_at": "2024-02-07T10:30:00Z"
            }
        }


class ReportTemplate(BaseModel):
    """Report template"""
    template_id: Optional[str] = Field(None, description="Template ID")
    name: str = Field(..., min_length=1, max_length=100, description="Template name")
    description: Optional[str] = Field(None, max_length=500, description="Template description")
    report_type: ReportType = Field(..., description="Report type")
    metrics: List[str] = Field(..., min_items=1, description="Default metrics")
    dimensions: List[str] = Field(..., min_items=1, description="Default dimensions")
    filters: Dict[str, Any] = Field(default={}, description="Default filters")
    schedule: Optional[Dict[str, Any]] = Field(None, description="Schedule configuration")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    
    class Config:
        schema_extra = {
            "example": {
                "name": "Weekly Performance Report",
                "description": "Comprehensive weekly campaign performance analysis",
                "report_type": "performance",
                "metrics": ["impressions", "clicks", "conversions", "spend", "roas"],
                "dimensions": ["campaign", "platform", "date"],
                "filters": {"status": "ACTIVE"},
                "schedule": {
                    "frequency": "weekly",
                    "day_of_week": "monday",
                    "time": "09:00"
                }
            }
        }


class ScheduledReport(BaseModel):
    """Scheduled report configuration"""
    schedule_id: Optional[str] = Field(None, description="Schedule ID")
    template_id: str = Field(..., description="Report template ID")
    frequency: ReportFrequency = Field(..., description="Report frequency")
    recipients: List[str] = Field(..., min_items=1, description="Email recipients")
    format: ReportFormat = Field(ReportFormat.PDF, description="Report format")
    timezone: str = Field("UTC", description="Timezone for scheduling")
    next_run: Optional[datetime] = Field(None, description="Next scheduled run")
    last_run: Optional[datetime] = Field(None, description="Last run timestamp")
    status: Optional[str] = Field("active", description="Schedule status")
    
    class Config:
        schema_extra = {
            "example": {
                "template_id": "tmpl_123",
                "frequency": "weekly",
                "recipients": ["manager@company.com", "team@company.com"],
                "format": "pdf",
                "timezone": "America/New_York",
                "status": "active"
            }
        }


class ReportHistoryItem(BaseModel):
    """Report history item"""
    report_id: str
    report_type: ReportType
    format: ReportFormat
    generated_at: datetime
    expires_at: datetime
    size_bytes: int
    filename: str
    parameters: Dict[str, Any]
    
    class Config:
        schema_extra = {
            "example": {
                "report_id": "rpt_abc123",
                "report_type": "performance",
                "format": "pdf",
                "generated_at": "2024-01-31T10:30:00Z",
                "expires_at": "2024-02-07T10:30:00Z",
                "size_bytes": 1048576,
                "filename": "performance_report_20240131.pdf",
                "parameters": {
                    "campaign_count": 5,
                    "date_range": "2024-01-01 to 2024-01-31"
                }
            }
        }


class DashboardExportRequest(BaseModel):
    """Dashboard export request"""
    dashboard_id: str = Field(..., description="Dashboard ID to export")
    format: str = Field("pdf", regex="^(pdf|png|csv)$", description="Export format")
    include_filters: bool = Field(True, description="Include current filter state")
    
    class Config:
        schema_extra = {
            "example": {
                "dashboard_id": "dash_123",
                "format": "pdf",
                "include_filters": True
            }
        }


class EmailReportRequest(BaseModel):
    """Email report request"""
    report_id: str = Field(..., description="Report ID to email")
    recipients: List[str] = Field(..., min_items=1, description="Email recipients")
    subject: Optional[str] = Field(None, description="Email subject")
    message: Optional[str] = Field(None, description="Email message")
    
    @validator('recipients')
    def validate_emails(cls, v):
        import re
        email_pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
        for email in v:
            if not re.match(email_pattern, email):
                raise ValueError(f'Invalid email address: {email}')
        return v
    
    class Config:
        schema_extra = {
            "example": {
                "report_id": "rpt_abc123",
                "recipients": ["client@company.com", "manager@company.com"],
                "subject": "Monthly Campaign Performance Report",
                "message": "Please find attached the monthly performance report for your campaigns."
            }
        }