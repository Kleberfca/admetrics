import { FacebookAdsApi, AdAccount, Campaign, AdSet, Ad } from 'facebook-nodejs-business-sdk';
import { logger } from '../utils/logger';
import { DataQualityService } from './data-quality.service';
import { MetricsNormalizer } from '../utils/metrics-normalizer';
import type { 
  IntegrationCredentials, 
  CampaignData, 
  MetricData,
  SyncResult 
} from '../types/integration.types';

export interface FacebookAdsCredentials extends IntegrationCredentials {
  accessToken: string;
  accountId: string;
  appId: string;
  appSecret: string;
}

export interface FacebookAdsMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  frequency: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cpl: number;
  roas: number;
  purchases: number;
  purchaseValue: number;
}

export class FacebookAdsService {
  private api: typeof FacebookAdsApi;
  private dataQuality: DataQualityService;
  private metricsNormalizer: MetricsNormalizer;

  constructor() {
    this.dataQuality = new DataQualityService();
    this.metricsNormalizer = new MetricsNormalizer();
  }

  /**
   * Initialize Facebook Ads API
   */
  async initialize(credentials: FacebookAdsCredentials): Promise<void> {
    try {
      this.api = FacebookAdsApi.init(credentials.accessToken);
      this.api.setDebug(process.env.NODE_ENV === 'development');

      // Test connection
      const account = new AdAccount(`act_${credentials.accountId}`);
      await account.read(['name', 'account_status', 'currency', 'timezone_name']);

      logger.info(`Facebook Ads integration initialized for account: ${credentials.accountId}`);
    } catch (error) {
      logger.error('Failed to initialize Facebook Ads service:', error);
      throw new Error(`Facebook Ads initialization failed: ${error.message}`);
    }
  }

  /**
   * Fetch campaigns from Facebook Ads
   */
  async getCampaigns(credentials: FacebookAdsCredentials): Promise<CampaignData[]> {
    try {
      const account = new AdAccount(`act_${credentials.accountId}`);
      
      const campaigns = await account.getCampaigns([
        'id',
        'name',
        'status',
        'objective',
        'created_time',
        'start_time',
        'stop_time',
        'daily_budget',
        'lifetime_budget',
        'budget_remaining',
        'bid_strategy',
        'optimization_goal',
        'targeting'
      ]);

      const campaignData: CampaignData[] = campaigns.map((campaign: any) => {
        const dailyBudget = campaign.daily_budget ? parseFloat((campaign.daily_budget / 100).toFixed(2)) : null;
        const lifetimeBudget = campaign.lifetime_budget ? parseFloat((campaign.lifetime_budget / 100).toFixed(2)) : null;

        return {
          externalId: campaign.id,
          name: campaign.name,
          status: this.mapCampaignStatus(campaign.status),
          platform: 'FACEBOOK_ADS',
          budget: dailyBudget || lifetimeBudget,
          budgetType: dailyBudget ? 'DAILY' : 'LIFETIME',
          startDate: campaign.start_time ? new Date(campaign.start_time) : null,
          endDate: campaign.stop_time ? new Date(campaign.stop_time) : null,
          objective: campaign.objective,
          targeting: {
            optimization_goal: campaign.optimization_goal,
            bid_strategy: campaign.bid_strategy,
            targeting_spec: campaign.targeting
          },
          creatives: null // Will be fetched separately if needed
        };
      });

      // Validate data quality
      const validatedCampaigns = await this.dataQuality.validateCampaigns(campaignData);
      
      logger.info(`Fetched ${validatedCampaigns.length} campaigns from Facebook Ads`);
      return validatedCampaigns;

    } catch (error) {
      logger.error('Failed to fetch Facebook Ads campaigns:', error);
      throw new Error(`Failed to fetch campaigns: ${error.message}`);
    }
  }

