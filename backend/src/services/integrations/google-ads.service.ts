import { GoogleAdsApi, Customer, Campaign, CampaignStatus } from 'google-ads-api';
import { BasePlatformService, PlatformCampaign, PlatformMetric } from './platform.interface';
import { GoogleAdsCredentials } from '../../config/api-keys';
import { logger } from '../../utils/logger';

export class GoogleAdsService extends BasePlatformService {
  private client: GoogleAdsApi;
  private customer: Customer;

  constructor(credentials: GoogleAdsCredentials) {
    super(credentials);
    
    this.client = new GoogleAdsApi({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      developer_token: credentials.developerToken
    });

    // Set refresh token
    this.client.setCredentials({
      refresh_token: credentials.refreshToken
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const customerId = this.credentials.customerId;
      if (!customerId) {
        // Get accessible customers
        const customers = await this.client.listAccessibleCustomers();
        if (customers.length === 0) {
          return {
            success: false,
            message: 'No accessible Google Ads accounts found'
          };
        }
      }

      return {
        success: true,
        message: 'Successfully connected to Google Ads'
      };
    } catch (error: any) {
      logger.error('Google Ads connection test failed', error);
      return {
        success: false,
        message: error.message || 'Connection failed'
      };
    }
  }

  async getCampaigns(): Promise<PlatformCampaign[]> {
    try {
      const customerId = await this.getCustomerId();
      this.customer = this.client.Customer({
        customer_id: customerId,
        refresh_token: this.credentials.refreshToken
      });

      const campaigns = await this.customer.query(`
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign.campaign_budget,
          campaign.start_date,
          campaign.end_date,
          campaign_budget.amount_micros
        FROM campaign
        WHERE campaign.status != 'REMOVED'
        ORDER BY campaign.name
      `);

      return campaigns.map(row => this.mapCampaign(row.campaign, row.campaign_budget));
    } catch (error) {
      logger.error('Failed to fetch Google Ads campaigns', error);
      throw error;
    }
  }

  async getCampaignById(campaignId: string): Promise<PlatformCampaign> {
    try {
      const customerId = await this.getCustomerId();
      this.customer = this.client.Customer({
        customer_id: customerId,
        refresh_token: this.credentials.refreshToken
      });

      const result = await this.customer.query(`
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign.campaign_budget,
          campaign.start_date,
          campaign.end_date,
          campaign_budget.amount_micros
        FROM campaign
        WHERE campaign.id = ${campaignId}
      `);

      if (result.length === 0) {
        throw new Error('Campaign not found');
      }

      return this.mapCampaign(result[0].campaign, result[0].campaign_budget);
    } catch (error) {
      logger.error('Failed to fetch Google Ads campaign', { campaignId, error });
      throw error;
    }
  }

  async createCampaign(campaign: Partial<PlatformCampaign>): Promise<PlatformCampaign> {
    try {
      const customerId = await this.getCustomerId();
      this.customer = this.client.Customer({
        customer_id: customerId,
        refresh_token: this.credentials.refreshToken
      });

      // Create campaign budget first
      const budgetResponse = await this.customer.campaignBudgets.create({
        name: `Budget for ${campaign.name}`,
        amount_micros: Math.round((campaign.budget || 50) * 1000000),
        delivery_method: 'STANDARD'
      });

      // Create campaign
      const campaignResponse = await this.customer.campaigns.create({
        name: campaign.name!,
        status: CampaignStatus.PAUSED,
        advertising_channel_type: this.mapObjectiveToChannelType(campaign.objective),
        campaign_budget: budgetResponse.resource_name,
        start_date: campaign.startDate ? this.formatDate(campaign.startDate) : undefined,
        end_date: campaign.endDate ? this.formatDate(campaign.endDate) : undefined
      });

      return {
        id: campaignResponse.id.toString(),
        name: campaign.name!,
        status: 'PAUSED',
        objective: campaign.objective,
        budget: campaign.budget,
        budgetType: 'DAILY',
        startDate: campaign.startDate,
        endDate: campaign.endDate
      };
    } catch (error) {
      logger.error('Failed to create Google Ads campaign', error);
      throw error;
    }
  }

  async updateCampaign(campaignId: string, updates: Partial<PlatformCampaign>): Promise<PlatformCampaign> {
    try {
      const customerId = await this.getCustomerId();
      this.customer = this.client.Customer({
        customer_id: customerId,
        refresh_token: this.credentials.refreshToken
      });

      const updateOperations: any = {};

      if (updates.name) {
        updateOperations.name = updates.name;
      }

      if (updates.status) {
        updateOperations.status = this.mapStatus(updates.status);
      }

      if (Object.keys(updateOperations).length > 0) {
        await this.customer.campaigns.update({
          resource_name: `customers/${customerId}/campaigns/${campaignId}`,
          ...updateOperations
        });
      }

      return this.getCampaignById(campaignId);
    } catch (error) {
      logger.error('Failed to update Google Ads campaign', { campaignId, error });
      throw error;
    }
  }

  async updateCampaignStatus(campaignId: string, status: string): Promise<void> {
    await this.updateCampaign(campaignId, { status });
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    try {
      const customerId = await this.getCustomerId();
      this.customer = this.client.Customer({
        customer_id: customerId,
        refresh_token: this.credentials.refreshToken
      });

      await this.customer.campaigns.update({
        resource_name: `customers/${customerId}/campaigns/${campaignId}`,
        status: CampaignStatus.REMOVED
      });
    } catch (error) {
      logger.error('Failed to delete Google Ads campaign', { campaignId, error });
      throw error;
    }
  }

  async getCampaignMetrics(
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<PlatformMetric[]> {
    try {
      const customerId = await this.getCustomerId();
      this.customer = this.client.Customer({
        customer_id: customerId,
        refresh_token: this.credentials.refreshToken
      });

      const campaignFilter = campaignIds.length > 0
        ? `AND campaign.id IN (${campaignIds.join(', ')})`
        : '';

      const metrics = await this.customer.query(`
        SELECT
          campaign.id,
          segments.date,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value,
          metrics.video_views,
          metrics.engagements,
          metrics.interaction_rate
        FROM campaign
        WHERE segments.date BETWEEN '${this.formatDate(startDate)}' AND '${this.formatDate(endDate)}'
          ${campaignFilter}
          AND campaign.status != 'REMOVED'
        ORDER BY segments.date DESC
      `);

      return metrics.map(row => this.mapMetrics(row));
    } catch (error) {
      logger.error('Failed to fetch Google Ads metrics', error);
      throw error;
    }
  }

  async getAccountInfo(): Promise<any> {
    try {
      const customerId = await this.getCustomerId();
      this.customer = this.client.Customer({
        customer_id: customerId,
        refresh_token: this.credentials.refreshToken
      });

      const accountInfo = await this.customer.query(`
        SELECT
          customer.id,
          customer.descriptive_name,
          customer.currency_code,
          customer.time_zone
        FROM customer
        WHERE customer.id = ${customerId}
      `);

      return accountInfo[0]?.customer || {};
    } catch (error) {
      logger.error('Failed to fetch Google Ads account info', error);
      throw error;
    }
  }

  private async getCustomerId(): Promise<string> {
    if (this.credentials.customerId) {
      return this.credentials.customerId;
    }

    // Get first accessible customer
    const customers = await this.client.listAccessibleCustomers();
    if (customers.length === 0) {
      throw new Error('No accessible Google Ads accounts found');
    }

    return customers[0];
  }

  private mapCampaign(campaign: any, budget: any): PlatformCampaign {
    return {
      id: campaign.id.toString(),
      name: campaign.name,
      status: this.mapStatusFromGoogle(campaign.status),
      objective: campaign.advertising_channel_type,
      budget: budget?.amount_micros ? budget.amount_micros / 1000000 : undefined,
      budgetType: 'DAILY',
      startDate: campaign.start_date ? this.parseDate(campaign.start_date) : undefined,
      endDate: campaign.end_date ? this.parseDate(campaign.end_date) : undefined
    };
  }

  private mapMetrics(row: any): PlatformMetric {
    const baseMetric: Partial<PlatformMetric> = {
      campaignId: row.campaign.id.toString(),
      date: this.parseDate(row.segments.date),
      impressions: row.metrics.impressions || 0,
      clicks: row.metrics.clicks || 0,
      spend: row.metrics.cost_micros ? row.metrics.cost_micros / 1000000 : 0,
      conversions: row.metrics.conversions || 0,
      videoViews: row.metrics.video_views,
      engagements: row.metrics.engagements,
      platformMetrics: {
        conversionsValue: row.metrics.conversions_value,
        interactionRate: row.metrics.interaction_rate
      }
    };

    return this.calculateDerivedMetrics(baseMetric);
  }

  private mapStatus(status: string): CampaignStatus {
    switch (status.toUpperCase()) {
      case 'ACTIVE':
      case 'ENABLED':
        return CampaignStatus.ENABLED;
      case 'PAUSED':
        return CampaignStatus.PAUSED;
      case 'REMOVED':
      case 'DELETED':
        return CampaignStatus.REMOVED;
      default:
        return CampaignStatus.PAUSED;
    }
  }

  private mapStatusFromGoogle(status: CampaignStatus): string {
    switch (status) {
      case CampaignStatus.ENABLED:
        return 'ACTIVE';
      case CampaignStatus.PAUSED:
        return 'PAUSED';
      case CampaignStatus.REMOVED:
        return 'COMPLETED';
      default:
        return 'DRAFT';
    }
  }

  private mapObjectiveToChannelType(objective?: string): string {
    const objectiveMap: Record<string, string> = {
      'awareness': 'DISPLAY',
      'consideration': 'SEARCH',
      'conversion': 'SHOPPING',
      'app_installs': 'MULTI_CHANNEL',
      'video_views': 'VIDEO'
    };

    return objectiveMap[objective?.toLowerCase() || ''] || 'SEARCH';
  }
}