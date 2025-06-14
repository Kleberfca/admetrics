import { MetricGranularity, Platform, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { CacheManager, Cacheable } from '../config/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/error.middleware';
import { addDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

interface MetricData {
  campaignId: string;
  date: Date;
  platform: Platform;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  costPerClick?: number;
  clickThroughRate?: number;
  conversionRate?: number;
  costPerConversion?: number;
  returnOnAdSpend?: number;
  reach?: number;
  frequency?: number;
  cpm?: number;
  videoViews?: number;
  videoViewRate?: number;
  engagements?: number;
  engagementRate?: number;
  rawData?: any;
}

interface AggregatedMetrics {
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  averageCpc: number;
  averageCtr: number;
  averageConversionRate: number;
  averageRoas: number;
  platformBreakdown: {
    platform: Platform;
    spend: number;
    conversions: number;
    roas: number;
  }[];
  trends: {
    spendChange: number;
    conversionChange: number;
    roasChange: number;
  };
}

export class MetricsService {
  /**
   * Get campaign metrics
   */
  async getCampaignMetrics(
    campaignId: string,
    userId: string,
    startDate: Date,
    endDate: Date,
    granularity: MetricGranularity = 'DAILY'
  ): Promise<MetricData[]> {
    // Verify campaign ownership
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId,
        deletedAt: null
      }
    });

    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    // Get metrics
    const metrics = await prisma.metric.findMany({
      where: {
        campaignId,
        date: {
          gte: startDate,
          lte: endDate
        },
        granularity
      },
      orderBy: {
        date: 'asc'
      }
    });

    return metrics.map(metric => this.mapMetricData(metric));
  }

  /**
   * Get aggregated metrics for multiple campaigns
   */
  @Cacheable((target, propertyKey, userId: string, campaignIds: string[], startDate: Date, endDate: Date) => ({
    key: `metrics:aggregated:${userId}:${campaignIds.join('-')}:${startDate.getTime()}-${endDate.getTime()}`,
    ttl: 300 // 5 minutes
  }))
  async getAggregatedMetrics(
    userId: string,
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<AggregatedMetrics> {
    // Get all metrics
    const metrics = await prisma.metric.findMany({
      where: {
        campaign: {
          userId,
          deletedAt: null
        },
        campaignId: {
          in: campaignIds
        },
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        campaign: {
          select: {
            platform: true
          }
        }
      }
    });

    // Get previous period metrics for trend calculation
    const previousStartDate = addDays(startDate, -(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const previousMetrics = await prisma.metric.findMany({
      where: {
        campaign: {
          userId,
          deletedAt: null
        },
        campaignId: {
          in: campaignIds
        },
        date: {
          gte: previousStartDate,
          lt: startDate
        }
      }
    });

    return this.aggregateMetrics(metrics, startDate, endDate, previousMetrics);
  }

  /**
   * Get platform performance metrics
   */
  async getPlatformPerformance(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    const platformMetrics = await prisma.metric.groupBy({
      by: ['campaignId'],
      where: {
        campaign: {
          userId,
          deletedAt: null
        },
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        spend: true,
        clicks: true,
        impressions: true,
        conversions: true
      }
    });

    // Get platform info for each campaign
    const campaignIds = platformMetrics.map(m => m.campaignId);
    const campaigns = await prisma.campaign.findMany({
      where: {
        id: { in: campaignIds }
      },
      select: {
        id: true,
        platform: true
      }
    });

    const platformMap = new Map(campaigns.map(c => [c.id, c.platform]));

    // Group by platform
    const platformGroups = new Map<Platform, any>();

    platformMetrics.forEach(metric => {
      const platform = platformMap.get(metric.campaignId);
      if (!platform) return;

      if (!platformGroups.has(platform)) {
        platformGroups.set(platform, {
          platform,
          spend: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0
        });
      }

      const group = platformGroups.get(platform)!;
      group.spend += metric._sum.spend || 0;
      group.clicks += metric._sum.clicks || 0;
      group.impressions += metric._sum.impressions || 0;
      group.conversions += metric._sum.conversions || 0;
    });

    // Calculate derived metrics
    return Array.from(platformGroups.values()).map(platform => ({
      ...platform,
      cpc: platform.clicks > 0 ? platform.spend / platform.clicks : 0,
      ctr: platform.impressions > 0 ? (platform.clicks / platform.impressions) * 100 : 0,
      conversionRate: platform.clicks > 0 ? (platform.conversions / platform.clicks) * 100 : 0,
      roas: platform.spend > 0 ? (platform.conversions * 100) / platform.spend : 0 // Assuming $100 per conversion
    }));
  }

  /**
   * Get top performing campaigns
   */
  async getTopCampaigns(
    userId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<any[]> {
    const campaignMetrics = await prisma.metric.groupBy({
      by: ['campaignId'],
      where: {
        campaign: {
          userId,
          deletedAt: null
        },
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        spend: true,
        conversions: true
      },
      orderBy: {
        _sum: {
          conversions: 'desc'
        }
      },
      take: limit
    });

    // Get campaign details
    const campaignIds = campaignMetrics.map(m => m.campaignId);
    const campaigns = await prisma.campaign.findMany({
      where: {
        id: { in: campaignIds }
      },
      select: {
        id: true,
        name: true,
        platform: true,
        status: true
      }
    });

    const campaignMap = new Map(campaigns.map(c => [c.id, c]));

    return campaignMetrics.map(metric => {
      const campaign = campaignMap.get(metric.campaignId);
      const roas = metric._sum.spend! > 0 
        ? (metric._sum.conversions! * 100) / metric._sum.spend! 
        : 0;

      return {
        ...campaign,
        spend: metric._sum.spend,
        conversions: metric._sum.conversions,
        roas
      };
    });
  }

  /**
   * Get recent alerts
   */
  async getRecentAlerts(userId: string, limit: number = 10): Promise<any[]> {
    return prisma.alert.findMany({
      where: {
        userId,
        isRead: false
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            platform: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });
  }

  /**
   * Get metrics for dashboard
   */
  @Cacheable((target, propertyKey, userId: string, period: string) => ({
    key: `metrics:dashboard:${userId}:${period}`,
    ttl: 300 // 5 minutes
  }))
  async getDashboardMetrics(userId: string, period: string = '7d'): Promise<any> {
    // Calculate date range
    const endDate = new Date();
    let startDate = new Date();

    switch (period) {
      case '24h':
        startDate = addDays(endDate, -1);
        break;
      case '7d':
        startDate = addDays(endDate, -7);
        break;
      case '30d':
        startDate = addDays(endDate, -30);
        break;
      case '90d':
        startDate = addDays(endDate, -90);
        break;
      default:
        startDate = addDays(endDate, -7);
    }

    // Get active campaigns
    const campaigns = await prisma.campaign.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    const campaignIds = campaigns.map(c => c.id);

    // Get current period metrics
    const currentMetrics = await this.getAggregatedMetrics(
      userId,
      campaignIds,
      startDate,
      endDate
    );

    // Get top performing campaigns
    const topCampaigns = await this.getTopCampaigns(userId, startDate, endDate, 5);

    // Get platform performance
    const platformPerformance = await this.getPlatformPerformance(userId, startDate, endDate);

    // Get recent alerts
    const recentAlerts = await this.getRecentAlerts(userId, 10);

    return {
      overview: {
        totalSpend: currentMetrics.totalSpend,
        totalClicks: currentMetrics.totalClicks,
        totalConversions: currentMetrics.totalConversions,
        averageRoas: currentMetrics.averageRoas,
        spendChange: currentMetrics.trends.spendChange,
        conversionChange: currentMetrics.trends.conversionChange
      },
      topCampaigns,
      platformPerformance,
      recentAlerts
    };
  }

  // Private helper methods

  private mapMetricData(metric: any): MetricData {
    return {
      campaignId: metric.campaignId,
      date: metric.date,
      platform: metric.campaign?.platform || metric.platform,
      spend: metric.spend,
      clicks: metric.clicks,
      impressions: metric.impressions,
      conversions: metric.conversions,
      costPerClick: metric.cpc,
      clickThroughRate: metric.ctr,
      conversionRate: metric.conversionRate,
      costPerConversion: metric.cpa,
      returnOnAdSpend: metric.roas,
      reach: metric.reach,
      frequency: metric.frequency,
      cpm: metric.cpm,
      videoViews: metric.videoViews,
      videoViewRate: metric.videoViewRate,
      engagements: metric.engagements,
      engagementRate: metric.engagementRate,
      rawData: metric.platformMetrics
    };
  }

  private aggregateMetrics(
    metrics: any[],
    startDate: Date,
    endDate: Date,
    previousMetrics: any[] = []
  ): AggregatedMetrics {
    const totalSpend = metrics.reduce((sum, m) => sum + (m.spend || 0), 0);
    const totalClicks = metrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
    const totalImpressions = metrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
    const totalConversions = metrics.reduce((sum, m) => sum + (m.conversions || 0), 0);

    // Previous period totals
    const prevTotalSpend = previousMetrics.reduce((sum, m) => sum + (m.spend || 0), 0);
    const prevTotalConversions = previousMetrics.reduce((sum, m) => sum + (m.conversions || 0), 0);

    // Group by platform
    const platformGroups = metrics.reduce((groups, metric) => {
      const platform = metric.campaign?.platform;
      if (!platform) return groups;

      if (!groups[platform]) {
        groups[platform] = [];
      }
      groups[platform].push(metric);
      return groups;
    }, {} as Record<Platform, any[]>);

    const platformBreakdown = Object.entries(platformGroups).map(([platform, platformMetrics]) => {
      const platformSpend = platformMetrics.reduce((sum, m) => sum + (m.spend || 0), 0);
      const platformConversions = platformMetrics.reduce((sum, m) => sum + (m.conversions || 0), 0);
      
      return {
        platform: platform as Platform,
        spend: platformSpend,
        conversions: platformConversions,
        roas: platformSpend > 0 ? (platformConversions * 100) / platformSpend : 0
      };
    });

    return {
      totalSpend,
      totalClicks,
      totalImpressions,
      totalConversions,
      averageCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      averageCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      averageConversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      averageRoas: totalSpend > 0 ? (totalConversions * 100) / totalSpend : 0,
      platformBreakdown,
      trends: {
        spendChange: prevTotalSpend > 0 
          ? ((totalSpend - prevTotalSpend) / prevTotalSpend) * 100 
          : 0,
        conversionChange: prevTotalConversions > 0 
          ? ((totalConversions - prevTotalConversions) / prevTotalConversions) * 100 
          : 0,
        roasChange: 0 // Calculate based on previous ROAS
      }
    };
  }
}