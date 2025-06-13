// backend/src/controllers/dashboard.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { MetricsService } from '../services/metrics.service';
import { AIInsightsService } from '../services/ai-insights.service';
import { CacheUtils } from '../config/redis';
import { validateDateRange, formatMetrics } from '../utils/data-normalizer';
import { NotFoundError, ValidationError } from '../middleware/error.middleware';

const prisma = new PrismaClient();

export class DashboardController {
  private static metricsService = new MetricsService();
  private static aiInsightsService = new AIInsightsService();

  /**
   * Get dashboard overview with key metrics and insights
   */
  static async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const {
        startDate: startDateStr,
        endDate: endDateStr,
        platforms,
        campaignIds,
        timezone = 'UTC',
        granularity = 'day',
        includeComparison = false
      } = req.query;

      // Set default date range (last 30 days)
      const endDate = endDateStr ? new Date(endDateStr as string) : new Date();
      const startDate = startDateStr ? new Date(startDateStr as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const dateRange = validateDateRange(startDate, endDate);

      // Build query parameters
      const metricsQuery = {
        userId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        platforms: platforms ? (platforms as string).split(',') : undefined,
        campaignIds: campaignIds ? (campaignIds as string).split(',') : undefined,
        granularity: granularity as 'day',
        includeComparison: includeComparison as boolean,
        comparisonPeriod: includeComparison ? 30 : undefined
      };

      // Get dashboard metrics
      const dashboardMetrics = await DashboardController.metricsService.getDashboardMetrics(
        userId,
        30 // period in days
      );

      // Get recent alerts
      const alerts = await DashboardController.getRecentAlerts(userId, 5);

      // Get real-time data for active campaigns
      const activeCampaigns = await prisma.campaign.findMany({
        where: {
          userId,
          status: 'ACTIVE'
        },
        select: { id: true },
        take: 10
      });

      const realTimeData = activeCampaigns.length > 0 
        ? await DashboardController.metricsService.getRealTimeMetrics(
            activeCampaigns.map(c => c.id)
          )
        : [];

      // Combine all data
      const overview = {
        ...dashboardMetrics,
        realTimeData,
        alerts,
        period: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          timezone
        }
      };

      res.json({
        success: true,
        data: overview
      });

