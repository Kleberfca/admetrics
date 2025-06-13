import { GoogleAdsApi, enums } from 'google-ads-api';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { logger } from '../../utils/logger';
import { BasePlatformService } from './base-platform.service';
import { 
  PlatformCredentials, 
  CampaignData, 
  MetricData, 
  DateRange,
  SyncResult 
} from '../../types/platform.types';
import { rateLimitDecorator } from '../../utils/rate-limiter';
import { encryptCredentials, decryptCredentials } from '../../utils/encryption';

interface GoogleAdsCredentials extends PlatformCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  customerId: string;
  managerCustomerId?: string;
}

interface GoogleAdsConfig {
  includeZeroImpressions?: boolean;
  maxRetries?: number;
  requestTimeout?: number;
  reportSegments?: string[];
}

export class GoogleAdsService extends BasePlatformService {
  private client: GoogleAdsApi | null = null;
  private credentials: GoogleAdsCredentials | null = null;
  private config: GoogleAdsConfig;
  private customerId: string | null = null;

  constructor(prisma: PrismaClient, redis: Redis) {
    super('GOOGLE_ADS', prisma, redis);
    
    this.config = {
      includeZeroImpressions: false,
      maxRetries: 3,
      requestTimeout: 30000,
      reportSegments: ['DEVICE', 'AD_NETWORK_TYPE', 'KEYWORD'],
    };
  }

  /**
   * Initialize Google Ads API client with credentials
   */
  async initialize(credentials: GoogleAdsCredentials, config?: GoogleAdsConfig): Promise<void> {
    try {
      this.credentials = credentials;
      this.customerId = credentials.customerId;
      this.config = { ...this.config, ...config };

      // Decrypt credentials if they're encrypted
      const decryptedCredentials = await this.decryptCredentialsIfNeeded(credentials);

      this.client = new GoogleAdsApi({
        client_id: decryptedCredentials.clientId,
        client_secret: decryptedCredentials.clientSecret,
        developer_token: decryptedCredentials.developerToken,
      });

      // Test connection
      await this.testConnection();
      
      logger.info('Google Ads service initialized successfully', {
        customerId: this.customerId,
      });
    } catch (error) {
      logger.error('Failed to initialize Google Ads service:', error);
      throw new Error(`Google Ads initialization failed: ${error.message}`);
    }
  }

  /**
   * Test the connection to Google Ads API
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.client || !this.customerId || !this.credentials) {
        throw new Error('Google Ads service not initialized');
      }

      const customer = this.client.Customer({
        customer_id: this.customerId,
        refresh_token: this.credentials.refreshToken,
      });

      // Simple query to test connection
      const response = await customer.query(`
        SELECT 
          customer.id,
          customer.descriptive_name,
          customer.currency_code,
          customer.time_zone
        FROM customer
        LIMIT 1
      `);

      if (response.length > 0) {
        const customerInfo = response[0].customer;
        
        logger.info('Google Ads connection test successful', {
          customerId: customerInfo.id,
          name: customerInfo.descriptive_name,
          currency: customerInfo.currency_code,
          timezone: customerInfo.time_zone,
        });

        return {
          success: true,
          message: `Connected successfully to ${customerInfo.descriptive_name} (${customerInfo.id})`,
        };
      } else {
        throw new Error('No customer data returned');
      }
    } catch (error) {
      logger.error('Google Ads connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Get all campaigns from Google Ads
   */
  @rateLimitDecorator(100, 60) // 100 requests per minute
  async getCampaigns(): Promise<CampaignData[]> {
    try {
      if (!this.client || !this.customerId || !this.credentials) {
        throw new Error('Google Ads service not initialized');
      }

      const customer = this.client.Customer({
        customer_id: this.customerId,
        refresh_token: this.credentials.refreshToken,
      });

      const query = `
        SELECT 
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign.start_date,
          campaign.end_date,
          campaign_budget.amount_micros,
          campaign.target_cpa.target_cpa_micros,
          campaign.target_roas.target_roas,
          campaign.bidding_strategy_type
        FROM campaign
        WHERE campaign.status != 'REMOVED'
        ORDER BY campaign.name
      `;

      const campaigns = await customer.query(query);

      return campaigns.map((campaign): CampaignData => ({
        id: campaign.campaign.id.toString(),
        externalId: campaign.campaign.id.toString(),
        name: campaign.campaign.name,
        status: this.mapCampaignStatus(campaign.campaign.status),
        platform: 'GOOGLE_ADS',
        type: this.mapCampaignType(campaign.campaign.advertising_channel_type),
        budget: campaign.campaign_budget?.amount_micros 
          ? campaign.campaign_budget.amount_micros / 1000000 
          : 0,
        bidStrategy: campaign.campaign.bidding_strategy_type,
        targetCpa: campaign.campaign.target_cpa?.target_cpa_micros
          ? campaign.campaign.target_cpa.target_cpa_micros / 1000000
          : null,
        targetRoas: campaign.campaign.target_roas?.target_roas || null,
        startDate: campaign.campaign.start_date,
        endDate: campaign.campaign.end_date,
        settings: {
          advertisingChannelType: campaign.campaign.advertising_channel_type,
          biddingStrategyType: campaign.campaign.bidding_strategy_type,
        },
        lastSyncAt: new Date(),
      }));
    } catch (error) {
      logger.error('Error fetching Google Ads campaigns:', error);
      throw new Error(`Failed to fetch campaigns: ${error.message}`);
    }
  }

