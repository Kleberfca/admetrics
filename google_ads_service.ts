// backend/src/services/integrations/google-ads.service.ts
import { GoogleAdsApi, Customer, Campaign, AdGroup, services } from 'google-ads-api';
import { logger } from '../../utils/logger';
import { BaseService } from '../base.service';

export interface GoogleAdsCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  developerToken: string;
}

export interface CampaignData {
  externalId: string;
  name: string;
  status: string;
  budget: number;
  budgetType: 'DAILY' | 'LIFETIME';
  startDate?: Date;
  endDate?: Date;
  objective?: string;
  targeting?: any;
  geoTargeting?: any;
  platform: 'GOOGLE_ADS';
}

export interface MetricData {
  campaignId: string;
  date: Date;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  costPerClick: number;
  clickThroughRate: number;
  conversionRate: number;
  costPerConversion: number;
  returnOnAdSpend: number;
  reach?: number;
  frequency?: number;
  cpm: number;
  platform: 'GOOGLE_ADS';
}

export interface SyncResult {
  success: boolean;
  platform: 'GOOGLE_ADS';
  recordsProcessed: number;
  campaignsCount: number;
  metricsCount: number;
  duration: number;
  errors: string[];
  lastSyncAt: Date;
}

export class GoogleAdsService extends BaseService {
  private client: GoogleAdsApi;
  private customer: Customer;

  constructor() {
    super();
  }

  /**
   * Initialize Google Ads client with credentials
   */
  async initialize(credentials: GoogleAdsCredentials): Promise<void> {
    try {
      this.client = new GoogleAdsApi({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        developer_token: credentials.developerToken,
      });

      this.customer = this.client.Customer({
        customer_id: credentials.customerId,
        refresh_token: credentials.refreshToken,
      });

      logger.info(`Google Ads client initialized for customer: ${credentials.customerId}`);
    } catch (error) {
      logger.error('Failed to initialize Google Ads client:', error);
      throw new Error(`Google Ads initialization failed: ${error.message}`);
    }
  }

  /**
   * Test connection to Google Ads API
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const customerInfo = await this.customer.query(`
        SELECT 
          customer.id,
          customer.descriptive_name,
          customer.time_zone,
          customer.currency_code
        FROM customer
        LIMIT 1
      `);

      if (customerInfo.length > 0) {
        const customer = customerInfo[0].customer;
        return {
          success: true,
          message: `Connected to ${customer.descriptive_name} (${customer.id})`
        };
      }

      return {
        success: false,
        message: 'No customer data found'
      };
    } catch (error) {
      logger.error('Google Ads connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }

  /**
   * Fetch all campaigns
   */
  async getCampaigns(): Promise<CampaignData[]> {
    try {
      const campaigns = await this.customer.query(`
        SELECT 
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.start_date,
          campaign.end_date,
          campaign.advertising_channel_type,
          campaign.campaign_budget,
          campaign_budget.amount_micros,
          campaign_budget.delivery_method
        FROM campaign
        WHERE campaign.status != 'REMOVED'
      `);

      return campaigns.map(row => this.mapCampaignData(row));
    } catch (error) {
      logger.error('Failed to fetch Google Ads campaigns:', error);
      throw new Error(`Failed to fetch campaigns: ${error.message}`);
    }
  }

  /**
   * Get campaign by ID
   */
  async getCampaignById(campaignId: string): Promise<CampaignData | null> {
    try {
      const campaigns = await this.customer.query(`
        SELECT 
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.start_date,
          campaign.end_date,
          campaign.advertising_channel_type,
          campaign.campaign_budget,
          campaign_budget.amount_micros,
          campaign_budget.delivery_method
        FROM campaign
        WHERE campaign.id = ${campaignId}
      `);

      if (campaigns.length === 0) {
        return null;
      }

      return this.mapCampaignData(campaigns[0]);
    } catch (error) {
      logger.error('Failed to fetch Google Ads campaign:', error);
      throw new Error(`Failed to fetch campaign: ${error.message}`);
    }
  }

