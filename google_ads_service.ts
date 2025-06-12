import { GoogleAdsApi, Customer, CampaignService, AdGroupService } from 'google-ads-api';
import { logger } from '../utils/logger';
import { DataQualityService } from './data-quality.service';
import { MetricsNormalizer } from '../utils/metrics-normalizer';
import type { 
  IntegrationCredentials, 
  CampaignData, 
  MetricData,
  SyncResult 
} from '../types/integration.types';

export interface GoogleAdsCredentials extends IntegrationCredentials {
  customerId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
}

export interface GoogleAdsMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  qualityScore: number;
}

export class GoogleAdsService {
  private client: GoogleAdsApi;
  private dataQuality: DataQualityService;
  private metricsNormalizer: MetricsNormalizer;

  constructor() {
    this.dataQuality = new DataQualityService();
    this.metricsNormalizer = new MetricsNormalizer();
  }

  /**
   * Initialize Google Ads API client with credentials
   */
  async initialize(credentials: GoogleAdsCredentials): Promise<void> {
    try {
      this.client = new GoogleAdsApi({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        developer_token: credentials.developerToken,
      });

      // Test connection
      const customer = this.client.Customer({
        customer_id: credentials.customerId,
        refresh_token: credentials.refreshToken,
      });

      await customer.query(`
        SELECT customer.id, customer.descriptive_name 
        FROM customer 
        LIMIT 1
      `);

      logger.info(`Google Ads integration initialized for customer: ${credentials.customerId}`);
    } catch (error) {
      logger.error('Failed to initialize Google Ads service:', error);
      throw new Error(`Google Ads initialization failed: ${error.message}`);
    }
  }

  /**
   * Fetch campaigns from Google Ads
   */
  async getCampaigns(credentials: GoogleAdsCredentials): Promise<CampaignData[]> {
    try {
      const customer = this.client.Customer({
        customer_id: credentials.customerId,
        refresh_token: credentials.refreshToken,
      });

      const campaigns = await customer.query(`
        SELECT 
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign.bidding_strategy_type,
          campaign_budget.amount_micros,
          campaign.start_date,
          campaign.end_date,
          campaign.target_cpa.target_cpa_micros,
          campaign.target_roas.target_roas
        FROM campaign
        WHERE campaign.status != 'REMOVED'
        ORDER BY campaign.name
      `);

      const campaignData: CampaignData[] = campaigns.map((campaign: any) => ({
        externalId: campaign.campaign.id.toString(),
        name: campaign.campaign.name,
        status: this.mapCampaignStatus(campaign.campaign.status),
        platform: 'GOOGLE_ADS',
        budget: campaign.campaign_budget?.amount_micros ? 
          parseFloat((campaign.campaign_budget.amount_micros / 1000000).toFixed(2)) : null,
        budgetType: 'DAILY',
        startDate: campaign.campaign.start_date ? new Date(campaign.campaign.start_date) : null,
        endDate: campaign.campaign.end_date ? new Date(campaign.campaign.end_date) : null,
        objective: campaign.campaign.advertising_channel_type,
        targeting: {
          channel_type: campaign.campaign.advertising_channel_type,
          bidding_strategy: campaign.campaign.bidding_strategy_type,
          target_cpa: campaign.campaign.target_cpa?.target_cpa_micros,
          target_roas: campaign.campaign.target_roas?.target_roas
        }
      }));

      // Validate data quality
      const validatedCampaigns = await this.dataQuality.validateCampaigns(campaignData);
      
      logger.info(`Fetched ${validatedCampaigns.length} campaigns from Google Ads`);
      return validatedCampaigns;

    } catch (error) {
      logger.error('Failed to fetch Google Ads campaigns:', error);
      throw new Error(`Failed to fetch campaigns: ${error.message}`);
    }
  }