  /**
   * Get campaign metrics for specified campaigns and date range
   */
  @rateLimitDecorator(50, 60) // 50 requests per minute for metrics
  async getCampaignMetrics(
    campaignIds: string[],
    dateRange: DateRange,
    granularity: 'DAY' | 'WEEK' | 'MONTH' = 'DAY'
  ): Promise<MetricData[]> {
    try {
      if (!this.client || !this.customerId || !this.credentials) {
        throw new Error('Google Ads service not initialized');
      }

      const customer = this.client.Customer({
        customer_id: this.customerId,
        refresh_token: this.credentials.refreshToken,
      });

      const campaignFilter = campaignIds.length > 0 
        ? `AND campaign.id IN (${campaignIds.join(',')})`
        : '';

      const dateFilter = `
        AND segments.date >= '${this.formatDate(dateRange.startDate)}'
        AND segments.date <= '${this.formatDate(dateRange.endDate)}'
      `;

      const query = `
        SELECT 
          campaign.id,
          campaign.name,
          segments.date,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value,
          metrics.view_through_conversions,
          metrics.ctr,
          metrics.average_cpc,
          metrics.average_cpm,
          metrics.cost_per_conversion,
          metrics.value_per_conversion,
          metrics.bounce_rate,
          metrics.percent_new_visitors
        FROM campaign
        WHERE campaign.status != 'REMOVED'
        ${campaignFilter}
        ${dateFilter}
        ORDER BY segments.date DESC, campaign.name
      `;

      const results = await customer.query(query);

      return results.map((row): MetricData => ({
        campaignId: row.campaign.id.toString(),
        campaignName: row.campaign.name,
        platform: 'GOOGLE_ADS',
        date: row.segments.date,
        metrics: {
          spend: row.metrics.cost_micros / 1000000,
          impressions: row.metrics.impressions,
          clicks: row.metrics.clicks,
          conversions: row.metrics.conversions,
          conversionValue: row.metrics.conversions_value,
          viewThroughConversions: row.metrics.view_through_conversions,
          ctr: row.metrics.ctr * 100, // Convert to percentage
          cpc: row.metrics.average_cpc / 1000000,
          cpm: row.metrics.average_cpm / 1000000,
          costPerConversion: row.metrics.cost_per_conversion / 1000000,
          valuePerConversion: row.metrics.value_per_conversion,
          bounceRate: row.metrics.bounce_rate * 100,
          roas: row.metrics.conversions_value / (row.metrics.cost_micros / 1000000),
          conversionRate: (row.metrics.conversions / row.metrics.clicks) * 100,
        },
        dimensions: {
          date: row.segments.date,
        },
      }));
    } catch (error) {
      logger.error('Error fetching Google Ads metrics:', error);
      throw new Error(`Failed to fetch metrics: ${error.message}`);
    }
  }

  /**
   * Get account structure (campaigns, ad groups, ads)
   */
  async getAccountStructure(): Promise<any> {
    try {
      if (!this.client || !this.customerId || !this.credentials) {
        throw new Error('Google Ads service not initialized');
      }

      const customer = this.client.Customer({
        customer_id: this.customerId,
        refresh_token: this.credentials.refreshToken,
      });

      const [campaigns, adGroups, ads] = await Promise.all([
        this.getCampaigns(),
        this.getAdGroups(),
        this.getAds(),
      ]);

      return {
        campaigns: campaigns.length,
        adGroups: adGroups.length,
        ads: ads.length,
        structure: campaigns.map(campaign => ({
          campaign,
          adGroups: adGroups.filter(ag => ag.campaignId === campaign.id),
          ads: ads.filter(ad => ad.campaignId === campaign.id),
        })),
      };
    } catch (error) {
      logger.error('Error fetching Google Ads account structure:', error);
      throw error;
    }
  }

