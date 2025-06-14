import axios, { AxiosInstance } from 'axios';
import { BasePlatformService, PlatformCampaign, PlatformMetric } from './platform.interface';
import { TikTokAdsCredentials, API_ENDPOINTS } from '../../config/api-keys';
import { logger } from '../../utils/logger';
import crypto from 'crypto';

export class TikTokAdsService extends BasePlatformService {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor(credentials: TikTokAdsCredentials) {
    super(credentials);
    
    this.baseUrl = `${API_ENDPOINTS.TIKTOK_ADS.base}/open_api/${API_ENDPOINTS.TIKTOK_ADS.version}`;
    
    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Access-Token': credentials.accessToken,
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor for signature
    this.api.interceptors.request.use(config => {
      // Add timestamp
      config.headers['X-Timestamp'] = Math.floor(Date.now() / 1000).toString();
      
      // Add signature if required
      if (this.credentials.appSecret) {
        const signature = this.generateSignature(config);
        config.headers['X-Signature'] = signature;
      }
      
      return config;
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.api.get('/advertiser/info/', {
        params: {
          advertiser_id: this.credentials.advertiserId
        }
      });

      if (response.data.code === 0) {
        return {
          success: true,
          message: 'Successfully connected to TikTok Ads'
        };
      }

      return {
        success: false,
        message: response.data.message || 'Connection failed'
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'Connection failed'
      };
    }
  }

