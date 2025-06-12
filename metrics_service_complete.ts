// backend/src/services/metrics.service.ts
import { PrismaClient, Platform, MetricType } from '@prisma/client';
import { logger } from '../utils/logger';
import { DataQualityService } from './data-quality.service';
import { MetricsNormalizer } from '../utils/metrics-normalizer';
import { CacheService } from './cache.service';

export interface MetricsQueryOptions {
  startDate: Date;
  endDate: Date;
  platforms?: Platform[];
  campaigns?: string[];
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface AggregatedMetrics {
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  totalRevenue: number;
  averageCPC: number;
  averageCPM: number;
  averageCPA: number;
  averageCTR: number;
  averageROAS: number;
  averageROI: number;
}

export interface MetricsTrend {
  metric: string;
  data: Array<{
    date: Date;
    value: number;
  }>;
  trend: {
    direction: 'increasing' | 'decreasing' | 'stable';
    strength: number;
    confidence: number;
  };
  seasonality: {
    detected: boolean;
    pattern?: 'daily' | 'weekly' | 'monthly';
    strength?: number;
  };
  statistics: {
    mean: number;
    median: number;
    min: number;
    max: number;
    standardDeviation: number;
  };
}

export interface MetricData {
  campaignId: string;
  integrationId: string;
  date: Date;
  platform: Platform;
  metricType: MetricType;
  impressions?: bigint;
  clicks?: bigint;
  spend?: number;
  conversions?: number;
  revenue?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpa?: number;
  roas?: number;
  roi?: number;
  qualityScore?: number;
  platformData?: any;
}

export class MetricsService {
  private prisma: PrismaClient;
  private dataQuality: DataQualityService;
  private normalizer: MetricsNormalizer;
  private cache: CacheService;

  constructor() {
    this.prisma = new PrismaClient();
    this.dataQuality = new DataQualityService();
    this.normalizer = new MetricsNormalizer();
    this.cache = new CacheService();
  }

  /**
   * Get aggregated metrics for a user
   */
  async getAggregatedMetrics(
    userId: string,
    options: MetricsQueryOptions
  ): Promise<AggregatedMetrics> {
    try {
      const cacheKey = `metrics:aggregated:${userId}:${options.startDate.getTime()}:${options.endDate.getTime()}:${JSON.stringify(options.platforms)}`;
      
      // Check cache first
      const cached = await this.cache.get<AggregatedMetrics>(cacheKey);
      if (cached) {
        return cached;
      }

      const whereClause: any = {
        campaign: {
          userId,
          ...(options.platforms && { platform: { in: options.platforms } }),
          ...(options.campaigns && { id: { in: options.campaigns } })
        },
        date: {
          gte: options.startDate,
          lte: options.endDate
        }
      };

      const metrics = await this.prisma.metric.findMany({
        where: whereClause,
        select: {
          spend: true,
          clicks: true,
          impressions: true,
          conversions: true,
          revenue: true,
          cpc: true,
          cpm: true,
          cpa: true,
          ctr: true,
          roas: true,
          roi: true
        }
      });

      if (metrics.length === 0) {
        const emptyMetrics: AggregatedMetrics = {
          totalSpend: 0,
          totalClicks: 0,
          totalImpressions: 0,
          totalConversions: 0,
          totalRevenue: 0,
          averageCPC: 0,
          averageCPM: 0,
          averageCPA: 0,
          averageCTR: 0,
          averageROAS: 0,
          averageROI: 0
        };
        await this.cache.set(cacheKey, emptyMetrics, 300); // Cache for 5 minutes
        return emptyMetrics;
      }

      // Calculate aggregated values
      const totals = metrics.reduce((acc, metric) => ({
        spend: acc.spend + Number(metric.spend || 0),
        clicks: acc.clicks + Number(metric.clicks || 0),
        impressions: acc.impressions + Number(metric.impressions || 0),
        conversions: acc.conversions + (metric.conversions || 0),
        revenue: acc.revenue + Number(metric.revenue || 0)
      }), { spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0 });

      // Calculate averages
      const validMetrics = metrics.filter(m => m.cpc !== null || m.cpm !== null);
      const averages = validMetrics.reduce((acc, metric, index, array) => ({
        cpc: acc.cpc + (Number(metric.cpc || 0) / array.length),
        cpm: acc.cpm + (Number(metric.cpm || 0) / array.length),
        cpa: acc.cpa + (Number(metric.cpa || 0) / array.length),
        ctr: acc.ctr + (Number(metric.ctr || 0) / array.length),
        roas: acc.roas + (Number(metric.roas || 0) / array.length),
        roi: acc.roi + (Number(metric.roi || 0) / array.length)
      }), { cpc: 0, cpm: 0, cpa: 0, ctr: 0, roas: 0, roi: 0 });

      const aggregated: AggregatedMetrics = {
        totalSpend: totals.spend,
        totalClicks: totals.clicks,
        totalImpressions: totals.impressions,
        totalConversions: totals.conversions,
        totalRevenue: totals.revenue,
        averageCPC: averages.cpc,
        averageCPM: averages.cpm,
        averageCPA: averages.cpa,
        averageCTR: averages.ctr,
        averageROAS: averages.roas,
        averageROI: averages.roi
      };

      // Cache for 5 minutes
      await this.cache.set(cacheKey, aggregated, 300);

      return aggregated;

    } catch (error) {
      logger.error('Error getting aggregated metrics:', error);
      throw new Error('Failed to get aggregated metrics');
    }
  }