  /**
   * Get ad groups for all campaigns
   */
  private async getAdGroups(): Promise<any[]> {
    if (!this.client || !this.customerId || !this.credentials) {
      throw new Error('Google Ads service not initialized');
    }

    const customer = this.client.Customer({
      customer_id: this.customerId,
      refresh_token: this.credentials.refreshToken,
    });

    const query = `
      SELECT 
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.type,
        ad_group.campaign,
        ad_group.cpc_bid_micros,
        ad_group.cpm_bid_micros,
        ad_group.target_cpa_micros
      FROM ad_group
      WHERE ad_group.status != 'REMOVED'
      ORDER BY ad_group.name
    `;

    const results = await customer.query(query);

    return results.map(row => ({
      id: row.ad_group.id.toString(),
      name: row.ad_group.name,
      status: row.ad_group.status,
      type: row.ad_group.type,
      campaignId: row.ad_group.campaign.split('/').pop(),
      cpcBid: row.ad_group.cpc_bid_micros / 1000000,
      cpmBid: row.ad_group.cpm_bid_micros / 1000000,
      targetCpa: row.ad_group.target_cpa_micros / 1000000,
    }));
  }

  /**
   * Get ads for all campaigns
   */
  private async getAds(): Promise<any[]> {
    if (!this.client || !this.customerId || !this.credentials) {
      throw new Error('Google Ads service not initialized');
    }

    const customer = this.client.Customer({
      customer_id: this.customerId,
      refresh_token: this.credentials.refreshToken,
    });

    const query = `
      SELECT 
        ad_group_ad.ad.id,
        ad_group_ad.ad.type,
        ad_group_ad.status,
        ad_group_ad.ad_group,
        campaign.id
      FROM ad_group_ad
      WHERE ad_group_ad.status != 'REMOVED'
    `;

    const results = await customer.query(query);

    return results.map(row => ({
      id: row.ad_group_ad.ad.id.toString(),
      type: row.ad_group_ad.ad.type,
      status: row.ad_group_ad.status,
      adGroupId: row.ad_group_ad.ad_group.split('/').pop(),
      campaignId: row.campaign.id.toString(),
    }));
  }

  /**
   * Sync all data from Google Ads
   */
  async syncData(integrationId: string): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCampaigns = 0;
    let syncedMetrics = 0;
    const errors: string[] = [];

