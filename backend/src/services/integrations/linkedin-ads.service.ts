import axios, { AxiosInstance } from 'axios';
import { BasePlatformService, PlatformCampaign, PlatformMetric } from './platform.interface';
import { LinkedInAdsCredentials, API_ENDPOINTS } from '../../config/api-keys';
import { logger } from '../../utils/logger';

export class LinkedInAdsService extends BasePlatformService {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor(credentials: LinkedInAdsCredentials) {
    super(credentials);
    
    this.baseUrl = `${API_ENDPOINTS.LINKEDIN_ADS.base}/${API_ENDPOINTS.LINKEDIN_ADS.version}`;
    
    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.api.get('/me');

      if (response.data.id) {
        return {
          success: true,
          message: 'Successfully connected to LinkedIn Ads'
        };
      }

      return {
        success: false,
        message: 'Unable to verify connection'
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
      const accountId = this.credentials.accountId;
      const response = await this.api.get('/adAccounts', {
        params: {
          q: 'search',
          search: {
            account: `urn:li:sponsoredAccount:${accountId}`
          }
        }
      });

      // Get campaigns for the account
      const campaignsResponse = await this.api.get('/adCampaigns', {
        params: {
          q: 'search',
          search: {
            account: `urn:li:sponsoredAccount:${accountId}`
          }
        }
      });

      const campaigns = campaignsResponse.data.elements || [];
      return campaigns.map((campaign: any) => this.mapCampaign(campaign));
    } catch (error) {
      logger.error('Failed to fetch LinkedIn campaigns', error);
      throw error;
    }
  }

  async getCampaignById(campaignId: string): Promise<PlatformCampaign> {
    try {
      const response = await this.api.get(`/adCampaigns/${campaignId}`);
      return this.mapCampaign(response.data);
    } catch (error) {
      logger.error('Failed to fetch LinkedIn campaign', { campaignId, error });
      throw error;
    }
  }

  async createCampaign(campaign: Partial<PlatformCampaign>): Promise<PlatformCampaign> {
    try {
      const accountId = this.credentials.accountId;
      
      const campaignData = {
        account: `urn:li:sponsoredAccount:${accountId}`,
        name: campaign.name,
        status: 'PAUSED',
        type: 'SPONSORED_UPDATES',
        objectiveType: this.mapObjective(campaign.objective),
        costType: 'CPM',
        dailyBudget: campaign.budget && campaign.budgetType === 'DAILY' ? {
          amount: campaign.budget.toString(),
          currencyCode: 'USD'
        } : undefined,
        totalBudget: campaign.budget && campaign.budgetType === 'LIFETIME' ? {
          amount: campaign.budget.toString(),
          currencyCode: 'USD'
        } : undefined,
        runSchedule: {
          start: campaign.startDate?.getTime(),
          end: campaign.endDate?.getTime()
        }
      };

      const response = await this.api.post('/adCampaigns', campaignData);

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
      logger.error('Failed to create LinkedIn campaign', error);
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
        updateData.dailyBudget = {
          amount: updates.budget.toString(),
          currencyCode: 'USD'
        };
      } else if (updates.budget && updates.budgetType === 'LIFETIME') {
        updateData.totalBudget = {
          amount: updates.budget.toString(),
          currencyCode: 'USD'
        };
      }

      const response = await this.api.patch(`/adCampaigns/${campaignId}`, updateData);

      return this.getCampaignById(campaignId);
    } catch (error) {
      logger.error('Failed to update LinkedIn campaign', { campaignId, error });
      throw error;
    }
  }

  async updateCampaignStatus(campaignId: string, status: string): Promise<void> {
    await this.updateCampaign(campaignId, { status });
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    // LinkedIn doesn't support deletion, archive instead
    await this.updateCampaignStatus(campaignId, 'COMPLETED');
  }

  async getCampaignMetrics(
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<PlatformMetric[]> {
    try {
      const metrics: PlatformMetric[] = [];

      // LinkedIn Analytics API requires specific formatting
      const dateRange = {
        start: {
          year: startDate.getFullYear(),
          month: startDate.getMonth() + 1,
          day: startDate.getDate()
        },
        end: {
          year: endDate.getFullYear(),
          month: endDate.getMonth() + 1,
          day: endDate.getDate()
        }
      };

      for (const campaignId of campaignIds) {
        try {
          const response = await this.api.get('/adAnalytics', {
            params: {
              q: 'statistics',
              campaigns: `urn:li:sponsoredCampaign:${campaignId}`,
              dateRange,
              timeGranularity: 'DAILY',
              metrics: 'impressions,clicks,costInUsd,conversions,leads'
            }
          });

          const elements = response.data.elements || [];
          metrics.push(...elements.map((row: any) => this.mapMetrics(row, campaignId)));
        } catch (error) {
          logger.error('Failed to fetch metrics for LinkedIn campaign', { campaignId, error });
        }
      }

      return metrics;
    } catch (error) {
      logger.error('Failed to fetch LinkedIn metrics', error);
      throw error;
    }
  }

  async getAccountInfo(): Promise<any> {
    try {
      const accountId = this.credentials.accountId;
      const response = await this.api.get(`/adAccounts/${accountId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch LinkedIn account info', error);
      throw error;
    }
  }

  private mapCampaign(campaign: any): PlatformCampaign {
    return {
      id: campaign.id,
      name: campaign.name,
      status: this.mapStatusFromLinkedIn(campaign.status),
      objective: campaign.objectiveType,
      budget: campaign.dailyBudget?.amount || campaign.totalBudget?.amount,
      budgetType: campaign.dailyBudget ? 'DAILY' : 'LIFETIME',
      startDate: campaign.runSchedule?.start ? new Date(campaign.runSchedule.start) : undefined,
      endDate: campaign.runSchedule?.end ? new Date(campaign.runSchedule.end) : undefined
    };
  }

  private mapMetrics(row: any, campaignId: string): PlatformMetric {
    const baseMetric: Partial<PlatformMetric> = {
      campaignId,
      date: new Date(`${row.dateRange.start.year}-${row.dateRange.start.month}-${row.dateRange.start.day}`),
      impressions: row.impressions || 0,
      clicks: row.clicks || 0,
      spend: row.costInUsd || 0,
      conversions: row.conversions || 0,
      leads: row.leads || 0,
      platformMetrics: {
        ...row
      }
    };

    return this.calculateDerivedMetrics(baseMetric);
  }

  private mapStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'ACTIVE': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'COMPLETED': 'ARCHIVED',
      'DRAFT': 'DRAFT'
    };

    return statusMap[status.toUpperCase()] || 'PAUSED';
  }

  private mapStatusFromLinkedIn(status: string): string {
    const statusMap: Record<string, string> = {
      'ACTIVE': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'ARCHIVED': 'COMPLETED',
      'DRAFT': 'DRAFT'
    };

    return statusMap[status.toUpperCase()] || 'DRAFT';
  }

  private mapObjective(objective?: string): string {
    const objectiveMap: Record<string, string> = {
      'awareness': 'BRAND_AWARENESS',
      'consideration': 'WEBSITE_VISITS',
      'conversions': 'WEBSITE_CONVERSIONS',
      'job_applicants': 'JOB_APPLICANTS',
      'lead_generation': 'LEAD_GENERATION',
      'video_views': 'VIDEO_VIEWS'
    };

    return objectiveMap[objective?.toLowerCase() || ''] || 'WEBSITE_VISITS';
  }
}