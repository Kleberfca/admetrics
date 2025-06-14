export interface PlatformCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  budget?: number;
  budgetType?: string;
  startDate?: Date;
  endDate?: Date;
  targeting?: any;
  creatives?: any[];
}

export interface PlatformMetric {
  campaignId: string;
  date: Date;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  reach?: number;
  frequency?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpa?: number;
  roas?: number;
  conversionRate?: number;
  videoViews?: number;
  videoCompletions?: number;
  engagements?: number;
  leads?: number;
  platformMetrics?: any;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface PlatformService {
  /**
   * Test connection to the platform
   */
  testConnection(): Promise<{ success: boolean; message: string }>;

  /**
   * Get all campaigns
   */
  getCampaigns(): Promise<PlatformCampaign[]>;

  /**
   * Get campaign by ID
   */
  getCampaignById(campaignId: string): Promise<PlatformCampaign>;

  /**
   * Create a new campaign
   */
  createCampaign(campaign: Partial<PlatformCampaign>): Promise<PlatformCampaign>;

  /**
   * Update campaign
   */
  updateCampaign(campaignId: string, updates: Partial<PlatformCampaign>): Promise<PlatformCampaign>;

  /**
   * Update campaign status
   */
  updateCampaignStatus(campaignId: string, status: string): Promise<void>;

  /**
   * Delete campaign
   */
  deleteCampaign(campaignId: string): Promise<void>;

  /**
   * Get campaign metrics
   */
  getCampaignMetrics(
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<PlatformMetric[]>;

  /**
   * Get account info
   */
  getAccountInfo(): Promise<any>;

  /**
   * Refresh access token if needed
   */
  refreshAccessToken?(): Promise<void>;
}

export abstract class BasePlatformService implements PlatformService {
  protected credentials: any;
  protected rateLimiter: any;

  constructor(credentials: any) {
    this.credentials = credentials;
  }

  abstract testConnection(): Promise<{ success: boolean; message: string }>;
  abstract getCampaigns(): Promise<PlatformCampaign[]>;
  abstract getCampaignById(campaignId: string): Promise<PlatformCampaign>;
  abstract createCampaign(campaign: Partial<PlatformCampaign>): Promise<PlatformCampaign>;
  abstract updateCampaign(campaignId: string, updates: Partial<PlatformCampaign>): Promise<PlatformCampaign>;
  abstract updateCampaignStatus(campaignId: string, status: string): Promise<void>;
  abstract deleteCampaign(campaignId: string): Promise<void>;
  abstract getCampaignMetrics(
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<PlatformMetric[]>;
  abstract getAccountInfo(): Promise<any>;

  /**
   * Format date for API
   */
  protected formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Parse API date
   */
  protected parseDate(dateStr: string): Date {
    return new Date(dateStr);
  }

  /**
   * Calculate derived metrics
   */
  protected calculateDerivedMetrics(metric: Partial<PlatformMetric>): PlatformMetric {
    const result = { ...metric } as PlatformMetric;

    // CTR (Click-through rate)
    if (result.impressions > 0) {
      result.ctr = (result.clicks / result.impressions) * 100;
    }

    // CPC (Cost per click)
    if (result.clicks > 0) {
      result.cpc = result.spend / result.clicks;
    }

    // CPM (Cost per mille)
    if (result.impressions > 0) {
      result.cpm = (result.spend / result.impressions) * 1000;
    }

    // CPA (Cost per acquisition)
    if (result.conversions > 0) {
      result.cpa = result.spend / result.conversions;
    }

    // Conversion Rate
    if (result.clicks > 0) {
      result.conversionRate = (result.conversions / result.clicks) * 100;
    }

    // ROAS (Return on ad spend) - assuming $100 per conversion
    if (result.spend > 0) {
      result.roas = (result.conversions * 100) / result.spend;
    }

    return result;
  }

  /**
   * Handle rate limiting
   */
  protected async handleRateLimit(fn: () => Promise<any>): Promise<any> {
    // Implement platform-specific rate limiting
    return fn();
  }
}