  async getCampaigns(): Promise<PlatformCampaign[]> {
    try {
      const response = await this.api.get('/campaign/get/', {
        params: {
          advertiser_id: this.credentials.advertiserId,
          page_size: 100
        }
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      const campaigns = response.data.data.list || [];
      return campaigns.map((campaign: any) => this.mapCampaign(campaign));
    } catch (error) {
      logger.error('Failed to fetch TikTok campaigns', error);
      throw error;
    }
  }

  async getCampaignById(campaignId: string): Promise<PlatformCampaign> {
    try {
      const response = await this.api.get('/campaign/get/', {
        params: {
          advertiser_id: this.credentials.advertiserId,
          campaign_ids: JSON.stringify([campaignId])
        }
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      const campaigns = response.data.data.list || [];
      if (campaigns.length === 0) {
        throw new Error('Campaign not found');
      }

      return this.mapCampaign(campaigns[0]);
    } catch (error) {
      logger.error('Failed to fetch TikTok campaign', { campaignId, error });
      throw error;
    }
  }

  async createCampaign(campaign: Partial<PlatformCampaign>): Promise<PlatformCampaign> {
    try {
      const campaignData = {
        advertiser_id: this.credentials.advertiserId,
        campaign_name: campaign.name,
        objective_type: this.mapObjective(campaign.objective),
        budget_mode: campaign.budgetType === 'DAILY' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL',
        budget: campaign.budget ? Math.round(campaign.budget * 100) : 5000, // In cents, min $50
        operation_status: 'DISABLE' // Start paused
      };

      const response = await this.api.post('/campaign/create/', campaignData);

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return {
        id: response.data.data.campaign_id,
        name: campaign.name!,
        status: 'PAUSED',
        objective: campaign.objective,
        budget: campaign.budget,
        budgetType: campaign.budgetType
      };
    } catch (error) {
      logger.error('Failed to create TikTok campaign', error);
      throw error;
    }
  }

  async updateCampaign(campaignId: string, updates: Partial<PlatformCampaign>): Promise<PlatformCampaign> {
    try {
      const updateData: any = {
        advertiser_id: this.credentials.advertiserId,
        campaign_id: campaignId
      };

      if (updates.name) {
        updateData.campaign_name = updates.name;
      }

      if (updates.budget) {
        updateData.budget = Math.round(updates.budget * 100);
      }

      if (updates.status) {
        updateData.operation_status = this.mapStatus(updates.status);
      }

      const response = await this.api.post('/campaign/update/', updateData);

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return this.getCampaignById(campaignId);
    } catch (error) {
      logger.error('Failed to update TikTok campaign', { campaignId, error });
      throw error;
    }
  }

  async updateCampaignStatus(campaignId: string, status: string): Promise<void> {
    try {
      const response = await this.api.post('/campaign/update/status/', {
        advertiser_id: this.credentials.advertiserId,
        campaign_ids: [campaignId],
        operation_status: this.mapStatus(status)
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }
    } catch (error) {
      logger.error('Failed to update TikTok campaign status', { campaignId, error });
      throw error;
    }
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    // TikTok doesn't support deletion, only archiving
    await this.updateCampaignStatus(campaignId, 'COMPLETED');
  }

  async getCampaignMetrics(
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<PlatformMetric[]> {
    try {
      const response = await this.api.get('/reports/integrated/get/', {
        params: {
          advertiser_id: this.credentials.advertiserId,
          report_type: 'BASIC',
          dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
          metrics: JSON.stringify([
            'spend', 'impressions', 'clicks', 'conversions',
            'cost_per_conversion', 'ctr', 'cpm', 'reach',
            'video_play_actions', 'video_watched_2s', 'video_watched_6s',
            'engaged_view'
          ]),
          filters: JSON.stringify([
            {
              field_name: 'campaign_id',
              filter_type: 'IN',
              filter_value: campaignIds
            }
          ]),
          start_date: this.formatDate(startDate),
          end_date: this.formatDate(endDate),
          page_size: 1000
        }
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      const rows = response.data.data.list || [];
      return rows.map((row: any) => this.mapMetrics(row));
    } catch (error) {
      logger.error('Failed to fetch TikTok metrics', error);
      throw error;
    }
  }

  async getAccountInfo(): Promise<any> {
    try {
      const response = await this.api.get('/advertiser/info/', {
        params: {
          advertiser_id: this.credentials.advertiserId,
          fields: JSON.stringify(['name', 'currency', 'timezone', 'status'])
        }
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.message);
      }

      return response.data.data.list[0] || {};
    } catch (error) {
      logger.error('Failed to fetch TikTok account info', error);
      throw error;
    }
  }

  private generateSignature(config: any): string {
    const timestamp = config.headers['X-Timestamp'];
    const method = config.method.toUpperCase();
    const path = config.url;
    const params = config.params ? new URLSearchParams(config.params).toString() : '';
    
    const signString = `${method}${path}${params}${timestamp}`;
    
    return crypto
      .createHmac('sha256', this.credentials.appSecret)
      .update(signString)
      .digest('hex');
  }

  private mapCampaign(campaign: any): PlatformCampaign {
    return {
      id: campaign.campaign_id,
      name: campaign.campaign_name,
      status: this.mapStatusFromTikTok(campaign.operation_status),
      objective: campaign.objective_type,
      budget: campaign.budget ? campaign.budget / 100 : undefined,
      budgetType: campaign.budget_mode === 'BUDGET_MODE_DAY' ? 'DAILY' : 'LIFETIME',
      creatives: campaign.creatives
    };
  }

  private mapMetrics(row: any): PlatformMetric {
    const metrics = row.metrics;
    const dimensions = row.dimensions;
    
    const baseMetric: Partial<PlatformMetric> = {
      campaignId: dimensions.campaign_id,
      date: new Date(dimensions.stat_time_day),
      impressions: parseInt(metrics.impressions) || 0,
      clicks: parseInt(metrics.clicks) || 0,
      spend: parseFloat(metrics.spend) || 0,
      conversions: parseInt(metrics.conversions) || 0,
      reach: parseInt(metrics.reach) || 0,
      videoViews: parseInt(metrics.video_play_actions) || 0,
      platformMetrics: {
        videoWatched2s: metrics.video_watched_2s,
        videoWatched6s: metrics.video_watched_6s,
        engagedView: metrics.engaged_view,
        costPerConversion: metrics.cost_per_conversion
      }
    };

    return this.calculateDerivedMetrics(baseMetric);
  }

  private mapStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'ACTIVE': 'ENABLE',
      'PAUSED': 'DISABLE',
      'COMPLETED': 'DELETE'
    };

    return statusMap[status.toUpperCase()] || 'DISABLE';
  }

  private mapStatusFromTikTok(status: string): string {
    const statusMap: Record<string, string> = {
      'ENABLE': 'ACTIVE',
      'DISABLE': 'PAUSED',
      'DELETE': 'COMPLETED'
    };

    return statusMap[status.toUpperCase()] || 'DRAFT';
  }

  private mapObjective(objective?: string): string {
    const objectiveMap: Record<string, string> = {
      'awareness': 'REACH',
      'traffic': 'TRAFFIC',
      'app_installs': 'APP_PROMOTION',
      'video_views': 'VIDEO_VIEWS',
      'lead_generation': 'LEAD_GENERATION',
      'conversions': 'CONVERSIONS'
    };

    return objectiveMap[objective?.toLowerCase() || ''] || 'TRAFFIC';
  }
}