  /**
   * Create new campaign
   */
  async createCampaign(campaignData: Partial<CampaignData>): Promise<CampaignData> {
    try {
      // First create campaign budget
      const budget = await this.customer.campaigns.createCampaignBudget({
        amount_micros: campaignData.budget ? campaignData.budget * 1000000 : 1000000,
        delivery_method: campaignData.budgetType === 'DAILY' ? 
          services.CampaignBudgetDeliveryMethodEnum.STANDARD : 
          services.CampaignBudgetDeliveryMethodEnum.ACCELERATED,
      });

      // Create campaign
      const campaign = await this.customer.campaigns.create({
        name: campaignData.name!,
        status: services.CampaignStatusEnum.PAUSED,
        advertising_channel_type: services.AdvertisingChannelTypeEnum.SEARCH,
        campaign_budget: budget.resource_name,
        start_date: campaignData.startDate?.toISOString().split('T')[0],
        end_date: campaignData.endDate?.toISOString().split('T')[0],
      });

      logger.info(`Google Ads campaign created: ${campaign.resource_name}`);

      // Return the created campaign data
      return await this.getCampaignById(campaign.resource_name.split('/')[3]);
    } catch (error) {
      logger.error('Failed to create Google Ads campaign:', error);
      throw new Error(`Failed to create campaign: ${error.message}`);
    }
  }

  /**
   * Update campaign
   */
  async updateCampaign(campaignId: string, updates: Partial<CampaignData>): Promise<CampaignData> {
    try {
      const updateObject: any = {};

      if (updates.name) {
        updateObject.name = updates.name;
      }

      if (updates.startDate) {
        updateObject.start_date = updates.startDate.toISOString().split('T')[0];
      }

      if (updates.endDate) {
        updateObject.end_date = updates.endDate.toISOString().split('T')[0];
      }

      await this.customer.campaigns.update({
        resource_name: `customers/${this.customer.credentials.customer_id}/campaigns/${campaignId}`,
        ...updateObject
      });

      logger.info(`Google Ads campaign updated: ${campaignId}`);

      return await this.getCampaignById(campaignId);
    } catch (error) {
      logger.error('Failed to update Google Ads campaign:', error);
      throw new Error(`Failed to update campaign: ${error.message}`);
    }
  }

