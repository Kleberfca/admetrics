#!/usr/bin/env python3
"""
Platform connector utilities for AdMetrics
"""

import logging
import requests
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import pandas as pd
from abc import ABC, abstractmethod
import time

logger = logging.getLogger(__name__)


class PlatformConnector(ABC):
    """Abstract base class for platform connectors"""
    
    def __init__(self, credentials: Dict[str, Any]):
        self.credentials = credentials
        self.rate_limit_remaining = None
        self.rate_limit_reset = None
        
    @abstractmethod
    def authenticate(self) -> bool:
        """Authenticate with the platform"""
        pass
    
    @abstractmethod
    def get_campaigns(self, account_id: str) -> List[Dict[str, Any]]:
        """Get campaigns for an account"""
        pass
    
    @abstractmethod
    def get_campaign_metrics(self, campaign_id: str, 
                           start_date: datetime, 
                           end_date: datetime) -> pd.DataFrame:
        """Get metrics for a campaign"""
        pass
    
    def handle_rate_limit(self, response: requests.Response):
        """Handle rate limiting"""
        if response.status_code == 429:
            retry_after = int(response.headers.get('Retry-After', 60))
            logger.warning(f"Rate limited. Waiting {retry_after} seconds")
            time.sleep(retry_after)
            return True
        return False


class GoogleAdsConnector(PlatformConnector):
    """Google Ads API connector"""
    
    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.base_url = "https://googleads.googleapis.com/v14"
        self.access_token = None
        
    def authenticate(self) -> bool:
        """Authenticate with Google Ads API"""
        try:
            # OAuth2 authentication
            auth_url = "https://oauth2.googleapis.com/token"
            
            data = {
                'client_id': self.credentials.get('client_id'),
                'client_secret': self.credentials.get('client_secret'),
                'refresh_token': self.credentials.get('refresh_token'),
                'grant_type': 'refresh_token'
            }
            
            response = requests.post(auth_url, data=data)
            
            if response.status_code == 200:
                self.access_token = response.json()['access_token']
                logger.info("Successfully authenticated with Google Ads")
                return True
            else:
                logger.error(f"Google Ads authentication failed: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error authenticating with Google Ads: {e}")
            return False
    
    def get_campaigns(self, account_id: str) -> List[Dict[str, Any]]:
        """Get campaigns from Google Ads"""
        try:
            query = """
                SELECT
                    campaign.id,
                    campaign.name,
                    campaign.status,
                    campaign.advertising_channel_type,
                    campaign_budget.amount_micros
                FROM campaign
                WHERE campaign.status != 'REMOVED'
            """
            
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'developer-token': self.credentials.get('developer_token'),
                'login-customer-id': account_id
            }
            
            response = requests.post(
                f"{self.base_url}/customers/{account_id}/googleAds:searchStream",
                headers=headers,
                json={'query': query}
            )
            
            if response.status_code == 200:
                campaigns = []
                for result in response.json().get('results', []):
                    campaign = result['campaign']
                    campaigns.append({
                        'campaign_id': campaign['id'],
                        'campaign_name': campaign['name'],
                        'status': campaign['status'],
                        'channel': campaign['advertisingChannelType'],
                        'budget': result['campaignBudget']['amountMicros'] / 1000000
                    })
                return campaigns
            else:
                logger.error(f"Failed to get campaigns: {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting Google Ads campaigns: {e}")
            return []
    
    def get_campaign_metrics(self, campaign_id: str, 
                           start_date: datetime, 
                           end_date: datetime) -> pd.DataFrame:
        """Get campaign metrics from Google Ads"""
        try:
            query = f"""
                SELECT
                    segments.date,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions,
                    metrics.conversions_value,
                    metrics.ctr,
                    metrics.average_cpc,
                    metrics.cost_per_conversion
                FROM campaign
                WHERE campaign.id = {campaign_id}
                    AND segments.date BETWEEN '{start_date.strftime('%Y-%m-%d')}'
                    AND '{end_date.strftime('%Y-%m-%d')}'
            """
            
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'developer-token': self.credentials.get('developer_token')
            }
            
            response = requests.post(
                f"{self.base_url}/customers/{self.credentials['customer_id']}/googleAds:searchStream",
                headers=headers,
                json={'query': query}
            )
            
            if response.status_code == 200:
                data = []
                for result in response.json().get('results', []):
                    metrics = result['metrics']
                    data.append({
                        'date': result['segments']['date'],
                        'impressions': metrics.get('impressions', 0),
                        'clicks': metrics.get('clicks', 0),
                        'spend': metrics.get('costMicros', 0) / 1000000,
                        'conversions': metrics.get('conversions', 0),
                        'revenue': metrics.get('conversionsValue', 0),
                        'ctr': metrics.get('ctr', 0),
                        'cpc': metrics.get('averageCpc', 0) / 1000000,
                        'cpa': metrics.get('costPerConversion', 0) / 1000000
                    })
                
                return pd.DataFrame(data)
            else:
                logger.error(f"Failed to get campaign metrics: {response.text}")
                return pd.DataFrame()
                
        except Exception as e:
            logger.error(f"Error getting Google Ads metrics: {e}")
            return pd.DataFrame()