  /**
   * Fetch campaign metrics from Google Ads
   */
  async getCampaignMetrics(
    credentials: GoogleAdsCredentials,
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<MetricData[]> {
    try {
      const customer = this.client.Customer({
        customer_id: credentials.customerId,
        refresh_token: credentials.refreshToken,
      });

      const dateFormat = 'YYYY-MM-DD';
      const formattedStartDate = startDate.toISOString().split('T')[0];
      const formattedEndDate = endDate.toISOString().split('T')[0];

      const campaignFilter = campaignIds.length > 0 
        ? `AND campaign.id IN (${campaignIds.join(',')})` 
        : '';

      const metrics = await customer.query(`
        SELECT 
          campaign.id,
          campaign.name,
          segments.date,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value,
          metrics.ctr,
          metrics.average_cpc,
          metrics.cost_per_conversion,
          metrics.value_per_conversion,
          metrics.quality_score_info.quality_score
        FROM campaign
        WHERE segments.date BETWEEN '${formattedStartDate}' AND '${formattedEndDate}'
        ${campaignFilter}
        AND campaign.status != 'REMOVED'
        ORDER BY segments.date DESC, campaign.name
      `);

      const metricData: MetricData[] = metrics.map((metric: any) => {
        const costMicros = metric.metrics.cost_micros || 0;
        const cost = parseFloat((costMicros / 1000000).toFixed(2));
        const conversionsValue = metric.metrics.conversions_value || 0;
        const roas = cost > 0 ? conversionsValue / cost : 0;

        return {
          campaignId: metric.campaign.id.toString(),
          date: new Date(metric.segments.date),
          platform: 'GOOGLE_ADS',
          metricType: 'DAILY',
          
          // Core metrics
          impressions: BigInt(metric.metrics.impressions || 0),
          clicks: BigInt(metric.metrics.clicks || 0),
          spend: cost,
          conversions: parseInt(metric.metrics.conversions || 0),
          revenue: parseFloat(conversionsValue.toFixed(2)),
          
          // Calculated metrics
          ctr: parseFloat((metric.metrics.ctr * 100).toFixed(4)),
          cpc: parseFloat(((metric.metrics.average_cpc || 0) / 1000000).toFixed(2)),
          cpm: this.calculateCPM(metric.metrics.impressions, costMicros),
          cpa: parseFloat(((metric.metrics.cost_per_conversion || 0) / 1000000).toFixed(2)),
          roas: parseFloat(roas.toFixed(4)),
          roi: parseFloat(((roas - 1) * 100).toFixed(2)),
          
          // Quality metrics
          qualityScore: metric.metrics.quality_score_info?.quality_score || null,
          
          // Platform-specific data
          platformData: {
            value_per_conversion: metric.metrics.value_per_conversion,
            average_cpc_micros: metric.metrics.average_cpc,
            cost_per_conversion_micros: metric.metrics.cost_per_conversion
          }
        };
      });

      // Normalize and validate metrics
      const normalizedMetrics = await this.metricsNormalizer.normalize(metricData, 'GOOGLE_ADS');
      const validatedMetrics = await this.dataQuality.validateMetrics(normalizedMetrics);

      logger.info(`Fetched ${validatedMetrics.length} metric records from Google Ads`);
      return validatedMetrics;

    } catch (error) {
      logger.error('Failed to fetch Google Ads metrics:', error);
      throw new Error(`Failed to fetch metrics: ${error.message}`);
    }
  }

  /**
   * Update campaign settings (budget, bids, etc.)
   */
  async updateCampaign(
    credentials: GoogleAdsCredentials,
    campaignId: string,
    updates: Partial<CampaignData>
  ): Promise<boolean> {
    try {
      const customer = this.client.Customer({
        customer_id: credentials.customerId,
        refresh_token: credentials.refreshToken,
      });

      const campaign = {
        resource_name: `customers/${credentials.customerId}/campaigns/${campaignId}`,
        ...this.buildCampaignUpdates(updates)
      };

      await customer.campaigns.update([campaign]);
      
      logger.info(`Updated Google Ads campaign ${campaignId}`);
      return true;

    } catch (error) {
      logger.error(`Failed to update Google Ads campaign ${campaignId}:`, error);
      throw new Error(`Failed to update campaign: ${error.message}`);
    }
  }

  /**
   * Pause or resume campaign
   */
  async setCampaignStatus(
    credentials: GoogleAdsCredentials,
    campaignId: string,
    status: 'ACTIVE' | 'PAUSED'
  ): Promise<boolean> {
    try {
      const customer = this.client.Customer({
        customer_id: credentials.customerId,
        refresh_token: credentials.refreshToken,
      });

      const googleAdsStatus = status === 'ACTIVE' ? 'ENABLED' : 'PAUSED';

      const campaign = {
        resource_name: `customers/${credentials.customerId}/campaigns/${campaignId}`,
        status: googleAdsStatus
      };

      await customer.campaigns.update([campaign]);
      
      logger.info(`Set Google Ads campaign ${campaignId} status to ${status}`);
      return true;

    } catch (error) {
      logger.error(`Failed to update campaign ${campaignId} status:`, error);
      throw new Error(`Failed to update campaign status: ${error.message}`);
    }
  }

  /**
   * Test API connection and permissions
   */
  async testConnection(credentials: GoogleAdsCredentials): Promise<{ success: boolean; message: string }> {
    try {
      const customer = this.client.Customer({
        customer_id: credentials.customerId,
        refresh_token: credentials.refreshToken,
      });

      const result = await customer.query(`
        SELECT 
          customer.id, 
          customer.descriptive_name,
          customer.time_zone,
          customer.currency_code
        FROM customer 
        LIMIT 1
      `);

      if (result.length > 0) {
        const customerInfo = result[0].customer;
        return {
          success: true,
          message: `Connected successfully to ${customerInfo.descriptive_name} (ID: ${customerInfo.id})`
        };
      } else {
        return {
          success: false,
          message: 'No customer data found'
        };
      }

    } catch (error) {
      logger.error('Google Ads connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo(credentials: GoogleAdsCredentials): Promise<any> {
    try {
      const customer = this.client.Customer({
        customer_id: credentials.customerId,
        refresh_token: credentials.refreshToken,
      });

      const accountInfo = await customer.query(`
        SELECT 
          customer.id,
          customer.descriptive_name,
          customer.currency_code,
          customer.time_zone,
          customer.tracking_url_template,
          customer.auto_tagging_enabled
        FROM customer
      `);

      return accountInfo[0]?.customer || null;

    } catch (error) {
      logger.error('Failed to fetch Google Ads account info:', error);
      throw new Error(`Failed to fetch account info: ${error.message}`);
    }
  }

  // Helper methods

  private mapCampaignStatus(googleAdsStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'ENABLED': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'REMOVED': 'ENDED',
      'UNKNOWN': 'DRAFT'
    };
    return statusMap[googleAdsStatus] || 'DRAFT';
  }

  private calculateCPM(impressions: number, costMicros: number): number {
    if (!impressions || impressions === 0) return 0;
    const cost = costMicros / 1000000;
    return parseFloat(((cost / impressions) * 1000).toFixed(2));
  }

  private buildCampaignUpdates(updates: Partial<CampaignData>): any {
    const campaignUpdates: any = {};

    if (updates.name) {
      campaignUpdates.name = updates.name;
    }

    if (updates.budget) {
      campaignUpdates.campaign_budget = {
        amount_micros: Math.round(updates.budget * 1000000)
      };
    }

    return campaignUpdates;
  }

  /**
   * Sync campaigns and metrics in a single operation
   */
  async syncData(
    credentials: GoogleAdsCredentials,
    startDate: Date,
    endDate: Date
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let campaignsCount = 0;
    let metricsCount = 0;
    const errors: string[] = [];

    try {
      // Fetch campaigns
      const campaigns = await this.getCampaigns(credentials);
      campaignsCount = campaigns.length;

      // Fetch metrics for all campaigns
      const campaignIds = campaigns.map(c => c.externalId);
      const metrics = await this.getCampaignMetrics(credentials, campaignIds, startDate, endDate);
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
}