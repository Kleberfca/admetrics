// backend/src/controllers/dashboard.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { MetricsService } from '../services/metrics.service';
import { AIInsightsService } from '../services/ai-insights.service';
import { CacheService } from '../services/cache.service';

const prisma = new PrismaClient();

// Validation schemas
const dashboardQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  platforms: z.array(z.string()).optional(),
  campaigns: z.array(z.string()).optional(),
  timezone: z.string().optional().default('UTC')
});

const metricsQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  platforms: z.array(z.string()).optional(),
  campaigns: z.array(z.string()).optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
  metrics: z.array(z.string()).optional()
});

export class DashboardController {
  private metricsService: MetricsService;
  private aiInsightsService: AIInsightsService;
  private cacheService: CacheService;

  constructor() {
    this.metricsService = new MetricsService();
    this.aiInsightsService = new AIInsightsService();
    this.cacheService = new CacheService();
  }

  /**
   * Get dashboard overview
   */
  static async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const query = dashboardQuerySchema.parse(req.query);
      
      // Set default date range (last 30 days)
      const endDate = query.endDate ? new Date(query.endDate) : new Date();
      const startDate = query.startDate 
        ? new Date(query.startDate) 
        : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Check cache first
      const cacheKey = `dashboard:overview:${userId}:${startDate.getTime()}:${endDate.getTime()}:${JSON.stringify(query.platforms)}`;
      const cached = await new CacheService().get(cacheKey);
      
      if (cached) {
        return res.json({
          success: true,
          data: cached,
          cached: true
        });
      }

      // Get user's campaigns
      const campaigns = await prisma.campaign.findMany({
        where: {
          userId,
          ...(query.platforms && { platform: { in: query.platforms } }),
          ...(query.campaigns && { id: { in: query.campaigns } })
        },
        select: {
          id: true,
          name: true,
          platform: true,
          status: true,
          budget: true,
          budgetType: true
        }
      });

      const campaignIds = campaigns.map(c => c.id);

      // Get metrics summary
      const metricsService = new MetricsService();
      const currentMetrics = await metricsService.getAggregatedMetrics(
        userId,
        { startDate, endDate, platforms: query.platforms, campaigns: query.campaigns }
      );

      // Get previous period metrics for comparison
      const previousStartDate = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
      const previousEndDate = startDate;
      
      const previousMetrics = await metricsService.getAggregatedMetrics(
        userId,
        { startDate: previousStartDate, endDate: previousEndDate, platforms: query.platforms, campaigns: query.campaigns }
      );

      // Calculate performance trends
      const performanceData = await metricsService.getMetricsTrends(
        userId,
        'spend',
        { startDate, endDate, platforms: query.platforms }
      );

      // Get platform breakdown
      const platformBreakdown = await metricsService.getPlatformBreakdown(
        userId,
        { startDate, endDate, platforms: query.platforms }
      );

      // Get top performing campaigns
      const topCampaigns = await metricsService.getTopCampaigns(
        userId,
        { startDate, endDate, platforms: query.platforms },
        5
      );

      // Get recent alerts
      const alerts = await prisma.alert.findMany({
        where: {
          userId,
          isActive: true,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          severity: true,
          isRead: true,
          createdAt: true
        }
      });

      const overview = {
        summary: {
          current: currentMetrics,
          previous: previousMetrics,
          change: {
            spend: currentMetrics.totalSpend - previousMetrics.totalSpend,
            clicks: currentMetrics.totalClicks - previousMetrics.totalClicks,
            conversions: currentMetrics.totalConversions - previousMetrics.totalConversions,
            roas: currentMetrics.averageROAS - previousMetrics.averageROAS
          }
        },
        campaigns: {
          total: campaigns.length,
          active: campaigns.filter(c => c.status === 'ACTIVE').length,
          paused: campaigns.filter(c => c.status === 'PAUSED').length,
          list: campaigns
        },
        performance: performanceData,
        platforms: platformBreakdown,
        topCampaigns,
        alerts: {
          total: alerts.length,
          unread: alerts.filter(a => !a.isRead).length,
          recent: alerts
        },
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      };

      // Cache for 5 minutes
      await new CacheService().set(cacheKey, overview, 300);

      res.json({
        success: true,
        data: overview
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Dashboard overview error:', error);
      next(error);
    }
  }