class FacebookAdsConnector(PlatformConnector):
    """Facebook Ads API connector"""
    
    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.base_url = "https://graph.facebook.com/v17.0"
        self.access_token = credentials.get('access_token')
        
    def authenticate(self) -> bool:
        """Authenticate with Facebook Ads API"""
        try:
            # Test authentication by getting user info
            response = requests.get(
                f"{self.base_url}/me",
                params={'access_token': self.access_token}
            )
            
            if response.status_code == 200:
                logger.info("Successfully authenticated with Facebook Ads")
                return True
            else:
                logger.error(f"Facebook Ads authentication failed: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error authenticating with Facebook Ads: {e}")
            return False
    
    def get_campaigns(self, account_id: str) -> List[Dict[str, Any]]:
        """Get campaigns from Facebook Ads"""
        try:
            response = requests.get(
                f"{self.base_url}/act_{account_id}/campaigns",
                params={
                    'access_token': self.access_token,
                    'fields': 'id,name,status,objective,daily_budget,lifetime_budget'
                }
            )
            
            if response.status_code == 200:
                campaigns = []
                for campaign in response.json().get('data', []):
                    campaigns.append({
                        'campaign_id': campaign['id'],
                        'campaign_name': campaign['name'],
                        'status': campaign['status'],
                        'objective': campaign.get('objective'),
                        'daily_budget': float(campaign.get('daily_budget', 0)) / 100,
                        'lifetime_budget': float(campaign.get('lifetime_budget', 0)) / 100
                    })
                return campaigns
            else:
                logger.error(f"Failed to get campaigns: {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting Facebook campaigns: {e}")
            return []
    
    def get_campaign_metrics(self, campaign_id: str, 
                           start_date: datetime, 
                           end_date: datetime) -> pd.DataFrame:
        """Get campaign metrics from Facebook Ads"""
        try:
            response = requests.get(
                f"{self.base_url}/{campaign_id}/insights",
                params={
                    'access_token': self.access_token,
                    'time_range': {
                        'since': start_date.strftime('%Y-%m-%d'),
                        'until': end_date.strftime('%Y-%m-%d')
                    },
                    'fields': 'date_start,impressions,clicks,spend,conversions,purchase_roas,ctr,cpc,cpm',
                    'time_increment': 1  # Daily breakdown
                }
            )
            
            if response.status_code == 200:
                data = []
                for day_data in response.json().get('data', []):
                    data.append({
                        'date': day_data['date_start'],
                        'impressions': int(day_data.get('impressions', 0)),
                        'clicks': int(day_data.get('clicks', 0)),
                        'spend': float(day_data.get('spend', 0)),
                        'conversions': int(day_data.get('conversions', {}).get('value', 0)),
                        'roas': float(day_data.get('purchase_roas', [{}])[0].get('value', 0)),
                        'ctr': float(day_data.get('ctr', 0)),
                        'cpc': float(day_data.get('cpc', 0)),
                        'cpm': float(day_data.get('cpm', 0))
                    })
                
                return pd.DataFrame(data)
            else:
                logger.error(f"Failed to get campaign metrics: {response.text}")
                return pd.DataFrame()
                
        except Exception as e:
            logger.error(f"Error getting Facebook metrics: {e}")
            return pd.DataFrame()


