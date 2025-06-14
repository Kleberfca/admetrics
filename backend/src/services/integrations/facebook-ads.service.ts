import axios, { AxiosInstance } from 'axios';
import { BasePlatformService, PlatformCampaign, PlatformMetric } from './platform.interface';
import { FacebookAdsCredentials, API_ENDPOINTS } from '../../config/api-keys';
import { logger } from '../../utils/logger';

export class FacebookAdsService extends BasePlatformService {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor(credentials: FacebookAdsCredentials) {
    super(credentials);
    
    this.baseUrl = `${API_ENDPOINTS.FACEBOOK_ADS.base}/${API_ENDPOINTS.FACEBOOK_ADS.version}`;
    
    this.api = axios.create({
      baseURL: this.baseUrl,
      params: {
        access_token: credentials.accessToken
      }
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.data?.error) {
          const fbError = error.response.data.error;
          logger.error('Facebook API error', {
            message: fbError.message,
            type: fbError.type,
            code: fbError.code
          });
        }
        throw error;
      }
    );
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.api.get('/me', {
        params: {
          fields: 'id,name'
        }
      });

      if (response.data.id) {
        return {
          success: true,
          message: 'Successfully connected to Facebook Ads'
        };
      }

      return {
        success: false,
        message: 'Unable to verify connection'
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error?.message || 'Connection failed'
      };
    }
  }

  async getCampaigns(): Promise<PlatformCampaign[]> {
    try {
      const accountId = this.credentials.accountId;
      const response = await this.api.get(`/act_${accountId}/campaigns`, {
        params: {
          fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,targeting'
        }
      });

      return response.data.data.map((campaign: any) => this.mapCampaign(campaign));
    } catch (error) {
      logger.error('Failed to fetch Facebook campaigns', error);
      throw error;
    }
  }

  async getCampaignById(campaignId: string): Promise<PlatformCampaign> {
    try {
      const response = await this.api.get(`/${campaignId}`, {
        params: {
          fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,targeting'
        }
      });

      return this.mapCampaign(response.data);
    } catch (error) {
      logger.error('Failed to fetch Facebook campaign', { campaignId, error });
      throw error;
    }
  }

  async createCampaign(campaign: Partial<PlatformCampaign>): Promise<PlatformCampaign> {
    try {
      const accountId = this.credentials.accountId;
      
      const campaignData: any = {
        name: campaign.name,
        objective: this.mapObjective(campaign.objective),
        status: 'PAUSED',
        special_ad_categories: []
      };

      // Set budget
      if (campaign.budgetType === 'DAILY' && campaign.budget) {
        campaignData.daily_budget = Math.round(campaign.budget * 100); // In cents
      } else if (campaign.budgetType === 'LIFETIME' && campaign.budget) {
        campaignData.lifetime_budget = Math.round(campaign.budget * 100);
      }

      // Set dates
      if (campaign.startDate) {
        campaignData.start_time = campaign.startDate.toISOString();
      }
      if (campaign.endDate) {
        campaignData.stop_time = campaign.endDate.toISOString();
      }

      const response = await this.api.post(`/act_${accountId}/campaigns`, campaignData);

      return {
        id: response.data.id,
        name: campaign.name!,
        status: 'PAUSED',
        objective: campaign.objective,
        budget: campaign.budget,
        budgetType: campaign.budgetType,
        startDate: campaign.startDate,
        endDate: campaign.endDate
      };
    } catch (error) {
      logger.error('Failed to create Facebook campaign', error);
      throw error;
    }
  }

  async updateCampaign(campaignId: string, updates: Partial<PlatformCampaign>): Promise<PlatformCampaign> {
    try {
      const updateData: any = {};

      if (updates.name) {
        updateData.name = updates.name;
      }

      if (updates.status) {
        updateData.status = this.mapStatus(updates.status);
      }

      if (updates.budget && updates.budgetType === 'DAILY') {
        updateData.daily_budget = Math.round(updates.budget * 100);
      } else if (updates.budget && updates.budgetType === 'LIFETIME') {
        updateData.lifetime_budget = Math.round(updates.budget * 100);
      }

      if (updates.endDate) {
        updateData.stop_time = updates.endDate.toISOString();
      }

      await this.api.post(`/${campaignId}`, updateData);

      return this.getCampaignById(campaignId);
    } catch (error) {
      logger.error('Failed to update Facebook campaign', { campaignId, error });
      throw error;
    }
  }

  async updateCampaignStatus(campaignId: string, status: string): Promise<void> {
    await this.updateCampaign(campaignId, { status });
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    try {
      await this.api.delete(`/${campaignId}`);
    } catch (error) {
      logger.error('Failed to delete Facebook campaign', { campaignId, error });
      throw error;
    }
  }

  async getCampaignMetrics(
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<PlatformMetric[]> {
    try {
      const metrics: PlatformMetric[] = [];
      const dateRange = `{'since':'${this.formatDate(startDate)}','until':'${this.formatDate(endDate)}'}`;

      // Fetch metrics for each campaign
      for (const campaignId of campaignIds) {
        try {
          const response = await this.api.get(`/${campaignId}/insights`, {
            params: {
              fields: 'campaign_id,date_start,impressions,clicks,spend,conversions,conversion_values,reach,frequency,video_views,video_view_rate,engagement_rate,actions',
              time_range: dateRange,
              time_increment: 1 // Daily breakdown
            }
          });

          if (response.data.data) {
            metrics.push(...response.data.data.map((row: any) => this.mapMetrics(row)));
          }
        } catch (error) {
          logger.error('Failed to fetch metrics for campaign', { campaignId, error });
        }
      }

      return metrics;
    } catch (error) {
      logger.error('Failed to fetch Facebook metrics', error);
      throw error;
    }
  }

  async getAccountInfo(): Promise<any> {
    try {
      const accountId = this.credentials.accountId;
      const response = await this.api.get(`/act_${accountId}`, {
        params: {
          fields: 'id,name,currency,timezone_name,account_status'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch Facebook account info', error);
      throw error;
    }
  }

  private mapCampaign(campaign: any): PlatformCampaign {
    return {
      id: campaign.id,
      name: campaign.name,
      status: this.mapStatusFromFacebook(campaign.status),
      objective: campaign.objective,
      budget: campaign.daily_budget ? campaign.daily_budget / 100 : 
              campaign.lifetime_budget ? campaign.lifetime_budget / 100 : undefined,
      budgetType: campaign.daily_budget ? 'DAILY' : 'LIFETIME',
      startDate: campaign.start_time ? new Date(campaign.start_time) : undefined,
      endDate: campaign.stop_time ? new Date(campaign.stop_time) : undefined,
      targeting: campaign.targeting
    };
  }

  private mapMetrics(row: any): PlatformMetric {
    const baseMetric: Partial<PlatformMetric> = {
      campaignId: row.campaign_id,
      date: new Date(row.date_start),
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      spend: parseFloat(row.spend) || 0,
      conversions: this.extractConversions(row.actions),
      reach: parseInt(row.reach) || 0,
      frequency: parseFloat(row.frequency) || 0,
      videoViews: parseInt(row.video_views) || 0,
      engagements: this.extractEngagements(row.actions),
      platformMetrics: {
        actions: row.actions,
        conversionValues: row.conversion_values
      }
    };

    return this.calculateDerivedMetrics(baseMetric);
  }

  private extractConversions(actions: any[]): number {
    if (!actions) return 0;
    
    const conversionActions = ['purchase', 'lead', 'complete_registration'];
    return actions
      .filter(action => conversionActions.includes(action.action_type))
      .reduce((sum, action) => sum + parseInt(action.value), 0);
  }

  private extractEngagements(actions: any[]): number {
    if (!actions) return 0;
    
    const engagementActions = ['post_engagement', 'page_engagement', 'link_click'];
    return actions
      .filter(action => engagementActions.includes(action.action_type))
      .reduce((sum, action) => sum + parseInt(action.value), 0);
  }

  private mapStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'ACTIVE': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'COMPLETED': 'ARCHIVED',
      'DRAFT': 'PAUSED'
    };

    return statusMap[status.toUpperCase()] || 'PAUSED';
  }

  private mapStatusFromFacebook(status: string): string {
    const statusMap: Record<string, string> = {
      'ACTIVE': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'ARCHIVED': 'COMPLETED',
      'DELETED': 'COMPLETED'
    };

    return statusMap[status.toUpperCase()] || 'DRAFT';
  }

  private mapObjective(objective?: string): string {
    const objectiveMap: Record<string, string> = {
      'awareness': 'BRAND_AWARENESS',
      'traffic': 'LINK_CLICKS',
      'engagement': 'POST_ENGAGEMENT',
      'leads': 'LEAD_GENERATION',
      'conversions': 'CONVERSIONS',
      'sales': 'CATALOG_SALES'
    };

    return objectiveMap[objective?.toLowerCase() || ''] || 'LINK_CLICKS';
  }
}