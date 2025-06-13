import { PrismaClient, Platform, MetricType } from '@prisma/client';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { calculateMetricAggregations, normalizeMetricValue } from '../utils/metricsCalculations';

export interface MetricsQuery {
  campaignIds?: string[];
  platforms?: Platform[];
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  metricTypes?: MetricType[];
  groupBy?: 'day' | 'week' | 'month' | 'campaign' | 'platform';
  aggregation?: 'sum' | 'avg' | 'min' | 'max';
}

export interface MetricsSummary {
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  averageCTR: number;
  averageCPC: number;
  averageROAS: number;
  averageCPL: number;
  platformBreakdown: Record<Platform, any>;
  trends: {
    spendTrend: number;
    clicksTrend: number;
    conversionsTrend: number;
    roasTrend: number;
  };
}

export interface RealTimeMetrics {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  timestamp: Date;
  platform: Platform;
  campaignId: string;
}

export class MetricsService {
  private redis: Redis;
  private prisma: PrismaClient;
  
  // Cache keys
  private readonly CACHE_PREFIX = 'metrics:';
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly REALTIME_PREFIX = 'realtime:';

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Get metrics data based on query parameters
   */
  async getMetrics(userId: string, query: MetricsQuery): Promise<any[]> {
    try {
      const cacheKey = this.generateCacheKey('metrics', userId, query);
      
      // Try to get from cache first
      const cachedData = await this.getFromCache(cacheKey);
      if (cachedData) {
        logger.debug('Returning cached metrics data');
        return cachedData;
      }

      // Build where clause
      const whereClause: any = {
        campaign: {
          userId,
        },
        date: {
          gte: query.dateRange.startDate,
          lte: query.dateRange.endDate,
        },
      };

      if (query.campaignIds?.length) {
        whereClause.campaignId = { in: query.campaignIds };
      }

      if (query.platforms?.length) {
        whereClause.platform = { in: query.platforms };
      }

      if (query.metricTypes?.length) {
        whereClause.metricType = { in: query.metricTypes };
      }

      // Execute query
      const metrics = await this.prisma.metric.findMany({
        where: whereClause,
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              platform: true,
              status: true,
            },
          },
        },
        orderBy: {
          date: 'desc',
        },
      });

      // Group and aggregate data if needed
      let processedMetrics = metrics;
      
      if (query.groupBy) {
        processedMetrics = this.groupMetrics(metrics, query.groupBy, query.aggregation);
      }

      // Cache the result
      await this.setCache(cacheKey, processedMetrics, this.CACHE_TTL);

      return processedMetrics;
    } catch (error) {
      logger.error('Error fetching metrics:', error);
      throw new Error('Failed to fetch metrics data');
    }
  }

  /**
   * Get metrics summary for dashboard
   */
  async getMetricsSummary(userId: string, query: MetricsQuery): Promise<MetricsSummary> {
    try {
      const cacheKey = this.generateCacheKey('summary', userId, query);
      
      const cachedSummary = await this.getFromCache(cacheKey);
      if (cachedSummary) {
        return cachedSummary;
      }

      const metrics = await this.getMetrics(userId, query);
      
      // Calculate current period metrics
      const currentMetrics = calculateMetricAggregations(metrics);
      
      // Calculate previous period for trends
      const previousPeriod = this.getPreviousPeriod(query.dateRange);
      const previousMetrics = await this.getMetrics(userId, {
        ...query,
        dateRange: previousPeriod,
      });
      const previousAggregations = calculateMetricAggregations(previousMetrics);

      // Calculate trends
      const trends = {
        spendTrend: this.calculateTrendPercentage(currentMetrics.totalSpend, previousAggregations.totalSpend),
        clicksTrend: this.calculateTrendPercentage(currentMetrics.totalClicks, previousAggregations.totalClicks),
        conversionsTrend: this.calculateTrendPercentage(currentMetrics.totalConversions, previousAggregations.totalConversions),
        roasTrend: this.calculateTrendPercentage(currentMetrics.averageROAS, previousAggregations.averageROAS),
      };

      // Calculate platform breakdown
      const platformBreakdown = this.calculatePlatformBreakdown(metrics);

      const summary: MetricsSummary = {
        ...currentMetrics,
        platformBreakdown,
        trends,
      };

      // Cache for shorter time due to frequent updates
      await this.setCache(cacheKey, summary, 60); // 1 minute cache

      return summary;
    } catch (error) {
      logger.error('Error calculating metrics summary:', error);
      throw new Error('Failed to calculate metrics summary');
    }
  }

  /**
   * Store real-time metrics data
   */
  async storeRealTimeMetrics(data: RealTimeMetrics): Promise<void> {
    try {
      const key = `${this.REALTIME_PREFIX}${data.platform}:${data.campaignId}`;
      const serializedData = JSON.stringify({
        ...data,
        timestamp: data.timestamp.toISOString(),
      });

      // Store in Redis with expiration
      await this.redis.setex(key, 3600, serializedData); // 1 hour expiration

      // Also broadcast to WebSocket subscribers
      await this.redis.publish('metrics:realtime', serializedData);

      logger.debug(`Stored real-time metrics for campaign ${data.campaignId}`);
    } catch (error) {
      logger.error('Error storing real-time metrics:', error);
      throw new Error('Failed to store real-time metrics');
    }
  }

  /**
   * Get real-time metrics for a campaign
   */
  async getRealTimeMetrics(campaignId: string, platform: Platform): Promise<RealTimeMetrics | null> {
    try {
      const key = `${this.REALTIME_PREFIX}${platform}:${campaignId}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }

      const parsed = JSON.parse(data);
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };
    } catch (error) {
      logger.error('Error fetching real-time metrics:', error);
      return null;
    }
  }

  /**
   * Update campaign metrics from platform data
   */
  async updateCampaignMetrics(campaignId: string, platformData: any[], platform: Platform): Promise<void> {
    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      // Process each metric entry
      for (const entry of platformData) {
        const normalizedData = this.normalizePlatformData(entry, platform);
        
        // Upsert metric record
        await this.prisma.metric.upsert({
          where: {
            campaignId_date_metricType: {
              campaignId,
              date: normalizedData.date,
              metricType: normalizedData.metricType,
            },
          },
          update: {
            spend: normalizedData.spend,
            clicks: normalizedData.clicks,
            impressions: normalizedData.impressions,
            conversions: normalizedData.conversions,
            ctr: normalizedData.ctr,
            cpc: normalizedData.cpc,
            cpm: normalizedData.cpm,
            cpa: normalizedData.cpa,
            roas: normalizedData.roas,
            roi: normalizedData.roi,
            platformData: normalizedData.platformSpecific,
            updatedAt: new Date(),
          },
          create: {
            campaignId,
            integrationId: campaign.integrationId,
            platform,
            date: normalizedData.date,
            metricType: normalizedData.metricType,
            spend: normalizedData.spend,
            clicks: normalizedData.clicks,
            impressions: normalizedData.impressions,
            conversions: normalizedData.conversions,
            ctr: normalizedData.ctr,
            cpc: normalizedData.cpc,
            cpm: normalizedData.cpm,
            cpa: normalizedData.cpa,
            roas: normalizedData.roas,
            roi: normalizedData.roi,
            platformData: normalizedData.platformSpecific,
          },
        });
      }

      // Clear related cache
      await this.clearUserMetricsCache(campaign.userId);

      logger.info(`Updated metrics for campaign ${campaignId} from ${platform}`);
    } catch (error) {
      logger.error('Error updating campaign metrics:', error);
      throw new Error('Failed to update campaign metrics');
    }
  }

  /**
   * Private helper methods
   */
  private generateCacheKey(type: string, userId: string, query: any): string {
    const queryHash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(query))
      .digest('hex');
    
    return `${this.CACHE_PREFIX}${type}:${userId}:${queryHash}`;
  }

  private async getFromCache(key: string): Promise<any | null> {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.warn('Cache retrieval failed:', error);
      return null;
    }
  }

  private async setCache(key: string, data: any, ttl: number): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      logger.warn('Cache storage failed:', error);
    }
  }

  private groupMetrics(metrics: any[], groupBy: string, aggregation = 'sum'): any[] {
    // Implementation for grouping metrics by different dimensions
    // This would contain the logic for grouping by day/week/month/campaign/platform
    const grouped = new Map();
    
    metrics.forEach(metric => {
      let key: string;
      
      switch (groupBy) {
        case 'day':
          key = metric.date.toISOString().split('T')[0];
          break;
        case 'week':
          // Calculate week start date
          const weekStart = new Date(metric.date);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${metric.date.getFullYear()}-${String(metric.date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'campaign':
          key = metric.campaignId;
          break;
        case 'platform':
          key = metric.platform;
          break;
        default:
          key = 'total';
      }
      
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(metric);
    });

    // Aggregate grouped data
    return Array.from(grouped.entries()).map(([key, groupMetrics]) => ({
      key,
      ...calculateMetricAggregations(groupMetrics, aggregation),
    }));
  }

  private calculateTrendPercentage(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  private calculatePlatformBreakdown(metrics: any[]): Record<Platform, any> {
    const platforms = new Map();
    
    metrics.forEach(metric => {
      if (!platforms.has(metric.platform)) {
        platforms.set(metric.platform, []);
      }
      platforms.get(metric.platform).push(metric);
    });

    const breakdown: any = {};
    platforms.forEach((platformMetrics, platform) => {
      breakdown[platform] = calculateMetricAggregations(platformMetrics);
    });

    return breakdown;
  }

  private getPreviousPeriod(dateRange: { startDate: Date; endDate: Date }) {
    const diffMs = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    
    return {
      startDate: new Date(dateRange.startDate.getTime() - diffMs),
      endDate: new Date(dateRange.startDate.getTime() - 1),
    };
  }

  private normalizePlatformData(data: any, platform: Platform): any {
    // Normalize platform-specific data format to our standard format
    // This would contain platform-specific mapping logic
    
    const normalized: any = {
      date: new Date(data.date),
      metricType: 'DAILY' as MetricType,
      spend: parseFloat(data.spend || 0),
      clicks: parseInt(data.clicks || 0),
      impressions: parseInt(data.impressions || 0),
      conversions: parseInt(data.conversions || 0),
      platformSpecific: {},
    };

    // Calculate derived metrics
    normalized.ctr = normalized.impressions > 0 ? (normalized.clicks / normalized.impressions) : 0;
    normalized.cpc = normalized.clicks > 0 ? (normalized.spend / normalized.clicks) : 0;
    normalized.cpm = normalized.impressions > 0 ? (normalized.spend / normalized.impressions * 1000) : 0;
    normalized.cpa = normalized.conversions > 0 ? (normalized.spend / normalized.conversions) : 0;

    // Platform-specific handling
    switch (platform) {
      case 'GOOGLE_ADS':
        normalized.platformSpecific = {
          qualityScore: data.quality_score,
          searchImpressionShare: data.search_impression_share,
        };
        break;
      case 'FACEBOOK_ADS':
        normalized.platformSpecific = {
          relevanceScore: data.relevance_score,
          frequency: data.frequency,
        };
        break;
      case 'TIKTOK_ADS':
        normalized.platformSpecific = {
          videoViews: data.video_views,
          videoPlayActions: data.video_play_actions,
        };
        break;
    }

    return normalized;
  }

  private async clearUserMetricsCache(userId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}*:${userId}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug(`Cleared ${keys.length} cache entries for user ${userId}`);
      }
    } catch (error) {
      logger.warn('Failed to clear metrics cache:', error);
    }
  }
}

export default MetricsService;