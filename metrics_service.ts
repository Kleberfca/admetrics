// backend/src/services/metrics.service.ts
import { PrismaClient, Platform, Metric } from '@prisma/client';
import { BaseService, ServiceFactory } from './base.service';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

export interface MetricData {
  campaignId: string;
  date: Date;
  platform: Platform;
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
  videoViews?: number;
  videoViewRate?: number;
  engagements?: number;
  engagementRate?: number;
  shares?: number;
  saves?: number;
  comments?: number;
  linkClicks?: number;
  appInstalls?: number;
  leadSubmissions?: number;
  purchaseValue?: number;
  addToCart?: number;
  checkoutInitiated?: number;
  rawData?: any;
}

export interface AggregatedMetrics {
  period: string;
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  averageCpc: number;
  averageCtr: number;
  averageCvr: number;
  averageCpa: number;
  averageRoas: number;
  averageCpm: number;
  platformBreakdown: Array<{
    platform: Platform;
    spend: number;
    conversions: number;
    roas: number;
    percentage: number;
  }>;
  trends: {
    spendChange: number;
    conversionChange: number;
    roasChange: number;
    cpcChange: number;
  };
}

export interface MetricsQuery {
  userId: string;
  campaignIds?: string[];
  platforms?: Platform[];
  startDate: Date;
  endDate: Date;
  granularity: 'hour' | 'day' | 'week' | 'month';
  metrics?: string[];
  includeComparison?: boolean;
  comparisonPeriod?: number;
}

export interface RealTimeMetrics {
  timestamp: Date;
  campaignId: string;
  platform: Platform;
  currentSpend: number;
  currentClicks: number;
  currentConversions: number;
  changeFromYesterday: {
    spend: number;
    clicks: number;
    conversions: number;
  };
  alerts: Array<{
    type: 'budget_threshold' | 'performance_drop' | 'anomaly';
    severity: 'low' | 'medium' | 'high';
    message: string;
  }>;
}

export class MetricsService extends BaseService {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor() {
    super({
      rateLimit: {
        maxRequests: 200,
        windowMs: 60000 // 1 minute
      },
      timeout: 30000,
      cacheEnabled: true,
      cacheTtl: 300 // 5 minutes
    });

