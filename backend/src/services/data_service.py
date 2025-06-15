"""
Data Service for managing campaign data
"""

import asyncio
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime, timedelta
from app.utils.platform_connector import PlatformConnectorFactory, UnifiedDataFetcher
from app.db.session import SessionLocal
from app.models.campaign import Campaign
from app.models.metrics import Metrics
import pandas as pd
import uuid

logger = logging.getLogger(__name__)


class DataService:
    """Service for data operations"""
    
    def __init__(self):
        self.fetcher = UnifiedDataFetcher()
        
    async def sync_platform_data(self, organization_id: str, platform: str) -> Dict[str, Any]:
        """Sync data from advertising platform"""
        try:
            db = SessionLocal()
            
            # Get integration credentials
            integration = db.query(Integration).filter(
                Integration.organization_id == organization_id,
                Integration.platform == platform,
                Integration.is_active == True
            ).first()
            
            if not integration:
                return {"error": "Integration not found"}
            
            # Add platform to fetcher
            success = self.fetcher.add_platform(platform, integration.credentials)
            if not success:
                return {"error": "Failed to authenticate with platform"}
            
            # Fetch campaigns
            campaigns_df = await asyncio.to_thread(self.fetcher.fetch_all_campaigns)
            
            # Update campaigns in database
            campaigns_synced = 0
            for _, campaign_data in campaigns_df.iterrows():
                # Check if campaign exists
                campaign = db.query(Campaign).filter(
                    Campaign.external_id == campaign_data['campaign_id'],
                    Campaign.platform == platform
                ).first()
                
                if not campaign:
                    # Create new campaign
                    campaign = Campaign(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        name=campaign_data['campaign_name'],
                        platform=platform,
                        external_id=campaign_data['campaign_id'],
                        status=campaign_data.get('status', 'ACTIVE'),
                        budget=campaign_data.get('budget', 0),
                        daily_budget=campaign_data.get('daily_budget', 0),
                        created_by=integration.created_by
                    )
                    db.add(campaign)
                else:
                    # Update existing campaign
                    campaign.name = campaign_data['campaign_name']
                    campaign.status = campaign_data.get('status', campaign.status)
                    campaign.budget = campaign_data.get('budget', campaign.budget)
                    campaign.updated_at = datetime.utcnow()
                
                campaigns_synced += 1
            
            db.commit()
            
            # Fetch metrics for last 30 days
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)
            
            # Get campaign mapping
            campaigns = db.query(Campaign).filter(
                Campaign.organization_id == organization_id,
                Campaign.platform == platform
            ).all()
            
            campaign_mapping = {
                platform: [c.external_id for c in campaigns]
            }
            
            # Fetch metrics
            metrics_df = await asyncio.to_thread(
                self.fetcher.fetch_campaign_metrics,
                campaign_mapping,
                start_date,
                end_date
            )
            
            # Update metrics in database
            metrics_synced = 0
            for _, metric_data in metrics_df.iterrows():
                # Find campaign
                campaign = next(
                    (c for c in campaigns if c.external_id == metric_data['campaign_id']),
                    None
                )
                
                if not campaign:
                    continue
                
                # Check if metrics exist for this date
                metric_date = pd.to_datetime(metric_data['date']).date()
                
                metrics = db.query(Metrics).filter(
                    Metrics.campaign_id == campaign.id,
                    Metrics.date == metric_date
                ).first()
                
                if not metrics:
                    # Create new metrics
                    metrics = Metrics(
                        id=str(uuid.uuid4()),
                        campaign_id=campaign.id,
                        date=metric_date
                    )
                    db.add(metrics)
                
                # Update metrics
                metrics.impressions = int(metric_data.get('impressions', 0))
                metrics.clicks = int(metric_data.get('clicks', 0))
                metrics.conversions = int(metric_data.get('conversions', 0))
                metrics.spend = float(metric_data.get('spend', 0))
                metrics.revenue = float(metric_data.get('revenue', 0))
                
                metrics_synced += 1
            
            db.commit()
            db.close()
            
            return {
                "status": "success",
                "campaigns_synced": campaigns_synced,
                "metrics_synced": metrics_synced,
                "last_sync": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error syncing platform data: {e}")
            return {"error": str(e)}
    
    async def get_dashboard_metrics(self, 
                                  organization_id: str,
                                  start_date: datetime,
                                  end_date: datetime,
                                  campaign_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """Get aggregated metrics for dashboard"""
        try:
            db = SessionLocal()
            
            # Build query
            query = db.query(Metrics).join(Campaign).filter(
                Campaign.organization_id == organization_id,
                Metrics.date >= start_date.date(),
                Metrics.date <= end_date.date()
            )
            
            if campaign_ids:
                query = query.filter(Campaign.id.in_(campaign_ids))
            
            # Get metrics
            metrics = query.all()
            
            # Aggregate data
            total_impressions = sum(m.impressions for m in metrics)
            total_clicks = sum(m.clicks for m in metrics)
            total_conversions = sum(m.conversions for m in metrics)
            total_spend = sum(m.spend for m in metrics)
            total_revenue = sum(m.revenue for m in metrics)
            
            # Calculate derived metrics
            ctr = total_clicks / total_impressions if total_impressions > 0 else 0
            cvr = total_conversions / total_clicks if total_clicks > 0 else 0
            cpc = total_spend / total_clicks if total_clicks > 0 else 0
            cpa = total_spend / total_conversions if total_conversions > 0 else 0
            roas = total_revenue / total_spend if total_spend > 0 else 0
            
            # Time series data
            metrics_df = pd.DataFrame([
                {
                    'date': m.date,
                    'impressions': m.impressions,
                    'clicks': m.clicks,
                    'conversions': m.conversions,
                    'spend': m.spend,
                    'revenue': m.revenue
                }
                for m in metrics
            ])
            
            if not metrics_df.empty:
                daily_metrics = metrics_df.groupby('date').sum().reset_index()
                time_series = daily_metrics.to_dict('records')
            else:
                time_series = []
            
            db.close()
            
            return {
                'summary': {
                    'impressions': total_impressions,
                    'clicks': total_clicks,
                    'conversions': total_conversions,
                    'spend': total_spend,
                    'revenue': total_revenue,
                    'ctr': ctr,
                    'cvr': cvr,
                    'cpc': cpc,
                    'cpa': cpa,
                    'roas': roas
                },
                'time_series': time_series,
                'date_range': {
                    'start': start_date.isoformat(),
                    'end': end_date.isoformat()
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting dashboard metrics: {e}")
            return {"error": str(e)}


# Singleton instance
data_service = DataService()

# Import here to avoid circular imports
from app.models.integration import Integration