      logger.info(`Dashboard overview retrieved for user: ${userId}`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get detailed metrics for dashboard
   */
  static async getMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const {
        startDate,
        endDate,
        platforms,
        campaignIds,
        metrics,
        granularity = 'day',
        timezone = 'UTC',
        includeComparison = false,
        comparisonPeriod
      } = req.query;

      const dateRange = validateDateRange(new Date(startDate as string), new Date(endDate as string));

      const metricsQuery = {
        userId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        platforms: platforms ? (platforms as string).split(',') : undefined,
        campaignIds: campaignIds ? (campaignIds as string).split(',') : undefined,
        granularity: granularity as 'day' | 'week' | 'month',
        metrics: metrics ? (metrics as string).split(',') : undefined,
        includeComparison: includeComparison as boolean,
        comparisonPeriod: comparisonPeriod ? parseInt(comparisonPeriod as string) : undefined
      };

      const result = await DashboardController.metricsService.getMetrics(metricsQuery);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get dashboard widgets configuration
   */
  static async getWidgets(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      // Check for custom dashboard configuration
      const customDashboard = await prisma.customDashboard.findFirst({
        where: {
          userId,
          isDefault: true
        }
      });

      let widgets;

      if (customDashboard) {
        widgets = customDashboard.layout;
      } else {
        // Default widgets configuration
        widgets = [
          {
            id: 'spend-overview',
            type: 'metric-card',
            title: 'Total Spend',
            x: 0, y: 0, w: 3, h: 2,
            config: {
              metric: 'spend',
              format: 'currency',
              showTrend: true,
              period: '30d'
            }
          },
          {
            id: 'conversions-overview',
            type: 'metric-card',
            title: 'Conversions',
            x: 3, y: 0, w: 3, h: 2,
            config: {
              metric: 'conversions',
              format: 'number',
              showTrend: true,
              period: '30d'
            }
          },
          {
            id: 'roas-overview',
            type: 'metric-card',
            title: 'ROAS',
            x: 6, y: 0, w: 3, h: 2,
            config: {
              metric: 'roas',
              format: 'percentage',
              showTrend: true,
              period: '30d'
            }
          },
          {
            id: 'cpc-overview',
            type: 'metric-card',
            title: 'Avg CPC',
            x: 9, y: 0, w: 3, h: 2,
            config: {
              metric: 'cpc',
              format: 'currency',
              showTrend: true,
              period: '30d'
            }
          },
          {
            id: 'spend-chart',
            type: 'line-chart',
            title: 'Spend Trend',
            x: 0, y: 2, w: 6, h: 4,
            config: {
              metrics: ['spend'],
              granularity: 'day',
              period: '30d',
              showComparison: true
            }
          },
          {
            id: 'platform-breakdown',
            type: 'pie-chart',
            title: 'Spend by Platform',
            x: 6, y: 2, w: 6, h: 4,
            config: {
              metric: 'spend',
              groupBy: 'platform',
              period: '30d'
            }
          },
          {
            id: 'top-campaigns',
            type: 'table',
            title: 'Top Performing Campaigns',
            x: 0, y: 6, w: 6, h: 4,
            config: {
              sortBy: 'roas',
              limit: 10,
              columns: ['name', 'platform', 'spend', 'conversions', 'roas']
            }
          },
          {
            id: 'conversion-funnel',
            type: 'funnel-chart',
            title: 'Conversion Funnel',
            x: 6, y: 6, w: 6, h: 4,
            config: {
              stages: ['impressions', 'clicks', 'conversions'],
              period: '30d'
            }
          }
        ];
      }

      res.json({
        success: true,
        data: widgets
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get data for specific widget type
   */
  static async getWidgetData(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { type } = req.params;
      const {
        startDate,
        endDate,
        platforms,
        campaignIds,
        granularity = 'day'
      } = req.query;

      // Set default date range if not provided
      const endDateObj = endDate ? new Date(endDate as string) : new Date();
      const startDateObj = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const dateRange = validateDateRange(startDateObj, endDateObj);

      let data;

      switch (type) {
        case 'spend-chart':
          data = await DashboardController.getSpendChartData(userId, dateRange, platforms as string, granularity as string);
          break;
        case 'conversion-funnel':
          data = await DashboardController.getConversionFunnelData(userId, dateRange, platforms as string);
          break;
        case 'top-campaigns':
          data = await DashboardController.getTopCampaignsData(userId, dateRange, platforms as string);
          break;
        case 'platform-breakdown':
          data = await DashboardController.getPlatformBreakdownData(userId, dateRange);
          break;
        case 'metric-card':
          data = await DashboardController.getMetricCardData(userId, dateRange, platforms as string);
          break;
        default:
          throw new NotFoundError(`Widget type '${type}' not found`);
      }

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get dashboard alerts
   */
  static async getAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { severity, limit = 10 } = req.query;

      const alerts = await DashboardController.getRecentAlerts(
        userId,
        parseInt(limit as string),
        severity as string
      );

      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark alert as read
   */
  static async markAlertAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      // In a real implementation, you would have an alerts table
      // For now, we'll simulate marking as read
      logger.info(`Alert ${id} marked as read by user ${userId}`);

      res.json({
        success: true,
        message: 'Alert marked as read'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get real-time dashboard data
   */
  static async getRealTimeData(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { campaignIds } = req.query;

      let campaigns;

      if (campaignIds) {
        const ids = (campaignIds as string).split(',');
        campaigns = await prisma.campaign.findMany({
          where: {
            id: { in: ids },
            userId
          },
          select: { id: true, name: true, platform: true }
        });
      } else {
        campaigns = await prisma.campaign.findMany({
          where: {
            userId,
            status: 'ACTIVE'
          },
          select: { id: true, name: true, platform: true },
          take: 20
        });
      }

      const realTimeMetrics = await DashboardController.metricsService.getRealTimeMetrics(
        campaigns.map(c => c.id)
      );

      // Calculate totals
      const totals = realTimeMetrics.reduce(
        (acc, metric) => ({
          spend: acc.spend + metric.currentSpend,
          clicks: acc.clicks + metric.currentClicks,
          conversions: acc.conversions + metric.currentConversions
        }),
        { spend: 0, clicks: 0, conversions: 0 }
      );

      // Get active alerts
      const alerts = realTimeMetrics.flatMap(metric => metric.alerts);

      res.json({
        success: true,
        data: {
          timestamp: new Date(),
          campaigns: realTimeMetrics.map(metric => ({
            ...metric,
            name: campaigns.find(c => c.id === metric.campaignId)?.name,
            platform: campaigns.find(c => c.id === metric.campaignId)?.platform
          })),
          totals,
          alerts: alerts.filter(alert => alert.severity === 'high')
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get custom dashboards
   */
  static async getCustomDashboards(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const dashboards = await prisma.customDashboard.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' }
      });

      res.json({
        success: true,
        data: dashboards
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create custom dashboard
   */
  static async createCustomDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { name, layout, isDefault = false, isPublic = false } = req.body;

      // If setting as default, unset other defaults
      if (isDefault) {
        await prisma.customDashboard.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false }
        });
      }

      const dashboard = await prisma.customDashboard.create({
        data: {
          userId,
          name,
          layout,
          isDefault,
          isPublic
        }
      });

      res.status(201).json({
        success: true,
        message: 'Custom dashboard created successfully',
        data: dashboard
      });

      logger.info(`Custom dashboard created: ${name} by user: ${userId}`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get custom dashboard by ID
   */
  static async getCustomDashboardById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const dashboard = await prisma.customDashboard.findFirst({
        where: {
          id,
          OR: [
            { userId },
            { isPublic: true }
          ]
        }
      });

      if (!dashboard) {
        throw new NotFoundError('Dashboard not found');
      }

      res.json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update custom dashboard
   */
  static async updateCustomDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { name, layout, isDefault, isPublic } = req.body;

      const dashboard = await prisma.customDashboard.findFirst({
        where: { id, userId }
      });

      if (!dashboard) {
        throw new NotFoundError('Dashboard not found');
      }

      // If setting as default, unset other defaults
      if (isDefault) {
        await prisma.customDashboard.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false }
        });
      }

      const updatedDashboard = await prisma.customDashboard.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(layout && { layout }),
          ...(isDefault !== undefined && { isDefault }),
          ...(isPublic !== undefined && { isPublic })
        }
      });

      res.json({
        success: true,
        message: 'Dashboard updated successfully',
        data: updatedDashboard
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete custom dashboard
   */
  static async deleteCustomDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const dashboard = await prisma.customDashboard.findFirst({
        where: { id, userId }
      });

      if (!dashboard) {
        throw new NotFoundError('Dashboard not found');
      }

      await prisma.customDashboard.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Dashboard deleted successfully'
      });

      logger.info(`Custom dashboard deleted: ${dashboard.name} by user: ${userId}`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export dashboard data
   */
  static async exportData(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { format, startDate, endDate, platforms, campaignIds, metrics } = req.body;

      const dateRange = validateDateRange(new Date(startDate), new Date(endDate));

      // Generate export data
      const exportData = await DashboardController.generateExportData(
        userId,
        dateRange,
        platforms,
        campaignIds,
        metrics
      );

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `admetrics-export-${timestamp}.${format}`;

      // In a real implementation, you would:
      // 1. Generate the file in the requested format
      // 2. Store it temporarily
      // 3. Return a download URL
      
      const downloadUrl = `/api/exports/${filename}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      res.json({
        success: true,
        data: {
          downloadUrl,
          filename,
          expiresAt
        }
      });

      logger.info(`Data export requested: ${format} by user: ${userId}`);
    } catch (error) {
      next(error);
    }
  }

  // Helper methods

  private static async getSpendChartData(
    userId: string,
    dateRange: { startDate: Date; endDate: Date },
    platforms?: string,
    granularity: string = 'day'
  ) {
    const query = {
      userId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      platforms: platforms?.split(','),
      granularity: granularity as 'day',
      includeComparison: true,
      comparisonPeriod: 30
    };

    const result = await DashboardController.metricsService.getMetrics(query);
    
    return {
      current: result.metrics.map(m => ({
        date: m.date,
        value: m.spend
      })),
      previous: result.comparison?.totalSpend || 0,
      change: result.aggregated.trends.spendChange
    };
  }

  private static async getConversionFunnelData(
    userId: string,
    dateRange: { startDate: Date; endDate: Date },
    platforms?: string
  ) {
    const query = {
      userId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      platforms: platforms?.split(','),
      granularity: 'day' as const
    };

    const result = await DashboardController.metricsService.getMetrics(query);
    
    return {
      stages: [
        { name: 'Impressions', value: result.aggregated.totalImpressions },
        { name: 'Clicks', value: result.aggregated.totalClicks },
        { name: 'Conversions', value: result.aggregated.totalConversions }
      ]
    };
  }

  private static async getTopCampaignsData(
    userId: string,
    dateRange: { startDate: Date; endDate: Date },
    platforms?: string
  ) {
    // This would be implemented with actual campaign performance aggregation
    return [];
  }

  private static async getPlatformBreakdownData(
    userId: string,
    dateRange: { startDate: Date; endDate: Date }
  ) {
    const query = {
      userId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      granularity: 'day' as const
    };

    const result = await DashboardController.metricsService.getMetrics(query);
    
    return result.aggregated.platformBreakdown;
  }

  private static async getMetricCardData(
    userId: string,
    dateRange: { startDate: Date; endDate: Date },
    platforms?: string
  ) {
    const query = {
      userId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      platforms: platforms?.split(','),
      granularity: 'day' as const,
      includeComparison: true,
      comparisonPeriod: 30
    };

    const result = await DashboardController.metricsService.getMetrics(query);
    
    return {
      current: result.aggregated,
      previous: result.comparison,
      trends: result.aggregated.trends
    };
  }

  private static async getRecentAlerts(
    userId: string,
    limit: number = 10,
    severity?: string
  ) {
    // In a real implementation, this would query an alerts table
    // For now, return mock data
    return [
      {
        id: '1',
        type: 'budget_threshold',
        severity: 'medium',
        message: 'Campaign "Summer Sale" approaching budget limit',
        campaignName: 'Summer Sale',
        timestamp: new Date(),
        isRead: false
      },
      {
        id: '2',
        type: 'performance_drop',
        severity: 'high',
        message: 'Significant drop in conversions for "Holiday Campaign"',
        campaignName: 'Holiday Campaign',
        timestamp: new Date(Date.now() - 60 * 60 * 1000),
        isRead: false
      }
    ].filter(alert => !severity || alert.severity === severity).slice(0, limit);
  }

  private static async generateExportData(
    userId: string,
    dateRange: { startDate: Date; endDate: Date },
    platforms?: string[],
    campaignIds?: string[],
    metrics?: string[]
  ) {
    const query = {
      userId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      platforms,
      campaignIds,
      granularity: 'day' as const
    };

    return await DashboardController.metricsService.getMetrics(query);
  }
}