class TikTokAdsConnector(PlatformConnector):
    """TikTok Ads API connector"""
    
    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.base_url = "https://business-api.tiktok.com/open_api/v1.3"
        self.access_token = credentials.get('access_token')
        
    def authenticate(self) -> bool:
        """Authenticate with TikTok Ads API"""
        try:
            headers = {
                'Access-Token': self.access_token
            }
            
            response = requests.get(
                f"{self.base_url}/advertiser/info/",
                headers=headers,
                params={'advertiser_ids': [self.credentials.get('advertiser_id')]}
            )
            
            if response.status_code == 200 and response.json().get('code') == 0:
                logger.info("Successfully authenticated with TikTok Ads")
                return True
            else:
                logger.error(f"TikTok Ads authentication failed: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error authenticating with TikTok Ads: {e}")
            return False
    
    def get_campaigns(self, account_id: str) -> List[Dict[str, Any]]:
        """Get campaigns from TikTok Ads"""
        try:
            headers = {
                'Access-Token': self.access_token
            }
            
            response = requests.get(
                f"{self.base_url}/campaign/get/",
                headers=headers,
                params={
                    'advertiser_id': account_id,
                    'page_size': 100
                }
            )
            
            if response.status_code == 200 and response.json().get('code') == 0:
                campaigns = []
                for campaign in response.json().get('data', {}).get('list', []):
                    campaigns.append({
                        'campaign_id': campaign['campaign_id'],
                        'campaign_name': campaign['campaign_name'],
                        'status': campaign['status'],
                        'objective': campaign['objective'],
                        'budget': float(campaign.get('budget', 0))
                    })
                return campaigns
            else:
                logger.error(f"Failed to get campaigns: {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting TikTok campaigns: {e}")
            return []
    
    def get_campaign_metrics(self, campaign_id: str, 
                           start_date: datetime, 
                           end_date: datetime) -> pd.DataFrame:
        """Get campaign metrics from TikTok Ads"""
        try:
            headers = {
                'Access-Token': self.access_token
            }
            
            data = {
                'advertiser_id': self.credentials.get('advertiser_id'),
                'dimensions': ['campaign_id', 'stat_time_day'],
                'metrics': [
                    'impressions', 'clicks', 'spend', 'conversions',
                    'ctr', 'cpc', 'cpm', 'conversion_rate'
                ],
                'filters': [{
                    'field': 'campaign_id',
                    'operator': 'IN',
                    'values': [campaign_id]
                }],
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d')
            }
            
            response = requests.post(
                f"{self.base_url}/report/integrated/get/",
                headers=headers,
                json=data
            )
            
            if response.status_code == 200 and response.json().get('code') == 0:
                data = []
                for row in response.json().get('data', {}).get('list', []):
                    metrics = row.get('metrics', {})
                    data.append({
                        'date': row.get('dimensions', {}).get('stat_time_day'),
                        'impressions': int(metrics.get('impressions', 0)),
                        'clicks': int(metrics.get('clicks', 0)),
                        'spend': float(metrics.get('spend', 0)),
                        'conversions': int(metrics.get('conversions', 0)),
                        'ctr': float(metrics.get('ctr', 0)),
                        'cpc': float(metrics.get('cpc', 0)),
                        'cpm': float(metrics.get('cpm', 0)),
                        'cvr': float(metrics.get('conversion_rate', 0))
                    })
                
                return pd.DataFrame(data)
            else:
                logger.error(f"Failed to get campaign metrics: {response.text}")
                return pd.DataFrame()
                
        except Exception as e:
            logger.error(f"Error getting TikTok metrics: {e}")
            return pd.DataFrame()


class PlatformConnectorFactory:
    """Factory class for creating platform connectors"""
    
    @staticmethod
    def create_connector(platform: str, credentials: Dict[str, Any]) -> Optional[PlatformConnector]:
        """Create a platform connector instance"""
        connectors = {
            'GOOGLE_ADS': GoogleAdsConnector,
            'FACEBOOK_ADS': FacebookAdsConnector,
            'TIKTOK_ADS': TikTokAdsConnector
        }
        
        connector_class = connectors.get(platform)
        if connector_class:
            return connector_class(credentials)
        else:
            logger.error(f"Unknown platform: {platform}")
            return None


class UnifiedDataFetcher:
    """Unified data fetcher for all platforms"""
    
    def __init__(self):
        self.connectors = {}
        
    def add_platform(self, platform: str, credentials: Dict[str, Any]) -> bool:
        """Add a platform connector"""
        connector = PlatformConnectorFactory.create_connector(platform, credentials)
        
        if connector and connector.authenticate():
            self.connectors[platform] = connector
            return True
        return False
    
    def fetch_all_campaigns(self) -> pd.DataFrame:
        """Fetch campaigns from all connected platforms"""
        all_campaigns = []
        
        for platform, connector in self.connectors.items():
            try:
                campaigns = connector.get_campaigns(
                    connector.credentials.get('account_id', 
                    connector.credentials.get('advertiser_id'))
                )
                
                for campaign in campaigns:
                    campaign['platform'] = platform
                    all_campaigns.append(campaign)
                    
            except Exception as e:
                logger.error(f"Error fetching campaigns from {platform}: {e}")
        
        return pd.DataFrame(all_campaigns)
    
    def fetch_campaign_metrics(self, campaign_mapping: Dict[str, List[str]],
                             start_date: datetime,
                             end_date: datetime) -> pd.DataFrame:
        """Fetch metrics for campaigns across platforms"""
        all_metrics = []
        
        for platform, campaign_ids in campaign_mapping.items():
            if platform not in self.connectors:
                continue
                
            connector = self.connectors[platform]
            
            for campaign_id in campaign_ids:
                try:
                    metrics = connector.get_campaign_metrics(
                        campaign_id, start_date, end_date
                    )
                    
                    if not metrics.empty:
                        metrics['platform'] = platform
                        metrics['campaign_id'] = campaign_id
                        all_metrics.append(metrics)
                        
                except Exception as e:
                    logger.error(f"Error fetching metrics for campaign {campaign_id}: {e}")
        
        if all_metrics:
            return pd.concat(all_metrics, ignore_index=True)
        else:
            return pd.DataFrame()