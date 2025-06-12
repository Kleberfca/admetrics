import { PrismaClient } from '@prisma/client';
import { RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { MetricsNormalizer } from '../utils/metrics-normalizer';
import { DataQualityService } from './data-quality.service';
import type { 
  MetricData, 
  AggregatedMetrics, 
  MetricsTrend,
  PlatformMetrics,
  DashboardMetrics 
} from '../types/metrics.types';

export interface MetricsQueryOptions {
  startDate: Date;
  endDate: Date;
  platforms?: string[];
  campaignIds?: string[];
  groupBy?: 'day' | 'week' | 'month' | 'campaign' | 'platform';
  metrics?: string[];
}

export interface MetricsCalculationResult {
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  averageCPC: number;
  averageCPM: number;
  averageCTR: number;
  averageROAS: number;
  totalRevenue: number;
}

export class MetricsService {
  private prisma: PrismaClient;
  private redis: RedisClientType;
  private normalizer: MetricsNormalizer;
  private dataQuality: DataQualityService;

  constructor(prisma: PrismaClient, redis: RedisClientType) {
    this.prisma = prisma;
    this.redis = redis;
    this.normalizer = new MetricsNormalizer();
    this.dataQuality = new DataQualityService();
  }

  /**
   * Get aggregated metrics for dashboard
   */
  async getDashboardMetrics(
    userId: string, 
    options: MetricsQueryOptions
  ): Promise<DashboardMetrics> {
    try {
      const cacheKey = `dashboard:metrics:${userId}:${JSON.stringify(options)}`;
      
      // Try to get from cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('Returning cached dashboard metrics');
        return JSON.parse(cached);
      }

      // Build query conditions
      const whereCondition = {
        campaign: {
          userId: userId,
          ...(options.platforms && { platform: { in: options.platforms } }),
          ...(options.campaignIds && { id: { in: options.campaignIds } })
        },
        date: {
          gte: options.startDate,
          lte: options.endDate
        }
      };

      // Get current period metrics
      const currentMetrics = await this.calculateAggregatedMetrics(whereCondition);

      // Get previous period for comparison
      const periodDiff = options.endDate.getTime() - options.startDate.getTime();
      const previousStartDate = new Date(options.startDate.getTime() - periodDiff);
      const previousEndDate = new Date(options.endDate.getTime() - periodDiff);

      const previousMetrics = await this.calculateAggregatedMetrics({
        ...whereCondition,
        date: {
          gte: previousStartDate,
          lte: previousEndDate
        }
      });

      // Get performance data for charts
      const performanceData = await this.getPerformanceData(userId, options);

      // Get platform breakdown
      const platformMetrics = await this.getPlatformMetrics(userId, options);

      // Get top campaigns
      const topCampaigns = await this.getTopCampaigns(userId, options);

      const dashboardMetrics: DashboardMetrics = {
        currentPeriod: currentMetrics,
        previousPeriod: previousMetrics,
        performanceData,
        platformMetrics,
        topCampaigns,
        generatedAt: new Date()
      };

      // Cache for 5 minutes
      await this.redis.setEx(cacheKey, 300, JSON.stringify(dashboardMetrics));

      return dashboardMetrics;

    } catch (error) {
      logger.error('Error getting dashboard metrics:', error);
      throw new Error(`Failed to get dashboard metrics: ${error.message}`);
    }
  }

  /**
   * Calculate aggregated metrics from raw data
   */
  private async calculateAggregatedMetrics(whereCondition: any): Promise<MetricsCalculationResult> {
    const metrics = await this.prisma.metric.findMany({
      where: whereCondition,
      select: {
        spend: true,
        clicks: true,
        impressions: true,
        conversions: true,
        revenue: true,
        ctr: true,
        cpc: true,
        cpm: true,
        roas: true
      }
    });

    if (metrics.length === 0) {
      return {
        totalSpend: 0,
        totalClicks: 0,
        totalImpressions: 0,
        totalConversions: 0,
        averageCPC: 0,
        averageCPM: 0,
        averageCTR: 0,
        averageROAS: 0,
        totalRevenue: 0
      };
    }

    const totals = metrics.reduce((acc, metric) => {
      return {
        spend: acc.spend + (parseFloat(metric.spend?.toString() || '0')),
        clicks: acc.clicks + parseInt(metric.clicks?.toString() || '0'),
        impressions: acc.impressions + parseInt(metric.impressions?.toString() || '0'),
        conversions: acc.conversions + (metric.conversions || 0),
        revenue: acc.revenue + (parseFloat(metric.revenue?.toString() || '0'))
      };
    }, { spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0 });

    // Calculate averages
    const averageCPC = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    const averageCPM = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
    const averageCTR = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const averageROAS = totals.spend > 0 ? totals.revenue / totals.spend : 0;

    return {
      totalSpend: totals.spend,
      totalClicks: totals.clicks,
      totalImpressions: totals.impressions,
      totalConversions: totals.conversions,
      averageCPC: parseFloat(averageCPC.toFixed(2)),
      averageCPM: parseFloat(averageCPM.toFixed(2)),
      averageCTR: parseFloat(averageCTR.toFixed(4)),
      averageROAS: parseFloat(averageROAS.toFixed(2)),
      totalRevenue: totals.revenue
    };
  }

  /**
   * Get performance data for time series charts
   */
  async getPerformanceData(userId: string, options: MetricsQueryOptions): Promise<any[]> {
    const groupByField = options.groupBy || 'day';
    
    const rawData = await this.prisma.metric.findMany({
      where: {
        campaign: {
          userId: userId,
          ...(options.platforms && { platform: { in: options.platforms } })
        },
        date: {
          gte: options.startDate,
          lte: options.endDate
        }
      },
      include: {
        campaign: {
          select: {
            name: true,
            platform: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    // Group data by the specified period
    const groupedData = this.groupMetricsByPeriod(rawData, groupByField);

    return Object.keys(groupedData).map(period => {
      const metrics = groupedData[period];
      const aggregated = this.aggregateMetricsArray(metrics);
      
      return {
        date: period,
        ...aggregated
      };
    });
  }

  /**
   * Get metrics broken down by platform
   */
  async getPlatformMetrics(userId: string, options: MetricsQueryOptions): Promise<PlatformMetrics[]> {
    const platformData = await this.prisma.metric.groupBy({
      by: ['platform'],
      where: {
        campaign: {
          userId: userId,
          ...(options.platforms && { platform: { in: options.platforms } })
        },
        date: {
          gte: options.startDate,
          lte: options.endDate
        }
      },
      _sum: {
        spend: true,
        clicks: true,
        impressions: true,
        conversions: true,
        revenue: true
      },
      _avg: {
        ctr: true,
        cpc: true,
        roas: true
      }
    });

    return platformData.map(platform => ({
      platform: platform.platform,
      totalSpend: parseFloat(platform._sum.spend?.toString() || '0'),
      totalClicks: parseInt(platform._sum.clicks?.toString() || '0'),
      totalImpressions: parseInt(platform._sum.impressions?.toString() || '0'),
      totalConversions: platform._sum.conversions || 0,
      totalRevenue: parseFloat(platform._sum.revenue?.toString() || '0'),
      averageCTR: parseFloat(platform._avg.ctr?.toString() || '0'),
      averageCPC: parseFloat(platform._avg.cpc?.toString() || '0'),
      averageROAS: parseFloat(platform._avg.roas?.toString() || '0')
    }));
  }

  /**
   * Get top performing campaigns
   */
  async getTopCampaigns(userId: string, options: MetricsQueryOptions, limit: number = 10): Promise<any[]> {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        userId: userId,
        ...(options.platforms && { platform: { in: options.platforms } })
      },
      include: {
        metrics: {
          where: {
            date: {
              gte: options.startDate,
              lte: options.endDate
            }
          }
        }
      }
    });

    // Calculate aggregated metrics for each campaign
    const campaignMetrics = campaigns.map(campaign => {
      const aggregated = this.aggregateMetricsArray(campaign.metrics);
      
      return {
        id: campaign.id,
        name: campaign.name,
        platform: campaign.platform,
        status: campaign.status,
        ...aggregated
      };
    });

    // Sort by ROAS and take top campaigns
    return campaignMetrics
      .sort((a, b) => b.averageROAS - a.averageROAS)
      .slice(0, limit);
  }

  /**
   * Get metrics trends over time
   */
  async getMetricsTrends(
    userId: string, 
    metric: string, 
    options: MetricsQueryOptions
  ): Promise<MetricsTrend> {
    const data = await this.prisma.metric.findMany({
      where: {
        campaign: {
          userId: userId,
          ...(options.platforms && { platform: { in: options.platforms } })
        },
        date: {
          gte: options.startDate,
          lte: options.endDate
        }
      },
      select: {
        date: true,
        [metric]: true
      },
      orderBy: {
        date: 'asc'
      }
    });

    const values = data.map(d => parseFloat(d[metric]?.toString() || '0'));
    const dates = data.map(d => d.date);

    // Calculate trend statistics
    const trend = this.calculateTrend(values);
    const seasonality = this.detectSeasonality(values);

    return {
      metric,
      data: data.map((d, index) => ({
        date: d.date,
        value: values[index]
      })),
      trend: {
        direction: trend.slope > 0 ? 'increasing' : 'decreasing',
        strength: Math.abs(trend.slope),
        confidence: trend.rSquared
      },
      seasonality,
      statistics: {
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        median: this.calculateMedian(values),
        min: Math.min(...values),
        max: Math.max(...values),
        standardDeviation: this.calculateStandardDeviation(values)
      }
    };
  }

  /**
   * Store metrics data
   */
  async storeMetrics(metrics: MetricData[]): Promise<void> {
    try {
      // Validate data quality
      const validatedMetrics = await this.dataQuality.validateMetrics(metrics);
      
      // Normalize metrics
      const normalizedMetrics = await this.normalizer.normalizeMetrics(validatedMetrics);

      // Batch insert with upsert logic
      for (const metric of normalizedMetrics) {
        await this.prisma.metric.upsert({
          where: {
            campaignId_date_metricType: {
              campaignId: metric.campaignId,
              date: metric.date,
              metricType: metric.metricType
            }
          },
          update: {
            impressions: metric.impressions,
            clicks: metric.clicks,
            spend: metric.spend,
            conversions: metric.conversions,
            revenue: metric.revenue,
            ctr: metric.ctr,
            cpc: metric.cpc,
            cpm: metric.cpm,
            cpa: metric.cpa,
            roas: metric.roas,
            roi: metric.roi,
            qualityScore: metric.qualityScore,
            platformData: metric.platformData,
            updatedAt: new Date()
          },
          create: {
            campaignId: metric.campaignId,
            integrationId: metric.integrationId,
            date: metric.date,
            platform: metric.platform,
            metricType: metric.metricType,
            impressions: metric.impressions,
            clicks: metric.clicks,
            spend: metric.spend,
            conversions: metric.conversions,
            revenue: metric.revenue,
            ctr: metric.ctr,
            cpc: metric.cpc,
            cpm: metric.cpm,
            cpa: metric.cpa,
            roas: metric.roas,
            roi: metric.roi,
            qualityScore: metric.qualityScore,
            platformData: metric.platformData
          }
        });
      }

      // Invalidate related caches
      await this.invalidateMetricsCache();

      logger.info(`Stored ${normalizedMetrics.length} metric records`);

    } catch (error) {
      logger.error('Error storing metrics:', error);
      throw new Error(`Failed to store metrics: ${error.message}`);
    }
  }

  /**
   * Get real-time metrics updates
   */
  async getRealTimeMetrics(userId: string, platforms: string[]): Promise<any> {
    const cacheKey = `realtime:metrics:${userId}:${platforms.join(',')}`;
    
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get today's metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayMetrics = await this.calculateAggregatedMetrics({
        campaign: {
          userId: userId,
          platform: { in: platforms }
        },
        date: {
          gte: today
        }
      });

      // Cache for 2 minutes for real-time feel
      await this.redis.setEx(cacheKey, 120, JSON.stringify(todayMetrics));

      return todayMetrics;

    } catch (error) {
      logger.error('Error getting real-time metrics:', error);
      return null;
    }
  }

  // Helper methods

  private groupMetricsByPeriod(metrics: any[], groupBy: string): { [key: string]: any[] } {
    return metrics.reduce((groups, metric) => {
      let key: string;
      const date = new Date(metric.date);

      switch (groupBy) {
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'campaign':
          key = metric.campaignId;
          break;
        case 'platform':
          key = metric.campaign.platform;
          break;
        default: // day
          key = metric.date.toISOString().split('T')[0];
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(metric);
      return groups;
    }, {});
  }

  private aggregateMetricsArray(metrics: any[]): MetricsCalculationResult {
    if (metrics.length === 0) {
      return {
        totalSpend: 0,
        totalClicks: 0,
        totalImpressions: 0,
        totalConversions: 0,
        averageCPC: 0,
        averageCPM: 0,
        averageCTR: 0,
        averageROAS: 0,
        totalRevenue: 0
      };
    }

    const totals = metrics.reduce((acc, metric) => ({
      spend: acc.spend + (parseFloat(metric.spend?.toString() || '0')),
      clicks: acc.clicks + parseInt(metric.clicks?.toString() || '0'),
      impressions: acc.impressions + parseInt(metric.impressions?.toString() || '0'),
      conversions: acc.conversions + (metric.conversions || 0),
      revenue: acc.revenue + (parseFloat(metric.revenue?.toString() || '0'))
    }), { spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0 });

    return {
      totalSpend: totals.spend,
      totalClicks: totals.clicks,
      totalImpressions: totals.impressions,
      totalConversions: totals.conversions,
      averageCPC: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      averageCPM: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
      averageCTR: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      averageROAS: totals.spend > 0 ? totals.revenue / totals.spend : 0,
      totalRevenue: totals.revenue
    };
  }

  private calculateTrend(values: number[]): { slope: number; rSquared: number } {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = values.reduce((sum, yi) => sum + yi * yi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const yMean = sumY / n;
    const ssRes = values.reduce((sum, yi, i) => {
      const predicted = slope * x[i] + intercept;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const ssTot = values.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);

    return { slope, rSquared };
  }

  private detectSeasonality(values: number[]): any {
    // Simple seasonality detection - could be enhanced
    const periods = [7, 30]; // Weekly and monthly patterns
    const seasonality = {};

    for (const period of periods) {
      if (values.length < period * 2) continue;

      const correlations = [];
      for (let lag = 1; lag < period; lag++) {
        const correlation = this.calculateCorrelation(
          values.slice(0, -lag),
          values.slice(lag)
        );
        correlations.push(correlation);
      }

      const maxCorrelation = Math.max(...correlations);
      seasonality[`${period}d`] = {
        strength: maxCorrelation,
        detected: maxCorrelation > 0.3
      };
    }

    return seasonality;
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
    const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
    const sumXY = x.slice(0, n).reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.slice(0, n).reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = y.slice(0, n).reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private async invalidateMetricsCache(): Promise<void> {
    try {
      const keys = await this.redis.keys('dashboard:metrics:*');
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    } catch (error) {
      logger.warn('Failed to invalidate metrics cache:', error);
    }
  }
}