    this.prisma = new PrismaClient();
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.ping();
      return { success: true, message: 'Database and Redis connections successful' };
    } catch (error) {
      return { success: false, message: `Connection failed: ${error.message}` };
    }
  }

  /**
   * Get metrics for campaigns with advanced filtering and aggregation
   */
  async getMetrics(query: MetricsQuery): Promise<{
    metrics: MetricData[];
    aggregated: AggregatedMetrics;
    comparison?: AggregatedMetrics;
  }> {
    return this.executeWithPolicy('get_metrics', async () => {
      // Build where clause for database query
      const where: any = {
        campaign: { userId: query.userId },
        date: {
          gte: query.startDate,
          lte: query.endDate
        }
      };

      if (query.campaignIds && query.campaignIds.length > 0) {
        where.campaignId = { in: query.campaignIds };
      }

      if (query.platforms && query.platforms.length > 0) {
        where.platform = { in: query.platforms };
      }

      // Get metrics from database
      const metrics = await this.prisma.metric.findMany({
        where,
        orderBy: { date: 'desc' },
        include: {
          campaign: {
            select: {
              name: true,
              platform: true
            }
          }
        }
      });

      // Convert to MetricData format
      const metricData = metrics.map(this.mapMetricData);

      // Aggregate metrics
      const aggregated = this.aggregateMetrics(metricData, query.startDate, query.endDate);

      let comparison: AggregatedMetrics | undefined;

      // Get comparison data if requested
      if (query.includeComparison && query.comparisonPeriod) {
        const comparisonStartDate = new Date(query.startDate);
        comparisonStartDate.setDate(comparisonStartDate.getDate() - query.comparisonPeriod);
        const comparisonEndDate = new Date(query.endDate);
        comparisonEndDate.setDate(comparisonEndDate.getDate() - query.comparisonPeriod);

        const comparisonMetrics = await this.getMetrics({
          ...query,
          startDate: comparisonStartDate,
          endDate: comparisonEndDate,
          includeComparison: false
        });

        comparison = comparisonMetrics.aggregated;
        
        // Calculate trends
        aggregated.trends = this.calculateTrends(aggregated, comparison);
      }

      return {
        metrics: metricData,
        aggregated,
        comparison
      };
    }, {
      cacheKey: `metrics:${JSON.stringify(query)}`,
      cacheTtl: 300
    });
  }

  /**
   * Get campaign-specific metrics
   */
  async getCampaignMetrics(
    campaignIds: string[],
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<MetricData[]> {
    return this.executeWithPolicy('get_campaign_metrics', async () => {
      const metrics = await this.prisma.metric.findMany({
        where: {
          campaignId: { in: campaignIds },
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { date: 'desc' }
      });

      let groupedMetrics = metrics.map(this.mapMetricData);

      // Group by granularity if not daily
      if (granularity !== 'day') {
        groupedMetrics = this.groupMetricsByGranularity(groupedMetrics, granularity);
      }

      return groupedMetrics;
    }, {
      cacheKey: `campaign_metrics:${campaignIds.join(',')}:${startDate.toISOString()}:${endDate.toISOString()}:${granularity}`,
      cacheTtl: 300
    });
  }

  /**
   * Sync metrics from all platforms
   */
  async syncMetrics(
    userId: string,
    startDate: Date,
    endDate: Date,
    integrationId?: string
  ): Promise<{
    synced: number;
    failed: number;
    errors: string[];
  }> {
    return this.executeWithPolicy('sync_metrics', async () => {
      let synced = 0;
      let failed = 0;
      const errors: string[] = [];

      // Get active integrations
      const integrations = await this.prisma.integration.findMany({
        where: {
          userId,
          ...(integrationId && { id: integrationId }),
          status: 'CONNECTED',
          syncEnabled: true
        },
        include: {
          campaigns: {
            where: {
              status: { not: 'DELETED' }
            }
          }
        }
      });

      for (const integration of integrations) {
        try {
          const platformService = ServiceFactory.create(integration.platform);
          await platformService.initialize(integration.credentials as any);

          // Get campaign IDs
          const campaignIds = integration.campaigns.map(c => c.externalId);

          if (campaignIds.length === 0) {
            continue;
          }

          // Fetch metrics from platform
          const platformMetrics = await platformService.getCampaignMetrics(
            campaignIds,
            startDate,
            endDate
          );

          // Process and save metrics
          for (const metric of platformMetrics) {
            try {
              const campaign = integration.campaigns.find(c => c.externalId === metric.campaignId);
              if (!campaign) {
                continue;
              }

              // Check if metric already exists
              const existingMetric = await this.prisma.metric.findFirst({
                where: {
                  campaignId: campaign.id,
                  date: metric.date,
                  platform: integration.platform
                }
              });

              const metricData = {
                campaignId: campaign.id,
                platform: integration.platform,
                date: metric.date,
                spend: metric.spend,
                clicks: metric.clicks,
                impressions: metric.impressions,
                conversions: metric.conversions,
                costPerClick: metric.costPerClick,
                clickThroughRate: metric.clickThroughRate,
                conversionRate: metric.conversionRate,
                costPerConversion: metric.costPerConversion,
                returnOnAdSpend: metric.returnOnAdSpend,
                reach: metric.reach,
                frequency: metric.frequency,
                cpm: metric.cpm,
                videoViews: metric.videoViews,
                videoViewRate: metric.videoViewRate,
                engagements: metric.engagements,
                engagementRate: metric.engagementRate,
                rawData: metric
              };

              if (existingMetric) {
                await this.prisma.metric.update({
                  where: { id: existingMetric.id },
                  data: metricData
                });
              } else {
                await this.prisma.metric.create({
                  data: metricData
                });
              }

              synced++;

              // Update real-time cache
              await this.updateRealTimeCache(campaign.id, metricData);

            } catch (error) {
              failed++;
              errors.push(`Metric for campaign ${metric.campaignId}: ${error.message}`);
            }
          }

          // Update integration last sync
          await this.prisma.integration.update({
            where: { id: integration.id },
            data: { lastSyncAt: new Date() }
          });

        } catch (error) {
          failed++;
          errors.push(`Integration ${integration.name}: ${error.message}`);
        }
      }

      logger.info(`Metrics sync completed: ${synced} synced, ${failed} failed`);

      return { synced, failed, errors };
    });
  }

  /**
   * Get real-time metrics for campaigns
   */
  async getRealTimeMetrics(campaignIds: string[]): Promise<RealTimeMetrics[]> {
    return this.executeWithPolicy('get_realtime_metrics', async () => {
      const realTimeMetrics: RealTimeMetrics[] = [];

      for (const campaignId of campaignIds) {
        const cached = await this.redis.get(`realtime:${campaignId}`);
        
        if (cached) {
          realTimeMetrics.push(JSON.parse(cached));
        } else {
          // Fallback to latest database metrics
          const latestMetric = await this.prisma.metric.findFirst({
            where: { campaignId },
            orderBy: { date: 'desc' },
            include: {
              campaign: {
                select: {
                  platform: true
                }
              }
            }
          });

          if (latestMetric) {
            const yesterdayMetric = await this.prisma.metric.findFirst({
              where: {
                campaignId,
                date: new Date(Date.now() - 24 * 60 * 60 * 1000)
              }
            });

            realTimeMetrics.push({
              timestamp: new Date(),
              campaignId,
              platform: latestMetric.campaign.platform,
              currentSpend: latestMetric.spend,
              currentClicks: latestMetric.clicks,
              currentConversions: latestMetric.conversions,
              changeFromYesterday: {
                spend: yesterdayMetric ? 
                  ((latestMetric.spend - yesterdayMetric.spend) / yesterdayMetric.spend) * 100 : 0,
                clicks: yesterdayMetric ?
                  ((latestMetric.clicks - yesterdayMetric.clicks) / yesterdayMetric.clicks) * 100 : 0,
                conversions: yesterdayMetric ?
                  ((latestMetric.conversions - yesterdayMetric.conversions) / yesterdayMetric.conversions) * 100 : 0
              },
              alerts: await this.generateAlerts(latestMetric, yesterdayMetric)
            });
          }
        }
      }

      return realTimeMetrics;
    });
  }

  /**
   * Get dashboard overview metrics
   */
  async getDashboardMetrics(
    userId: string,
    period: number = 30
  ): Promise<{
    overview: {
      totalSpend: number;
      totalClicks: number;
      totalConversions: number;
      averageRoas: number;
      spendChange: number;
      conversionChange: number;
    };
    topCampaigns: Array<{
      id: string;
      name: string;
      platform: Platform;
      spend: number;
      conversions: number;
      roas: number;
    }>;
    platformPerformance: Array<{
      platform: Platform;
      spend: number;
      conversions: number;
      roas: number;
      campaigns: number;
    }>;
    recentAlerts: Array<{
      type: string;
      message: string;
      campaignName: string;
      timestamp: Date;
    }>;
  }> {
    return this.executeWithPolicy('get_dashboard_metrics', async () => {
      const endDate = new Date();
      const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

      // Get current period metrics
      const currentMetrics = await this.getMetrics({
        userId,
        startDate,
        endDate,
        granularity: 'day',
        includeComparison: true,
        comparisonPeriod: period
      });

      // Get top performing campaigns
      const topCampaigns = await this.getTopCampaigns(userId, startDate, endDate, 5);

      // Get platform performance
      const platformPerformance = await this.getPlatformPerformance(userId, startDate, endDate);

      // Get recent alerts
      const recentAlerts = await this.getRecentAlerts(userId, 10);

      return {
        overview: {
          totalSpend: currentMetrics.aggregated.totalSpend,
          totalClicks: currentMetrics.aggregated.totalClicks,
          totalConversions: currentMetrics.aggregated.totalConversions,
          averageRoas: currentMetrics.aggregated.averageRoas,
          spendChange: currentMetrics.aggregated.trends.spendChange,
          conversionChange: currentMetrics.aggregated.trends.conversionChange
        },
        topCampaigns,
        platformPerformance,
        recentAlerts
      };
    }, {
      cacheKey: `dashboard:${userId}:${period}`,
      cacheTtl: 600 // 10 minutes
    });
  }

  // Private helper methods

  private mapMetricData(metric: any): MetricData {
    return {
      campaignId: metric.campaignId,
      date: metric.date,
      platform: metric.platform,
      spend: metric.spend,
      clicks: metric.clicks,
      impressions: metric.impressions,
      conversions: metric.conversions,
      costPerClick: metric.costPerClick,
      clickThroughRate: metric.clickThroughRate,
      conversionRate: metric.conversionRate,
      costPerConversion: metric.costPerConversion,
      returnOnAdSpend: metric.returnOnAdSpend,
      reach: metric.reach,
      frequency: metric.frequency,
      cpm: metric.cpm,
      videoViews: metric.videoViews,
      videoViewRate: metric.videoViewRate,
      engagements: metric.engagements,
      engagementRate: metric.engagementRate,
      rawData: metric.rawData
    };
  }

  private aggregateMetrics(
    metrics: MetricData[],
    startDate: Date,
    endDate: Date
  ): AggregatedMetrics {
    const totalSpend = metrics.reduce((sum, m) => sum + m.spend, 0);
    const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
    const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
    const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);

    // Group by platform
    const platformGroups = metrics.reduce((groups, metric) => {
      if (!groups[metric.platform]) {
        groups[metric.platform] = [];
      }
      groups[metric.platform].push(metric);
      return groups;
    }, {} as Record<Platform, MetricData[]>);

    const platformBreakdown = Object.entries(platformGroups).map(([platform, platformMetrics]) => {
      const platformSpend = platformMetrics.reduce((sum, m) => sum + m.spend, 0);
      const platformConversions = platformMetrics.reduce((sum, m) => sum + m.conversions, 0);
      
      return {
        platform: platform as Platform,
        spend: platformSpend,
        conversions: platformConversions,
        roas: platformSpend > 0 ? (platformConversions * 100) / platformSpend : 0,
        percentage: totalSpend > 0 ? (platformSpend / totalSpend) * 100 : 0
      };
    });

    return {
      period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      totalSpend,
      totalClicks,
      totalImpressions,
      totalConversions,
      averageCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      averageCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      averageCvr: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      averageCpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      averageRoas: totalSpend > 0 ? (totalConversions * 100) / totalSpend : 0,
      averageCpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      platformBreakdown,
      trends: {
        spendChange: 0,
        conversionChange: 0,
        roasChange: 0,
        cpcChange: 0
      }
    };
  }

  private calculateTrends(
    current: AggregatedMetrics,
    previous: AggregatedMetrics
  ): AggregatedMetrics['trends'] {
    return {
      spendChange: previous.totalSpend > 0 
        ? ((current.totalSpend - previous.totalSpend) / previous.totalSpend) * 100 
        : 0,
      conversionChange: previous.totalConversions > 0
        ? ((current.totalConversions - previous.totalConversions) / previous.totalConversions) * 100
        : 0,
      roasChange: previous.averageRoas > 0
        ? ((current.averageRoas - previous.averageRoas) / previous.averageRoas) * 100
        : 0,
      cpcChange: previous.averageCpc > 0
        ? ((current.averageCpc - previous.averageCpc) / previous.averageCpc) * 100
        : 0
    };
  }

  private groupMetricsByGranularity(
    metrics: MetricData[],
    granularity: 'week' | 'month'
  ): MetricData[] {
    const groups = new Map<string, MetricData[]>();

    metrics.forEach(metric => {
      let key: string;
      const date = new Date(metric.date);

      if (granularity === 'week') {
        const week = this.getWeekNumber(date);
        key = `${date.getFullYear()}-W${week}`;
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(metric);
    });

    return Array.from(groups.entries()).map(([key, groupMetrics]) => {
      const totalSpend = groupMetrics.reduce((sum, m) => sum + m.spend, 0);
      const totalClicks = groupMetrics.reduce((sum, m) => sum + m.clicks, 0);
      const totalImpressions = groupMetrics.reduce((sum, m) => sum + m.impressions, 0);
      const totalConversions = groupMetrics.reduce((sum, m) => sum + m.conversions, 0);

      return {
        ...groupMetrics[0],
        date: new Date(key),
        spend: totalSpend,
        clicks: totalClicks,
        impressions: totalImpressions,
        conversions: totalConversions,
        costPerClick: totalClicks > 0 ? totalSpend / totalClicks : 0,
        clickThroughRate: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
        costPerConversion: totalConversions > 0 ? totalSpend / totalConversions : 0,
        returnOnAdSpend: totalSpend > 0 ? (totalConversions * 100) / totalSpend : 0,
        cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0
      };
    });
  }

  private getWeekNumber(date: Date): number {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  }

  private async updateRealTimeCache(campaignId: string, metric: any): Promise<void> {
    const realTimeData: RealTimeMetrics = {
      timestamp: new Date(),
      campaignId,
      platform: metric.platform,
      currentSpend: metric.spend,
      currentClicks: metric.clicks,
      currentConversions: metric.conversions,
      changeFromYesterday: {
        spend: 0, // Calculate if needed
        clicks: 0,
        conversions: 0
      },
      alerts: []
    };

    await this.redis.setex(
      `realtime:${campaignId}`,
      300, // 5 minutes
      JSON.stringify(realTimeData)
    );
  }

  private async generateAlerts(current: any, previous?: any): Promise<RealTimeMetrics['alerts']> {
    const alerts: RealTimeMetrics['alerts'] = [];

    // Budget threshold alert
    if (current.spend > 1000) { // Example threshold
      alerts.push({
        type: 'budget_threshold',
        severity: 'medium',
        message: 'Campaign spend has exceeded $1000'
      });
    }

    // Performance drop alert
    if (previous && current.conversions < previous.conversions * 0.5) {
      alerts.push({
        type: 'performance_drop',
        severity: 'high',
        message: 'Conversions have dropped by more than 50% compared to yesterday'
      });
    }

    return alerts;
  }

  private async getTopCampaigns(
    userId: string,
    startDate: Date,
    endDate: Date,
    limit: number
  ): Promise<any[]> {
    // Implementation would aggregate metrics by campaign and sort by performance
    return [];
  }

  private async getPlatformPerformance(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    // Implementation would aggregate metrics by platform
    return [];
  }

  private async getRecentAlerts(userId: string, limit: number): Promise<any[]> {
    // Implementation would fetch recent alerts from database or cache
    return [];
  }
}