  /**
   * Pause/Resume campaign
   */
  async updateCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
    try {
      const googleAdsStatus = status === 'ACTIVE' ? 
        services.CampaignStatusEnum.ENABLED : 
        services.CampaignStatusEnum.PAUSED;

      await this.customer.campaigns.update({
        resource_name: `customers/${this.customer.credentials.customer_id}/campaigns/${campaignId}`,
        status: googleAdsStatus
      });

      logger.info(`Google Ads campaign status updated: ${campaignId} -> ${status}`);
    } catch (error) {
      logger.error('Failed to update campaign status:', error);
      throw new Error(`Failed to update campaign status: ${error.message}`);
    }
  }

  /**
   * Delete campaign
   */
  async deleteCampaign(campaignId: string): Promise<void> {
    try {
      await this.customer.campaigns.update({
        resource_name: `customers/${this.customer.credentials.customer_id}/campaigns/${campaignId}`,
        status: services.CampaignStatusEnum.REMOVED
      });

      logger.info(`Google Ads campaign deleted: ${campaignId}`);
    } catch (error) {
      logger.error('Failed to delete Google Ads campaign:', error);
      throw new Error(`Failed to delete campaign: ${error.message}`);
    }
  }

  /**
   * Get campaign metrics for date range
   */
  async getCampaignMetrics(
    campaignIds: string[],
    startDate: Date,
    endDate: Date,
    granularity: 'day' | 'week' | 'month' = 'day'
  ): Promise<MetricData[]> {
    try {
      const dateFormat = granularity === 'day' ? 'segments.date' : 
                        granularity === 'week' ? 'segments.week' : 'segments.month';

      const campaignFilter = campaignIds.length > 0 
        ? `AND campaign.id IN (${campaignIds.join(',')})`
        : '';

      const metrics = await this.customer.query(`
        SELECT 
          campaign.id,
          campaign.name,
          ${dateFormat},
          metrics.cost_micros,
          metrics.clicks,
          metrics.impressions,
          metrics.conversions,
          metrics.average_cpc,
          metrics.ctr,
          metrics.conversions_from_interactions_rate,
          metrics.cost_per_conversion,
          metrics.value_per_conversion,
          metrics.average_cpm
        FROM campaign
        WHERE segments.date BETWEEN '${this.formatDate(startDate)}' AND '${this.formatDate(endDate)}'
        AND campaign.status != 'REMOVED'
        ${campaignFilter}
        ORDER BY segments.date DESC
      `);

      return metrics.map(row => this.mapMetricData(row));
    } catch (error) {
      logger.error('Failed to fetch Google Ads metrics:', error);
      throw new Error(`Failed to fetch metrics: ${error.message}`);
    }
  }

  /**
   * Get keyword performance data
   */
  async getKeywordMetrics(
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    try {
      const campaignFilter = campaignIds.length > 0 
        ? `AND campaign.id IN (${campaignIds.join(',')})`
        : '';

      const keywords = await this.customer.query(`
        SELECT 
          campaign.id,
          campaign.name,
          ad_group.id,
          ad_group.name,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          segments.date,
          metrics.cost_micros,
          metrics.clicks,
          metrics.impressions,
          metrics.conversions,
          metrics.average_cpc,
          metrics.ctr,
          metrics.search_impression_share,
          metrics.search_rank_lost_impression_share
        FROM keyword_view
        WHERE segments.date BETWEEN '${this.formatDate(startDate)}' AND '${this.formatDate(endDate)}'
        AND ad_group_criterion.status = 'ENABLED'
        ${campaignFilter}
        ORDER BY metrics.cost_micros DESC
      `);

      return keywords.map(row => ({
        campaignId: row.campaign.id.toString(),
        campaignName: row.campaign.name,
        adGroupId: row.ad_group.id.toString(),
        adGroupName: row.ad_group.name,
        keyword: row.ad_group_criterion.keyword.text,
        matchType: row.ad_group_criterion.keyword.match_type,
        date: new Date(row.segments.date),
        spend: row.metrics.cost_micros / 1000000,
        clicks: row.metrics.clicks,
        impressions: row.metrics.impressions,
        conversions: row.metrics.conversions,
        cpc: row.metrics.average_cpc / 1000000,
        ctr: row.metrics.ctr,
        impressionShare: row.metrics.search_impression_share,
        rankLostShare: row.metrics.search_rank_lost_impression_share
      }));
    } catch (error) {
      logger.error('Failed to fetch keyword metrics:', error);
      throw new Error(`Failed to fetch keyword metrics: ${error.message}`);
    }
  }

  /**
   * Sync campaigns and metrics
   */
  async syncData(
    startDate: Date,
    endDate: Date
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let campaignsCount = 0;
    let metricsCount = 0;
    const errors: string[] = [];

    try {
      // Fetch campaigns
      const campaigns = await this.getCampaigns();
      campaignsCount = campaigns.length;

      // Fetch metrics for all campaigns
      const campaignIds = campaigns.map(c => c.externalId);
      const metrics = await this.getCampaignMetrics(campaignIds, startDate, endDate);
      metricsCount = metrics.length;

      const duration = Date.now() - startTime;

      return {
        success: true,
        platform: 'GOOGLE_ADS',
        recordsProcessed: campaignsCount + metricsCount,
        campaignsCount,
        metricsCount,
        duration,
        errors,
        lastSyncAt: new Date()
      };

    } catch (error) {
      errors.push(error.message);
      return {
        success: false,
        platform: 'GOOGLE_ADS',
        recordsProcessed: campaignsCount + metricsCount,
        campaignsCount,
        metricsCount,
        duration: Date.now() - startTime,
        errors,
        lastSyncAt: new Date()
      };
    }
  }

  // Helper methods

  private mapCampaignData(row: any): CampaignData {
    return {
      externalId: row.campaign.id.toString(),
      name: row.campaign.name,
      status: this.mapCampaignStatus(row.campaign.status),
      budget: row.campaign_budget ? row.campaign_budget.amount_micros / 1000000 : 0,
      budgetType: row.campaign_budget?.delivery_method === 'STANDARD' ? 'DAILY' : 'LIFETIME',
      startDate: row.campaign.start_date ? new Date(row.campaign.start_date) : undefined,
      endDate: row.campaign.end_date ? new Date(row.campaign.end_date) : undefined,
      objective: row.campaign.advertising_channel_type,
      platform: 'GOOGLE_ADS'
    };
  }

  private mapMetricData(row: any): MetricData {
    const spend = row.metrics.cost_micros / 1000000;
    const clicks = row.metrics.clicks;
    const impressions = row.metrics.impressions;
    const conversions = row.metrics.conversions;

    return {
      campaignId: row.campaign.id.toString(),
      date: new Date(row.segments.date || row.segments.week || row.segments.month),
      spend,
      clicks,
      impressions,
      conversions,
      costPerClick: row.metrics.average_cpc / 1000000,
      clickThroughRate: row.metrics.ctr,
      conversionRate: row.metrics.conversions_from_interactions_rate,
      costPerConversion: row.metrics.cost_per_conversion / 1000000,
      returnOnAdSpend: conversions > 0 ? (row.metrics.value_per_conversion / 1000000) / spend : 0,
      cpm: row.metrics.average_cpm / 1000000,
      platform: 'GOOGLE_ADS'
    };
  }

  private mapCampaignStatus(googleStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'ENABLED': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'REMOVED': 'ENDED'
    };
    return statusMap[googleStatus] || 'DRAFT';
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}