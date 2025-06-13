import { Request, Response } from 'express';
import { PrismaClient, Platform } from '@prisma/client';
import { MetricsService } from '../services/metrics.service';
import { AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { createNotFoundError, createValidationError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

export class DashboardController {
  private metricsService: MetricsService;

  constructor(metricsService: MetricsService) {
    this.metricsService = metricsService;
  }

  /**
   * Get dashboard overview with key metrics
   */
  getOverview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { 
      startDate, 
      endDate, 
      platforms,
      campaignIds 
    } = req.query;

    // Default to last 30 days if no date range provided
    const dateRange = {
      startDate: startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate as string) : new Date()
    };

    // Parse platforms filter
    const selectedPlatforms: Platform[] = platforms 
      ? (platforms as string).split(',') as Platform[]
      : [];

    // Parse campaign IDs filter
    const selectedCampaignIds: string[] = campaignIds
      ? (campaignIds as string).split(',')
      : [];

    const query = {
      dateRange,
      platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
      campaignIds: selectedCampaignIds.length > 0 ? selectedCampaignIds : undefined,
    };

    // Get metrics summary
    const metricsSummary = await this.metricsService.getMetricsSummary(userId, query);

    // Get active campaigns count
    const activeCampaignsCount = await prisma.campaign.count({
      where: {
        userId,
        status: 'ACTIVE',
        ...(selectedPlatforms.length > 0 && { platform: { in: selectedPlatforms } }),
        ...(selectedCampaignIds.length > 0 && { id: { in: selectedCampaignIds } }),
      }
    });

    // Get integrations status
    const integrations = await prisma.integration.findMany({
      where: { userId },
      select: {
        id: true,
        platform: true,
        name: true,
        status: true,
        lastSyncAt: true,
        errorCount: true,
      }
    });

    const integrationsStatus = {
      total: integrations.length,
      active: integrations.filter(i => i.status === 'ACTIVE').length,
      errors: integrations.filter(i => i.errorCount > 0).length,
      lastSync: integrations.reduce((latest, integration) => {
        return integration.lastSyncAt && (!latest || integration.lastSyncAt > latest)
          ? integration.lastSyncAt
          : latest;
      }, null as Date | null),
    };

    // Get recent alerts
    const recentAlerts = await prisma.alert.findMany({
      where: { 
        userId,
        isActive: true,
        lastTriggered: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { lastTriggered: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        lastTriggered: true,
        conditions: true,
      }
    });

    // Calculate performance scores (simplified)
    const performanceScore = this.calculatePerformanceScore(metricsSummary);

    const overview = {
      summary: metricsSummary,
      activeCampaigns: activeCampaignsCount,
      integrations: integrationsStatus,
      alerts: recentAlerts,
      performance: {
        score: performanceScore,
        grade: this.getPerformanceGrade(performanceScore),
      },
      dateRange,
      lastUpdated: new Date(),
    };

    res.json({
      success: true,
      data: overview,
    });
  });

  /**
   * Get performance chart data
   */
  getPerformanceChart = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { 
      startDate, 
      endDate, 
      metrics: requestedMetrics = 'spend,clicks,conversions',
      groupBy = 'day',
      platforms,
      campaignIds 
    } = req.query;

    const dateRange = {
      startDate: startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate as string) : new Date()
    };

    const metricTypes = (requestedMetrics as string).split(',');
    const selectedPlatforms: Platform[] = platforms 
      ? (platforms as string).split(',') as Platform[]
      : [];
    const selectedCampaignIds: string[] = campaignIds
      ? (campaignIds as string).split(',')
      : [];

    const query = {
      dateRange,
      platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
      campaignIds: selectedCampaignIds.length > 0 ? selectedCampaignIds : undefined,
      groupBy: groupBy as 'day' | 'week' | 'month',
    };

    const chartData = await this.metricsService.getMetrics(userId, query);

    // Transform data for chart consumption
    const transformedData = this.transformChartData(chartData, metricTypes);

    res.json({
      success: true,
      data: {
        chartData: transformedData,
        metrics: metricTypes,
        dateRange,
        groupBy,
      },
    });
  });

  /**
   * Get platform comparison data
   */
  getPlatformComparison = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { 
      startDate, 
      endDate, 
      metric = 'spend' 
    } = req.query;

    const dateRange = {
      startDate: startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate as string) : new Date()
    };

    const query = {
      dateRange,
      groupBy: 'platform' as const,
    };

    const platformData = await this.metricsService.getMetrics(userId, query);
    
    // Calculate platform performance comparison
    const comparison = this.calculatePlatformComparison(platformData, metric as string);

    res.json({
      success: true,
      data: {
        comparison,
        metric,
        dateRange,
      },
    });
  });

  /**
   * Get top performing campaigns
   */
  getTopCampaigns = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { 
      startDate, 
      endDate, 
      metric = 'roas',
      limit = '10',
      platforms,
    } = req.query;

    const dateRange = {
      startDate: startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate as string) : new Date()
    };

    const selectedPlatforms: Platform[] = platforms 
      ? (platforms as string).split(',') as Platform[]
      : [];

    // Get campaign performance data
    const campaigns = await prisma.campaign.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        ...(selectedPlatforms.length > 0 && { platform: { in: selectedPlatforms } }),
      },
      include: {
        metrics: {
          where: {
            date: {
              gte: dateRange.startDate,
              lte: dateRange.endDate,
            }
          }
        }
      }
    });

    // Calculate aggregated metrics for each campaign
    const campaignPerformance = campaigns.map(campaign => {
      const totalSpend = campaign.metrics.reduce((sum, m) => sum + (m.spend?.toNumber() || 0), 0);
      const totalClicks = campaign.metrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
      const totalConversions = campaign.metrics.reduce((sum, m) => sum + (m.conversions || 0), 0);
      const totalImpressions = campaign.metrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
      
      const roas = totalSpend > 0 ? (totalConversions * 100) / totalSpend : 0; // Simplified ROAS calculation
      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

      return {
        id: campaign.id,
        name: campaign.name,
        platform: campaign.platform,
        status: campaign.status,
        spend: totalSpend,
        clicks: totalClicks,
        conversions: totalConversions,
        impressions: totalImpressions,
        roas,
        ctr,
        cpc,
        metricValue: metric === 'roas' ? roas : 
                    metric === 'spend' ? totalSpend :
                    metric === 'clicks' ? totalClicks :
                    metric === 'conversions' ? totalConversions :
                    metric === 'ctr' ? ctr : roas,
      };
    });

    // Sort by selected metric and take top N
    const sortedCampaigns = campaignPerformance
      .sort((a, b) => b.metricValue - a.metricValue)
      .slice(0, parseInt(limit as string));

    res.json({
      success: true,
      data: {
        campaigns: sortedCampaigns,
        metric,
        dateRange,
        total: campaigns.length,
      },
    });
  });

  /**
   * Save custom dashboard layout
   */
  saveDashboardLayout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { name, layout, widgets, filters, isDefault = false } = req.body;

    if (!name || !layout) {
      throw createValidationError('Dashboard name and layout are required');
    }

    // Create or update dashboard
    const dashboard = await prisma.dashboard.upsert({
      where: {
        userId_name: {
          userId,
          name,
        }
      },
      update: {
        layout,
        widgets,
        filters,
        updatedAt: new Date(),
      },
      create: {
        userId,
        name,
        layout,
        widgets,
        filters,
        isPublic: false,
      },
    });

    // If this is set as default, update user preferences
    if (isDefault) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          preferences: {
            defaultDashboard: dashboard.id,
          }
        }
      });
    }

    res.json({
      success: true,
      data: dashboard,
      message: 'Dashboard layout saved successfully',
    });
  });

  /**
   * Get saved dashboard layouts
   */
  getDashboardLayouts = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    const dashboards = await prisma.dashboard.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        layout: true,
        widgets: true,
        filters: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    res.json({
      success: true,
      data: dashboards,
    });
  });

  /**
   * Private helper methods
   */
  private calculatePerformanceScore(summary: any): number {
    // Simplified performance score calculation
    // In a real implementation, this would be more sophisticated
    
    const roasScore = Math.min(summary.averageROAS * 10, 100); // Max 100 for ROAS >= 10
    const ctrScore = Math.min(summary.averageCTR * 1000, 100); // Max 100 for CTR >= 10%
    const conversionScore = summary.totalConversions > 0 ? 50 : 0; // Bonus for having conversions
    
    return Math.round((roasScore + ctrScore + conversionScore) / 3);
  }

  private getPerformanceGrade(score: number): string {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B+';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C';
    return 'D';
  }

  private transformChartData(data: any[], metricTypes: string[]): any[] {
    // Transform the raw metrics data into chart-friendly format
    return data.map(item => {
      const transformed: any = {
        date: item.key,
        timestamp: new Date(item.key).getTime(),
      };

      metricTypes.forEach(metric => {
        switch (metric) {
          case 'spend':
            transformed.spend = item.totalSpend || 0;
            break;
          case 'clicks':
            transformed.clicks = item.totalClicks || 0;
            break;
          case 'conversions':
            transformed.conversions = item.totalConversions || 0;
            break;
          case 'impressions':
            transformed.impressions = item.totalImpressions || 0;
            break;
          case 'ctr':
            transformed.ctr = item.averageCTR || 0;
            break;
          case 'cpc':
            transformed.cpc = item.averageCPC || 0;
            break;
          case 'roas':
            transformed.roas = item.averageROAS || 0;
            break;
        }
      });

      return transformed;
    });
  }

  private calculatePlatformComparison(data: any[], metric: string): any[] {
    return data.map(platform => ({
      platform: platform.key,
      value: platform[`total${metric.charAt(0).toUpperCase() + metric.slice(1)}`] || 
             platform[`average${metric.charAt(0).toUpperCase() + metric.slice(1)}`] || 0,
      percentage: 0, // Will be calculated after getting all values
    })).map((item, _, array) => {
      const total = array.reduce((sum, p) => sum + p.value, 0);
      return {
        ...item,
        percentage: total > 0 ? (item.value / total) * 100 : 0,
      };
    });
  }
}

export default DashboardController;