  /**
   * Fetch campaign metrics from Facebook Ads
   */
  async getCampaignMetrics(
    credentials: FacebookAdsCredentials,
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<MetricData[]> {
    try {
      const account = new AdAccount(`act_${credentials.accountId}`);
      
      const dateFormat = 'YYYY-MM-DD';
      const formattedStartDate = startDate.toISOString().split('T')[0];
      const formattedEndDate = endDate.toISOString().split('T')[0];

      // Build insights parameters
      const params = {
        time_range: {
          since: formattedStartDate,
          until: formattedEndDate
        },
        level: 'campaign',
        breakdowns: ['date'],
        fields: [
          'campaign_id',
          'campaign_name',
          'impressions',
          'clicks',
          'spend',
          'reach',
          'frequency',
          'cpm',
          'cpc',
          'ctr',
          'cost_per_unique_click',
          'cost_per_action_type',
          'actions',
          'action_values',
          'conversions',
          'conversion_values'
        ]
      };

      // Add campaign filter if specific campaigns requested
      if (campaignIds && campaignIds.length > 0) {
        params['filtering'] = [
          {
            field: 'campaign.id',
            operator: 'IN',
            value: campaignIds
          }
        ];
      }

      const insights = await account.getInsights([], params);

      const metricData: MetricData[] = insights.map((insight: any) => {
        const spend = parseFloat(insight.spend || 0);
        const impressions = parseInt(insight.impressions || 0);
        const clicks = parseInt(insight.clicks || 0);
        
        // Calculate ROAS from purchase actions
        const purchaseActions = insight.actions?.find((action: any) => action.action_type === 'purchase') || {};
        const purchaseValues = insight.action_values?.find((value: any) => value.action_type === 'purchase') || {};
        const purchaseValue = parseFloat(purchaseValues.value || 0);
        const roas = spend > 0 ? purchaseValue / spend : 0;

        // Calculate CPL (Cost Per Lead)
        const leadActions = insight.actions?.find((action: any) => action.action_type === 'lead') || {};
        const leads = parseInt(leadActions.value || 0);
        const cpl = leads > 0 ? spend / leads : 0;

        return {
          campaignId: insight.campaign_id,
          date: new Date(insight.date_start),
          platform: 'FACEBOOK_ADS',
          metricType: 'DAILY',
          
          // Core metrics
          impressions: BigInt(impressions),
          clicks: BigInt(clicks),
          spend: spend,
          conversions: parseInt(insight.conversions || purchaseActions.value || 0),
          revenue: purchaseValue,
          
          // Calculated metrics
          ctr: parseFloat((insight.ctr || 0).toFixed(4)),
          cpc: parseFloat((insight.cpc || 0).toFixed(2)),
          cpm: parseFloat((insight.cpm || 0).toFixed(2)),
          cpa: parseFloat((insight.cost_per_action_type?.find((cpa: any) => cpa.action_type === 'purchase')?.value || 0).toFixed(2)),
          roas: parseFloat(roas.toFixed(4)),
          roi: parseFloat(((roas - 1) * 100).toFixed(2)),
          
          // Platform-specific metrics
          platformData: {
            reach: parseInt(insight.reach || 0),
            frequency: parseFloat(insight.frequency || 0),
            cost_per_unique_click: parseFloat(insight.cost_per_unique_click || 0),
            cpl: parseFloat(cpl.toFixed(2)),
            leads: leads,
            all_actions: insight.actions,
            all_action_values: insight.action_values
          }
        };
      });

      // Normalize and validate metrics
      const normalizedMetrics = await this.metricsNormalizer.normalize(metricData, 'FACEBOOK_ADS');
      const validatedMetrics = await this.dataQuality.validateMetrics(normalizedMetrics);

      logger.info(`Fetched ${validatedMetrics.length} metric records from Facebook Ads`);
      return validatedMetrics;

    } catch (error) {
      logger.error('Failed to fetch Facebook Ads metrics:', error);
      throw new Error(`Failed to fetch metrics: ${error.message}`);
    }
  }

  /**
   * Update campaign settings
   */
  async updateCampaign(
    credentials: FacebookAdsCredentials,
    campaignId: string,
    updates: Partial<CampaignData>
  ): Promise<boolean> {
    try {
      const campaign = new Campaign(campaignId);
      const updateParams = this.buildCampaignUpdates(updates);
      
      await campaign.update(updateParams);
      
      logger.info(`Updated Facebook Ads campaign ${campaignId}`);
      return true;

    } catch (error) {
      logger.error(`Failed to update Facebook Ads campaign ${campaignId}:`, error);
      throw new Error(`Failed to update campaign: ${error.message}`);
    }
  }

  /**
   * Pause or resume campaign
   */
  async setCampaignStatus(
    credentials: FacebookAdsCredentials,
    campaignId: string,
    status: 'ACTIVE' | 'PAUSED'
  ): Promise<boolean> {
    try {
      const campaign = new Campaign(campaignId);
      const facebookStatus = status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';
      
      await campaign.update([Campaign.Fields.status], {
        [Campaign.Fields.status]: facebookStatus
      });
      
      logger.info(`Set Facebook Ads campaign ${campaignId} status to ${status}`);
      return true;

    } catch (error) {
      logger.error(`Failed to update campaign ${campaignId} status:`, error);
      throw new Error(`Failed to update campaign status: ${error.message}`);
    }
  }

  /**
   * Test API connection and permissions
   */
  async testConnection(credentials: FacebookAdsCredentials): Promise<{ success: boolean; message: string }> {
    try {
      const account = new AdAccount(`act_${credentials.accountId}`);
      const accountData = await account.read([
        'name', 
        'account_status', 
        'currency', 
        'timezone_name',
        'business'
      ]);

      if (accountData) {
        return {
          success: true,
          message: `Connected successfully to ${accountData.name} (Status: ${accountData.account_status})`
        };
      } else {
        return {
          success: false,
          message: 'No account data found'
        };
      }

    } catch (error) {
      logger.error('Facebook Ads connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo(credentials: FacebookAdsCredentials): Promise<any> {
    try {
      const account = new AdAccount(`act_${credentials.accountId}`);
      const accountInfo = await account.read([
        'id',
        'name',
        'account_status',
        'currency',
        'timezone_name',
        'business',
        'created_time',
        'funding_source',
        'spend_cap'
      ]);

      return accountInfo;

    } catch (error) {
      logger.error('Failed to fetch Facebook Ads account info:', error);
      throw new Error(`Failed to fetch account info: ${error.message}`);
    }
  }

  /**
   * Get ad sets for a campaign
   */
  async getAdSets(credentials: FacebookAdsCredentials, campaignId: string): Promise<any[]> {
    try {
      const campaign = new Campaign(campaignId);
      const adSets = await campaign.getAdSets([
        'id',
        'name',
        'status',
        'billing_event',
        'optimization_goal',
        'bid_amount',
        'daily_budget',
        'lifetime_budget',
        'targeting'
      ]);

      return adSets;

    } catch (error) {
      logger.error(`Failed to fetch ad sets for campaign ${campaignId}:`, error);
      throw new Error(`Failed to fetch ad sets: ${error.message}`);
    }
  }

  /**
   * Get ads for an ad set
   */
  async getAds(credentials: FacebookAdsCredentials, adSetId: string): Promise<any[]> {
    try {
      const adSet = new AdSet(adSetId);
      const ads = await adSet.getAds([
        'id',
        'name',
        'status',
        'creative',
        'bid_amount',
        'source_ad_id'
      ]);

      return ads;

    } catch (error) {
      logger.error(`Failed to fetch ads for ad set ${adSetId}:`, error);
      throw new Error(`Failed to fetch ads: ${error.message}`);
    }
  }

  // Helper methods

  private mapCampaignStatus(facebookStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'ACTIVE': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'DELETED': 'ENDED',
      'ARCHIVED': 'ENDED'
    };
    return statusMap[facebookStatus] || 'DRAFT';
  }

  private buildCampaignUpdates(updates: Partial<CampaignData>): any {
    const campaignUpdates: any = {};

    if (updates.name) {
      campaignUpdates[Campaign.Fields.name] = updates.name;
    }

    if (updates.budget) {
      if (updates.budgetType === 'DAILY') {
        campaignUpdates[Campaign.Fields.daily_budget] = Math.round(updates.budget * 100);
      } else {
        campaignUpdates[Campaign.Fields.lifetime_budget] = Math.round(updates.budget * 100);
      }
    }

    if (updates.startDate) {
      campaignUpdates[Campaign.Fields.start_time] = updates.startDate.toISOString();
    }

    if (updates.endDate) {
      campaignUpdates[Campaign.Fields.stop_time] = updates.endDate.toISOString();
    }

    return campaignUpdates;
  }

  /**
   * Get audience insights for targeting optimization
   */
  async getAudienceInsights(
    credentials: FacebookAdsCredentials,
    targetingSpec: any
  ): Promise<any> {
    try {
      const account = new AdAccount(`act_${credentials.accountId}`);
      
      const insights = await account.getInsights([], {
        targeting: targetingSpec,
        level: 'campaign',
        fields: [
          'impressions',
          'reach',
          'frequency',
          'cpm',
          'cpc',
          'ctr'
        ]
      });

      return insights;

    } catch (error) {
      logger.error('Failed to fetch audience insights:', error);
      throw new Error(`Failed to fetch audience insights: ${error.message}`);
    }
  }

  /**
   * Sync campaigns and metrics in a single operation
   */
  async syncData(
    credentials: FacebookAdsCredentials,
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
        platform: 'FACEBOOK_ADS',
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
        platform: 'FACEBOOK_ADS',
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