  /**
   * Get metrics with specific granularity
   */
  async getMetricsWithGranularity(
    userId: string,
    options: MetricsQueryOptions & { granularity: 'hour' | 'day' | 'week' | 'month' }
  ): Promise<Array<{ date: string; metrics: AggregatedMetrics }>> {
    try {
      const whereClause: any = {
        campaign: {
          userId,
          ...(options.platforms && { platform: { in: options.platforms } }),
          ...(options.campaigns && { id: { in: options.campaigns } })
        },
        date: {
          gte: options.startDate,
          lte: options.endDate
        }
      };

      const metrics = await this.prisma.metric.findMany({
        where: whereClause,
        orderBy: { date: 'asc' }
      });

      // Group by granularity
      const grouped = this.groupByGranularity(metrics, options.granularity);
      
      return grouped.map(group => ({
        date: group.date,
        metrics: this.calculateAggregatedMetrics(group.metrics)
      }));

    } catch (error) {
      logger.error('Error getting metrics with granularity:', error);
      throw new Error('Failed to get metrics with granularity');
    }
  }

  /**
   * Get platform breakdown
   */
  async getPlatformBreakdown(
    userId: string,
    options: MetricsQueryOptions
  ): Promise<Array<{ platform: Platform; metrics: AggregatedMetrics }>> {
    try {
      const cacheKey = `metrics:platforms:${userId}:${options.startDate.getTime()}:${options.endDate.getTime()}`;
      
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const platforms = await this.prisma.metric.groupBy({
        by: ['platform'],
        where: {
          campaign: {
            userId,
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
          cpc: true,
          cpm: true,
          cpa: true,
          ctr: true,
          roas: true,
          roi: true
        }
      });

      const breakdown = platforms.map(platform => ({
        platform: platform.platform,
        metrics: {
          totalSpend: Number(platform._sum.spend || 0),
          totalClicks: Number(platform._sum.clicks || 0),
          totalImpressions: Number(platform._sum.impressions || 0),
          totalConversions: platform._sum.conversions || 0,
          totalRevenue: Number(platform._sum.revenue || 0),
          averageCPC: Number(platform._avg.cpc || 0),
          averageCPM: Number(platform._avg.cpm || 0),
          averageCPA: Number(platform._avg.cpa || 0),
          averageCTR: Number(platform._avg.ctr || 0),
          averageROAS: Number(platform._avg.roas || 0),
          averageROI: Number(platform._avg.roi || 0)
        }
      }));

      await this.cache.set(cacheKey, breakdown, 300);
      return breakdown;

    } catch (error) {
      logger.error('Error getting platform breakdown:', error);
      throw new Error('Failed to get platform breakdown');
    }
  }

  /**
   * Get top performing campaigns
   */
  async getTopCampaigns(
    userId: string,
    options: MetricsQueryOptions,
    limit: number = 10
  ): Promise<Array<any>> {
    try {
      const campaigns = await this.prisma.campaign.findMany({
        where: {
          userId,
          ...(options.platforms && { platform: { in: options.platforms } }),
          ...(options.campaigns && { id: { in: options.campaigns } })
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
        const aggregated = this.calculateAggregatedMetrics(campaign.metrics);
        
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

    } catch (error) {
      logger.error('Error getting top campaigns:', error);
      throw new Error('Failed to get top campaigns');
    }
  }

  /**
   * Get metrics trends over time
   */
  async getMetricsTrends(
    userId: string, 
    metric: string, 
    options: MetricsQueryOptions
  ): Promise<MetricsTrend> {
    try {
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
          direction: trend.slope > 0 ? 'increasing' : trend.slope < 0 ? 'decreasing' : 'stable',
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

    } catch (error) {
      logger.error('Error getting metrics trends:', error);
      throw new Error('Failed to get metrics trends');
    }
  }

  /**
   * Get campaign specific metrics
   */
  async getCampaignMetrics(
    campaignId: string,
    options: { startDate: Date; endDate: Date; granularity?: string }
  ): Promise<any> {
    try {
      const metrics = await this.prisma.metric.findMany({
        where: {
          campaignId,
          date: {
            gte: options.startDate,
            lte: options.endDate
          }
        },
        orderBy: { date: 'asc' }
      });

      if (options.granularity) {
        const grouped = this.groupByGranularity(metrics, options.granularity as any);
        return grouped.map(group => ({
          date: group.date,
          metrics: this.calculateAggregatedMetrics(group.metrics)
        }));
      }

      return this.calculateAggregatedMetrics(metrics);

    } catch (error) {
      logger.error('Error getting campaign metrics:', error);
      throw new Error('Failed to get campaign metrics');
    }
  }

  /**
   * Get campaign trends
   */
  async getCampaignTrends(
    campaignId: string,
    options: { startDate: Date; endDate: Date; metric: string }
  ): Promise<any> {
    try {
      const data = await this.prisma.metric.findMany({
        where: {
          campaignId,
          date: {
            gte: options.startDate,
            lte: options.endDate
          }
        },
        select: {
          date: true,
          [options.metric]: true
        },
        orderBy: { date: 'asc' }
      });

      const values = data.map(d => parseFloat(d[options.metric]?.toString() || '0'));
      const trend = this.calculateTrend(values);

      return {
        metric: options.metric,
        data: data.map((d, index) => ({
          date: d.date,
          value: values[index]
        })),
        trend: {
          direction: trend.slope > 0 ? 'increasing' : trend.slope < 0 ? 'decreasing' : 'stable',
          strength: Math.abs(trend.slope),
          confidence: trend.rSquared
        }
      };

    } catch (error) {
      logger.error('Error getting campaign trends:', error);
      throw new Error('Failed to get campaign trends');
    }
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

      logger.info(`Stored ${normalizedMetrics.length} metrics`);

    } catch (error) {
      logger.error('Error storing metrics:', error);
      throw new Error('Failed to store metrics');
    }
  }

  /**
   * Export data for dashboard
   */
  async getExportData(
    userId: string,
    options: MetricsQueryOptions & { format: string }
  ): Promise<string> {
    try {
      const campaigns = await this.prisma.campaign.findMany({
        where: {
          userId,
          ...(options.platforms && { platform: { in: options.platforms } }),
          ...(options.campaigns && { id: { in: options.campaigns } })
        },
        include: {
          metrics: {
            where: {
              date: {
                gte: options.startDate,
                lte: options.endDate
              }
            },
            orderBy: { date: 'asc' }
          }
        }
      });

      if (options.format === 'csv') {
        return this.exportToCSV(campaigns);
      } else if (options.format === 'json') {
        return JSON.stringify(campaigns, null, 2);
      }

      throw new Error('Unsupported export format');

    } catch (error) {
      logger.error('Error exporting data:', error);
      throw new Error('Failed to export data');
    }
  }

  // Private helper methods

  private groupByGranularity(metrics: any[], granularity: 'hour' | 'day' | 'week' | 'month') {
    const groups = new Map();

    metrics.forEach(metric => {
      let key: string;
      const date = new Date(metric.date);

      switch (granularity) {
        case 'hour':
          key = date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
          break;
        case 'day':
          key = date.toISOString().slice(0, 10); // YYYY-MM-DD
          break;
        case 'week':
          const week = this.getWeekStart(date);
          key = week.toISOString().slice(0, 10);
          break;
        case 'month':
          key = date.toISOString().slice(0, 7); // YYYY-MM
          break;
        default:
          key = date.toISOString().slice(0, 10);
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(metric);
    });

    return Array.from(groups.entries()).map(([date, metrics]) => ({
      date,
      metrics
    }));
  }

  private calculateAggregatedMetrics(metrics: any[]): AggregatedMetrics {
    if (metrics.length === 0) {
      return {
        totalSpend: 0,
        totalClicks: 0,
        totalImpressions: 0,
        totalConversions: 0,
        totalRevenue: 0,
        averageCPC: 0,
        averageCPM: 0,
        averageCPA: 0,
        averageCTR: 0,
        averageROAS: 0,
        averageROI: 0
      };
    }

    const totals = metrics.reduce((acc, metric) => ({
      spend: acc.spend + Number(metric.spend || 0),
      clicks: acc.clicks + Number(metric.clicks || 0),
      impressions: acc.impressions + Number(metric.impressions || 0),
      conversions: acc.conversions + (metric.conversions || 0),
      revenue: acc.revenue + Number(metric.revenue || 0)
    }), { spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0 });

    const validMetrics = metrics.filter(m => m.cpc !== null || m.cpm !== null);
    const averages = validMetrics.length > 0 ? validMetrics.reduce((acc, metric, index, array) => ({
      cpc: acc.cpc + (Number(metric.cpc || 0) / array.length),
      cpm: acc.cpm + (Number(metric.cpm || 0) / array.length),
      cpa: acc.cpa + (Number(metric.cpa || 0) / array.length),
      ctr: acc.ctr + (Number(metric.ctr || 0) / array.length),
      roas: acc.roas + (Number(metric.roas || 0) / array.length),
      roi: acc.roi + (Number(metric.roi || 0) / array.length)
    }), { cpc: 0, cpm: 0, cpa: 0, ctr: 0, roas: 0, roi: 0 }) : { cpc: 0, cpm: 0, cpa: 0, ctr: 0, roas: 0, roi: 0 };

    return {
      totalSpend: totals.spend,
      totalClicks: totals.clicks,
      totalImpressions: totals.impressions,
      totalConversions: totals.conversions,
      totalRevenue: totals.revenue,
      averageCPC: averages.cpc,
      averageCPM: averages.cpm,
      averageCPA: averages.cpa,
      averageCTR: averages.ctr,
      averageROAS: averages.roas,
      averageROI: averages.roi
    };
  }

  private calculateTrend(values: number[]) {
    if (values.length < 2) {
      return { slope: 0, rSquared: 0 };
    }

    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);
    const sumYY = y.reduce((acc, yi) => acc + yi * yi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const yMean = sumY / n;
    const ssRes = y.reduce((acc, yi, i) => {
      const predicted = slope * x[i] + intercept;
      return acc + Math.pow(yi - predicted, 2);
    }, 0);
    const ssTot = y.reduce((acc, yi) => acc + Math.pow(yi - yMean, 2), 0);
    const rSquared = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);

    return { slope, rSquared: Math.max(0, rSquared) };
  }

  private detectSeasonality(values: number[]) {
    // Simple seasonality detection - can be enhanced with FFT or other methods
    if (values.length < 14) {
      return { detected: false };
    }

    const dailyPattern = this.checkPattern(values, 7);
    const weeklyPattern = this.checkPattern(values, 7);

    if (dailyPattern.strength > 0.5) {
      return { detected: true, pattern: 'daily' as const, strength: dailyPattern.strength };
    } else if (weeklyPattern.strength > 0.5) {
      return { detected: true, pattern: 'weekly' as const, strength: weeklyPattern.strength };
    }

    return { detected: false };
  }

  private checkPattern(values: number[], period: number) {
    if (values.length < period * 2) {
      return { strength: 0 };
    }

    let correlation = 0;
    let count = 0;

    for (let i = period; i < values.length; i++) {
      correlation += values[i] * values[i - period];
      count++;
    }

    const strength = count > 0 ? Math.abs(correlation / count) : 0;
    return { strength: Math.min(1, strength / 100) }; // Normalize
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
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  private exportToCSV(campaigns: any[]): string {
    const headers = [
      'Campaign ID',
      'Campaign Name',
      'Platform',
      'Status',
      'Date',
      'Spend',
      'Clicks',
      'Impressions',
      'Conversions',
      'Revenue',
      'CPC',
      'CPM',
      'CPA',
      'CTR',
      'ROAS',
      'ROI'
    ];

    const rows = [headers.join(',')];

    campaigns.forEach(campaign => {
      campaign.metrics.forEach((metric: any) => {
        const row = [
          campaign.id,
          `"${campaign.name}"`,
          campaign.platform,
          campaign.status,
          metric.date,
          metric.spend || 0,
          metric.clicks || 0,
          metric.impressions || 0,
          metric.conversions || 0,
          metric.revenue || 0,
          metric.cpc || 0,
          metric.cpm || 0,
          metric.cpa || 0,
          metric.ctr || 0,
          metric.roas || 0,
          metric.roi || 0
        ];
        rows.push(row.join(','));
      });
    });

    return rows.join('\n');
  }
}