    try {
      logger.info('Starting Google Ads data sync', { integrationId });

      // Get date range for sync (last 7 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 7);

      // Sync campaigns
      try {
        const campaigns = await this.getCampaigns();
        await this.storeCampaigns(integrationId, campaigns);
        syncedCampaigns = campaigns.length;
      } catch (error) {
        errors.push(`Campaign sync failed: ${error.message}`);
      }

      // Sync metrics
      try {
        const campaigns = await this.getCampaigns();
        const campaignIds = campaigns.map(c => c.id);
        
        if (campaignIds.length > 0) {
          const metrics = await this.getCampaignMetrics(campaignIds, { startDate, endDate });
          await this.storeMetrics(integrationId, metrics);
          syncedMetrics = metrics.length;
        }
      } catch (error) {
        errors.push(`Metrics sync failed: ${error.message}`);
      }

      // Update integration sync status
      await this.updateIntegrationSyncStatus(integrationId, {
        lastSyncAt: new Date(),
        syncStatus: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
        errorCount: errors.length,
        lastError: errors.length > 0 ? errors[0] : null,
      });

      const duration = Date.now() - startTime;

      logger.info('Google Ads sync completed', {
        integrationId,
        duration,
        syncedCampaigns,
        syncedMetrics,
        errors: errors.length,
      });

      return {
        success: errors.length === 0,
        duration,
        syncedRecords: {
          campaigns: syncedCampaigns,
          metrics: syncedMetrics,
        },
        errors,
      };
    } catch (error) {
      logger.error('Google Ads sync failed:', error);
      
      await this.updateIntegrationSyncStatus(integrationId, {
        lastSyncAt: new Date(),
        syncStatus: 'FAILED',
        errorCount: 1,
        lastError: error.message,
      });

      return {
        success: false,
        duration: Date.now() - startTime,
        syncedRecords: {
          campaigns: syncedCampaigns,
          metrics: syncedMetrics,
        },
        errors: [error.message],
      };
    }
  }

  /**
   * Get available metrics for Google Ads
   */
  getAvailableMetrics(): string[] {
    return [
      'spend',
      'impressions',
      'clicks',
      'conversions',
      'conversionValue',
      'viewThroughConversions',
      'ctr',
      'cpc',
      'cpm',
      'costPerConversion',
      'valuePerConversion',
      'roas',
      'conversionRate',
      'bounceRate',
      'searchImpressionShare',
      'searchExactMatchImpressionShare',
      'searchBudgetLostImpressionShare',
      'searchRankLostImpressionShare',
      'qualityScore',
    ];
  }

  /**
   * Get rate limits for Google Ads API
   */
  getRateLimits(): { requests: number; window: number } {
    return {
      requests: 10000, // 10,000 requests per day
      window: 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  /**
   * Private helper methods
   */
  private async decryptCredentialsIfNeeded(credentials: GoogleAdsCredentials): Promise<GoogleAdsCredentials> {
    if (credentials.clientSecret.startsWith('encrypted:')) {
      return {
        ...credentials,
        clientSecret: await decryptCredentials(credentials.clientSecret.replace('encrypted:', '')),
        refreshToken: await decryptCredentials(credentials.refreshToken.replace('encrypted:', '')),
        developerToken: await decryptCredentials(credentials.developerToken.replace('encrypted:', '')),
      };
    }
    return credentials;
  }

  private mapCampaignStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'ENABLED': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'REMOVED': 'DELETED',
    };
    return statusMap[status] || status;
  }

  private mapCampaignType(channelType: string): string {
    const typeMap: { [key: string]: string } = {
      'SEARCH': 'SEARCH',
      'DISPLAY': 'DISPLAY',
      'SHOPPING': 'SHOPPING',
      'VIDEO': 'VIDEO',
      'MULTI_CHANNEL': 'MULTI_CHANNEL',
      'LOCAL': 'LOCAL',
      'SMART': 'SMART',
      'PERFORMANCE_MAX': 'PERFORMANCE_MAX',
    };
    return typeMap[channelType] || channelType;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private async storeCampaigns(integrationId: string, campaigns: CampaignData[]): Promise<void> {
    // Implementation would store campaigns in the database
    // This is a simplified version
    for (const campaign of campaigns) {
      await this.prisma.campaign.upsert({
        where: {
          externalId_platform: {
            externalId: campaign.externalId,
            platform: campaign.platform,
          },
        },
        update: {
          name: campaign.name,
          status: campaign.status,
          budget: campaign.budget,
          settings: campaign.settings,
          lastSyncAt: new Date(),
        },
        create: {
          externalId: campaign.externalId,
          name: campaign.name,
          platform: campaign.platform,
          status: campaign.status,
          type: campaign.type,
          budget: campaign.budget,
          settings: campaign.settings,
          integrationId,
          lastSyncAt: new Date(),
        },
      });
    }
  }

  private async storeMetrics(integrationId: string, metrics: MetricData[]): Promise<void> {
    // Implementation would store metrics in the database
    // This would typically be done in batches for performance
    const batchSize = 100;
    
    for (let i = 0; i < metrics.length; i += batchSize) {
      const batch = metrics.slice(i, i + batchSize);
      
      await this.prisma.$transaction(
        batch.map(metric => 
          this.prisma.campaignMetric.upsert({
            where: {
              campaignId_date_platform: {
                campaignId: metric.campaignId,
                date: new Date(metric.date),
                platform: metric.platform,
              },
            },
            update: {
              metrics: metric.metrics,
              lastSyncAt: new Date(),
            },
            create: {
              campaignId: metric.campaignId,
              platform: metric.platform,
              date: new Date(metric.date),
              metrics: metric.metrics,
              lastSyncAt: new Date(),
            },
          })
        )
      );
    }
  }

  private async updateIntegrationSyncStatus(
    integrationId: string,
    status: {
      lastSyncAt: Date;
      syncStatus: string;
      errorCount: number;
      lastError: string | null;
    }
  ): Promise<void> {
    await this.prisma.integration.update({
      where: { id: integrationId },
      data: {
        lastSyncAt: status.lastSyncAt,
        errorCount: status.errorCount,
        lastError: status.lastError,
      },
    });
  }
}

export default GoogleAdsService;