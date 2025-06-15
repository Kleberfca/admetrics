"""
Tests for reports endpoints
"""

import pytest
from httpx import AsyncClient
from app.main import app
from app.core.config import settings
from datetime import datetime, timedelta
import io


@pytest.mark.asyncio
async def test_generate_report(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test report generation"""
    data = {
        "report_type": "performance",
        "campaign_ids": ["camp_123", "camp_456"],
        "start_date": (datetime.now() - timedelta(days=30)).isoformat(),
        "end_date": datetime.now().isoformat(),
        "metrics": ["impressions", "clicks", "conversions", "spend", "roas"],
        "dimensions": ["date", "campaign"],
        "format": "pdf"
    }
    
    response = await client.post(
        f"{settings.API_V1_STR}/reports/generate",
        headers=normal_user_token_headers,
        json=data
    )
    
    assert response.status_code == 200
    content = response.json()
    assert "report_id" in content
    assert "download_url" in content
    assert content["status"] == "completed"


@pytest.mark.asyncio
async def test_download_report(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test report download"""
    # First generate a report
    generate_response = await client.post(
        f"{settings.API_V1_STR}/reports/generate",
        headers=normal_user_token_headers,
        json={
            "report_type": "performance",
            "campaign_ids": ["camp_123"],
            "start_date": (datetime.now() - timedelta(days=7)).isoformat(),
            "end_date": datetime.now().isoformat(),
            "metrics": ["impressions", "clicks"],
            "format": "csv"
        }
    )
    
    report_id = generate_response.json()["report_id"]
    
    # Download the report
    response = await client.get(
        f"{settings.API_V1_STR}/reports/download/{report_id}",
        headers=normal_user_token_headers
    )
    
    assert response.status_code == 200
    assert response.headers["content-type"] in ["text/csv", "application/octet-stream"]


@pytest.mark.asyncio
async def test_get_report_templates(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test getting report templates"""
    response = await client.get(
        f"{settings.API_V1_STR}/reports/templates",
        headers=normal_user_token_headers
    )
    
    assert response.status_code == 200
    templates = response.json()
    assert isinstance(templates, list)
    assert len(templates) > 0
    
    # Check template structure
    template = templates[0]
    assert "template_id" in template
    assert "name" in template
    assert "report_type" in template
    assert "metrics" in template


@pytest.mark.asyncio
async def test_create_report_template(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test creating a report template"""
    data = {
        "name": "Test Performance Template",
        "description": "Template for testing",
        "report_type": "performance",
        "metrics": ["impressions", "clicks", "conversions"],
        "dimensions": ["campaign", "date"],
        "filters": {"status": "ACTIVE"}
    }
    
    response = await client.post(
        f"{settings.API_V1_STR}/reports/templates",
        headers=normal_user_token_headers,
        json=data
    )
    
    assert response.status_code == 200
    content = response.json()
    assert "template_id" in content
    assert content["message"] == "Template created successfully"


@pytest.mark.asyncio
async def test_schedule_report(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test scheduling a report"""
    data = {
        "template_id": "tmpl_123",
        "frequency": "weekly",
        "recipients": ["test@example.com"],
        "format": "pdf",
        "timezone": "America/New_York"
    }
    
    response = await client.post(
        f"{settings.API_V1_STR}/reports/schedule",
        headers=normal_user_token_headers,
        json=data
    )
    
    assert response.status_code == 200
    content = response.json()
    assert "schedule_id" in content
    assert "next_run" in content


@pytest.mark.asyncio
async def test_get_scheduled_reports(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test getting scheduled reports"""
    response = await client.get(
        f"{settings.API_V1_STR}/reports/scheduled",
        headers=normal_user_token_headers
    )
    
    assert response.status_code == 200
    scheduled_reports = response.json()
    assert isinstance(scheduled_reports, list)


@pytest.mark.asyncio
async def test_cancel_scheduled_report(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test cancelling a scheduled report"""
    # First create a scheduled report
    schedule_response = await client.post(
        f"{settings.API_V1_STR}/reports/schedule",
        headers=normal_user_token_headers,
        json={
            "template_id": "tmpl_123",
            "frequency": "daily",
            "recipients": ["test@example.com"],
            "format": "pdf"
        }
    )
    
    schedule_id = schedule_response.json()["schedule_id"]
    
    # Cancel the scheduled report
    response = await client.delete(
        f"{settings.API_V1_STR}/reports/scheduled/{schedule_id}",
        headers=normal_user_token_headers
    )
    
    assert response.status_code == 200
    assert response.json()["message"] == "Scheduled report cancelled successfully"


@pytest.mark.asyncio
async def test_get_report_history(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test getting report history"""
    response = await client.get(
        f"{settings.API_V1_STR}/reports/history",
        headers=normal_user_token_headers,
        params={"limit": 10, "offset": 0}
    )
    
    assert response.status_code == 200
    content = response.json()
    assert "reports" in content
    assert "total" in content
    assert isinstance(content["reports"], list)


@pytest.mark.asyncio
async def test_export_dashboard(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test dashboard export"""
    response = await client.post(
        f"{settings.API_V1_STR}/reports/export/dashboard",
        headers=normal_user_token_headers,
        params={
            "dashboard_id": "dash_123",
            "format": "pdf"
        }
    )
    
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
async def test_email_report(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test emailing a report"""
    # First generate a report
    generate_response = await client.post(
        f"{settings.API_V1_STR}/reports/generate",
        headers=normal_user_token_headers,
        json={
            "report_type": "performance",
            "campaign_ids": ["camp_123"],
            "start_date": (datetime.now() - timedelta(days=7)).isoformat(),
            "end_date": datetime.now().isoformat(),
            "metrics": ["impressions", "clicks"],
            "format": "pdf"
        }
    )
    
    report_id = generate_response.json()["report_id"]
    
    # Email the report
    response = await client.post(
        f"{settings.API_V1_STR}/reports/email",
        headers=normal_user_token_headers,
        json={
            "report_id": report_id,
            "recipients": ["client@example.com"],
            "subject": "Your Campaign Report",
            "message": "Please find attached your weekly campaign report."
        }
    )
    
    assert response.status_code == 200
    content = response.json()
    assert content["message"] == "Report sent successfully"
    assert content["recipients"] == ["client@example.com"]


@pytest.mark.asyncio
async def test_invalid_date_range(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test report generation with invalid date range"""
    data = {
        "report_type": "performance",
        "campaign_ids": ["camp_123"],
        "start_date": datetime.now().isoformat(),
        "end_date": (datetime.now() - timedelta(days=7)).isoformat(),  # End before start
        "metrics": ["impressions"],
        "format": "pdf"
    }
    
    response = await client.post(
        f"{settings.API_V1_STR}/reports/generate",
        headers=normal_user_token_headers,
        json=data
    )
    
    assert response.status_code == 400
    assert "End date must be after start date" in response.json()["detail"]


@pytest.mark.asyncio
async def test_expired_report_download(
    client: AsyncClient,
    normal_user_token_headers: dict
):
    """Test downloading an expired report"""
    # Use a non-existent/expired report ID
    response = await client.get(
        f"{settings.API_V1_STR}/reports/download/expired_report_id",
        headers=normal_user_token_headers
    )
    
    assert response.status_code in [404, 410]  # Not found or Gone