  /**
   * Get detailed metrics for dashboard
   */
  static async getMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const query = metricsQuerySchema.parse(req.query);
      
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);

      const metricsService = new MetricsService();

      // Get metrics based on granularity
      const metrics = await metricsService.getMetricsWithGranularity(
        userId,
        {
          startDate,
          endDate,
          platforms: query.platforms,
          campaigns: query.campaigns,
          granularity: query.granularity
        }
      );

      // Get comparison data (previous period)
      const periodLength = endDate.getTime() - startDate.getTime();
      const previousStartDate = new Date(startDate.getTime() - periodLength);
      const previousEndDate = startDate;

      const comparisonMetrics = await metricsService.getMetricsWithGranularity(
        userId,
        {
          startDate: previousStartDate,
          endDate: previousEndDate,
          platforms: query.platforms,
          campaigns: query.campaigns,
          granularity: query.granularity
        }
      );

      res.json({
        success: true,
        data: {
          current: metrics,
          comparison: comparisonMetrics,
          dateRange: {
            current: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
            comparison: { startDate: previousStartDate.toISOString(), endDate: previousEndDate.toISOString() }
          }
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Dashboard metrics error:', error);
      next(error);
    }
  }

  /**
   * Get AI insights for dashboard
   */
  static async getAIInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, platforms } = req.query;

      const aiInsightsService = new AIInsightsService();

      // Get active insights
      const insights = await aiInsightsService.getInsights(userId, {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        platforms: platforms ? (platforms as string).split(',') : undefined,
        limit: 10
      });

      // Get insights summary
      const summary = await aiInsightsService.getInsightsSummary(userId);

      res.json({
        success: true,
        data: {
          insights,
          summary
        }
      });

    } catch (error) {
      logger.error('Dashboard AI insights error:', error);
      next(error);
    }
  }

  /**
   * Get campaign performance details
   */
  static async getCampaignPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { campaignId } = req.params;
      const query = dashboardQuerySchema.parse(req.query);

      const endDate = query.endDate ? new Date(query.endDate) : new Date();
      const startDate = query.startDate 
        ? new Date(query.startDate) 
        : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Verify campaign ownership
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          integration: {
            select: {
              id: true,
              platform: true,
              name: true
            }
          }
        }
      });

      if (!campaign || campaign.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
          message: 'The requested campaign was not found or you do not have access to it'
        });
      }

      const metricsService = new MetricsService();

      // Get campaign metrics
      const metrics = await metricsService.getCampaignMetrics(campaignId, {
        startDate,
        endDate
      });

      // Get performance trends
      const trends = await metricsService.getCampaignTrends(campaignId, {
        startDate,
        endDate,
        granularity: 'day'
      });

      // Get AI insights for this campaign
      const insights = await prisma.aIInsight.findMany({
        where: {
          campaignId,
          status: 'ACTIVE',
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { priority: 'desc' },
        take: 5
      });

      res.json({
        success: true,
        data: {
          campaign,
          metrics,
          trends,
          insights
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Campaign performance error:', error);
      next(error);
    }
  }

  /**
   * Get real-time dashboard updates
   */
  static async getRealTimeUpdates(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { platforms } = req.query;

      // Get recent metric updates (last hour)
      const recentUpdates = await prisma.metric.findMany({
        where: {
          campaign: { userId },
          ...(platforms && { platform: { in: (platforms as string).split(',') } }),
          updatedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              platform: true
            }
          }
        }
      });

      // Aggregate real-time metrics
      const realTimeMetrics = {
        totalSpend: recentUpdates.reduce((sum, m) => sum + Number(m.spend || 0), 0),
        totalClicks: recentUpdates.reduce((sum, m) => sum + Number(m.clicks || 0), 0),
        totalConversions: recentUpdates.reduce((sum, m) => sum + (m.conversions || 0), 0),
        totalImpressions: recentUpdates.reduce((sum, m) => sum + Number(m.impressions || 0), 0),
        lastUpdated: recentUpdates[0]?.updatedAt || new Date()
      };

      res.json({
        success: true,
        data: {
          metrics: realTimeMetrics,
          updates: recentUpdates.slice(0, 10) // Return last 10 updates
        }
      });

    } catch (error) {
      logger.error('Real-time updates error:', error);
      next(error);
    }
  }

  /**
   * Export dashboard data
   */
  static async exportData(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const query = dashboardQuerySchema.parse(req.query);
      const { format = 'csv' } = req.query;

      const endDate = query.endDate ? new Date(query.endDate) : new Date();
      const startDate = query.startDate 
        ? new Date(query.startDate) 
        : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const metricsService = new MetricsService();

      // Get detailed metrics for export
      const exportData = await metricsService.getExportData(userId, {
        startDate,
        endDate,
        platforms: query.platforms,
        campaigns: query.campaigns,
        format: format as string
      });

      // Set appropriate headers
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `admetrics-dashboard-${timestamp}.${format}`;

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
      } else if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
      }

      res.send(exportData);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Dashboard export error:', error);
      next(error);
    }
  }
}