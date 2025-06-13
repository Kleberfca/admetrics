import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { MetricsService } from '../services/metrics.service';
import { CampaignService } from '../services/campaigns.service';
import { AIInsightsService } from '../services/ai-insights.service';
import { logger } from '../utils/logger';
import { validateDateRange, formatMetrics } from '../utils/data-normalizer';
import { UnauthorizedError, NotFoundError } from '../middleware/error.middleware';

// Validation schemas
const dashboardOverviewSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  platforms: z.string().optional(),
  campaignIds: z.string().optional(),
  timezone: z.string().optional().default('UTC'),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
});

const metricsQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  platforms: z.string().optional(),
  campaignIds: z.string().optional(),
  metrics: z.string().optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
  timezone: z.string().optional().default('UTC'),
  includeComparison: z.string().optional().transform(val => val === 'true'),
});

const customDashboardSchema = z.object({
  name: z.string().min(1, 'Dashboard name is required'),
  layout: z.array(z.object({
    id: z.string(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    config: z.record(z.any()),
  })),
  isDefault: z.boolean().optional().default(false),
  isPublic: z.boolean().optional().default(false),
});

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class DashboardController {
  private prisma: PrismaClient;
  private redis: Redis;
  private metricsService: MetricsService;
  private campaignService: CampaignService;
  private aiInsightsService: AIInsightsService;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.metricsService = new MetricsService(prisma, redis);
    this.campaignService = new CampaignService(prisma, redis);
    this.aiInsightsService = new AIInsightsService(prisma, redis);
  }

  /**
   * @swagger
   * /api/dashboard/overview:
   *   get:
   *     summary: Get dashboard overview with key metrics
   *     tags: [Dashboard]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Start date for metrics
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date-time
   *         description: End date for metrics
   *       - in: query
   *         name: platforms
   *         schema:
   *           type: string
   *         description: Comma-separated list of platforms
   *       - in: query
   *         name: campaignIds
   *         schema:
   *           type: string
   *         description: Comma-separated list of campaign IDs
   *     responses:
   *       200:
   *         description: Dashboard overview data
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  public getOverview = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new UnauthorizedError('User not authenticated');
      }

      const validatedQuery = dashboardOverviewSchema.parse(req.query);

      // Set default date range (last 30 days) if not provided
      const endDate = validatedQuery.endDate 
        ? new Date(validatedQuery.endDate)
        : new Date();
      const startDate = validatedQuery.startDate
        ? new Date(validatedQuery.startDate)
        : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Validate date range
      validateDateRange(startDate, endDate);

      // Parse platforms and campaign IDs
      const platforms = validatedQuery.platforms 
        ? validatedQuery.platforms.split(',').map(p => p.trim())
        : undefined;
      const campaignIds = validatedQuery.campaignIds
        ? validatedQuery.campaignIds.split(',').map(id => id.trim())
        : undefined;

      // Check cache first
      const cacheKey = `dashboard:overview:${userId}:${JSON.stringify({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        platforms,
        campaignIds,
        granularity: validatedQuery.granularity,
      })}`;

      const cachedData = await this.redis.get(cacheKey);
      if (cachedData) {
        logger.info('Dashboard overview served from cache', { userId });
        res.status(200).json({
          success: true,
          data: JSON.parse(cachedData),
          cached: true,
        });
        return;
      }

      // Fetch data concurrently
      const [
        summary,
        campaigns,
        topCampaigns,
        platformMetrics,
        alerts,
        aiInsights,
        performanceScore,
      ] = await Promise.all([
        this.metricsService.getSummaryMetrics(userId, {
          startDate,
          endDate,
          platforms,
          campaignIds,
        }),
        this.campaignService.getCampaignsSummary(userId, {
          platforms,
          campaignIds,
        }),
        this.campaignService.getTopPerformingCampaigns(userId, {
          startDate,
          endDate,
          platforms,
          limit: 5,
        }),
        this.metricsService.getPlatformComparison(userId, {
          startDate,
          endDate,
          platforms,
        }),
        this.getRecentAlerts(userId, 10),
        this.aiInsightsService.getLatestInsights(userId, 3),
        this.calculatePerformanceScore(userId, { startDate, endDate, platforms }),
      ]);

      const overview = {
        summary: {
          current: summary.current,
          previous: summary.previous,
          change: summary.change,
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            days: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
          },
        },
        campaigns: {
          total: campaigns.total,
          active: campaigns.active,
          paused: campaigns.paused,
          draft: campaigns.draft,
        },
        topCampaigns,
        platforms: platformMetrics,
        alerts: {
          total: alerts.length,
          unread: alerts.filter(alert => !alert.isRead).length,
          recent: alerts.slice(0, 5),
        },
        aiInsights,
        performance: {
          score: performanceScore.score,
          grade: performanceScore.grade,
          factors: performanceScore.factors,
          recommendations: performanceScore.recommendations,
        },
        lastUpdated: new Date().toISOString(),
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(overview));

      logger.info('Dashboard overview generated', {
        userId,
        campaigns: campaigns.total,
        platforms: platformMetrics.length,
      });

      res.status(200).json({
        success: true,
        data: overview,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
        });
        return;
      }
      next(error);
    }
  };

  /**
   * @swagger
   * /api/dashboard/metrics:
   *   get:
   *     summary: Get detailed metrics data for dashboard charts
   *     tags: [Dashboard]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: startDate
   *         required: true
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: endDate
   *         required: true
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: platforms
   *         schema:
   *           type: string
   *       - in: query
   *         name: metrics
   *         schema:
   *           type: string
   *       - in: query
   *         name: granularity
   *         schema:
   *           type: string
   *           enum: [hour, day, week, month]
   *       - in: query
   *         name: includeComparison
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: Metrics data for charts
   */
  public getMetrics = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new UnauthorizedError('User not authenticated');
      }

      const validatedQuery = metricsQuerySchema.parse(req.query);

      const startDate = new Date(validatedQuery.startDate);
      const endDate = new Date(validatedQuery.endDate);

      validateDateRange(startDate, endDate);

      const platforms = validatedQuery.platforms 
        ? validatedQuery.platforms.split(',').map(p => p.trim())
        : undefined;
      const metrics = validatedQuery.metrics
        ? validatedQuery.metrics.split(',').map(m => m.trim())
        : ['spend', 'clicks', 'conversions', 'ctr', 'cpc', 'roas'];

      // Get metrics data
      const metricsData = await this.metricsService.getMetricsTimeSeries(userId, {
        startDate,
        endDate,
        platforms,
        metrics,
        granularity: validatedQuery.granularity,
        timezone: validatedQuery.timezone,
      });

      let comparisonData = null;
      if (validatedQuery.includeComparison) {
        const periodLength = endDate.getTime() - startDate.getTime();
        const comparisonStartDate = new Date(startDate.getTime() - periodLength);
        const comparisonEndDate = new Date(startDate.getTime());

        comparisonData = await this.metricsService.getMetricsTimeSeries(userId, {
          startDate: comparisonStartDate,
          endDate: comparisonEndDate,
          platforms,
          metrics,
          granularity: validatedQuery.granularity,
          timezone: validatedQuery.timezone,
        });
      }

      res.status(200).json({
        success: true,
        data: {
          current: metricsData,
          comparison: comparisonData,
          metadata: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            granularity: validatedQuery.granularity,
            platforms,
            metrics,
            includeComparison: validatedQuery.includeComparison,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
        });
        return;
      }
      next(error);
    }
  };

  /**
   * @swagger
   * /api/dashboard/realtime:
   *   get:
   *     summary: Get real-time dashboard updates
   *     tags: [Dashboard]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Real-time metrics
   */
  public getRealTimeUpdates = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new UnauthorizedError('User not authenticated');
      }

      // Get real-time data from the last hour
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 60 * 60 * 1000); // Last hour

      const [currentMetrics, alerts, activeConnections] = await Promise.all([
        this.metricsService.getRealTimeMetrics(userId, {
          startDate,
          endDate,
        }),
        this.getRecentAlerts(userId, 5),
        this.getActiveIntegrations(userId),
      ]);

      res.status(200).json({
        success: true,
        data: {
          metrics: currentMetrics,
          alerts,
          integrations: activeConnections,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /api/dashboard/custom:
   *   post:
   *     summary: Create a custom dashboard layout
   *     tags: [Dashboard]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - layout
   *             properties:
   *               name:
   *                 type: string
   *               layout:
   *                 type: array
   *               isDefault:
   *                 type: boolean
   *               isPublic:
   *                 type: boolean
   *     responses:
   *       201:
   *         description: Custom dashboard created
   */
  public createCustomDashboard = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new UnauthorizedError('User not authenticated');
      }

      const validatedData = customDashboardSchema.parse(req.body);

      // If setting as default, remove default flag from other dashboards
      if (validatedData.isDefault) {
        await this.prisma.customDashboard.updateMany({
          where: {
            userId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      const dashboard = await this.prisma.customDashboard.create({
        data: {
          userId,
          name: validatedData.name,
          layout: validatedData.layout,
          isDefault: validatedData.isDefault,
          isPublic: validatedData.isPublic,
        },
      });

      logger.info('Custom dashboard created', {
        userId,
        dashboardId: dashboard.id,
        name: dashboard.name,
      });

      res.status(201).json({
        success: true,
        message: 'Custom dashboard created successfully',
        data: { dashboard },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
        });
        return;
      }
      next(error);
    }
  };

  /**
   * @swagger
   * /api/dashboard/custom:
   *   get:
   *     summary: Get user's custom dashboards
   *     tags: [Dashboard]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of custom dashboards
   */
  public getCustomDashboards = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new UnauthorizedError('User not authenticated');
      }

      const dashboards = await this.prisma.customDashboard.findMany({
        where: {
          OR: [
            { userId },
            { isPublic: true },
          ],
        },
        orderBy: [
          { isDefault: 'desc' },
          { updatedAt: 'desc' },
        ],
        select: {
          id: true,
          name: true,
          layout: true,
          isDefault: true,
          isPublic: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        data: { dashboards },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Private helper methods
   */
  private async getRecentAlerts(userId: string, limit: number = 10) {
    return await this.prisma.alert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        severity: true,
        isRead: true,
        data: true,
        createdAt: true,
      },
    });
  }

  private async getActiveIntegrations(userId: string) {
    return await this.prisma.integration.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        platform: true,
        name: true,
        status: true,
        lastSyncAt: true,
        syncEnabled: true,
      },
    });
  }

  private async calculatePerformanceScore(
    userId: string,
    options: { startDate: Date; endDate: Date; platforms?: string[] }
  ) {
    try {
      // This is a simplified performance scoring algorithm
      // In production, this would be more sophisticated
      const metrics = await this.metricsService.getSummaryMetrics(userId, options);
      
      let score = 0;
      const factors = [];
      
      // ROAS factor (0-40 points)
      if (metrics.current.roas >= 4) {
        score += 40;
        factors.push({ name: 'ROAS', score: 40, status: 'excellent' });
      } else if (metrics.current.roas >= 2) {
        score += 25;
        factors.push({ name: 'ROAS', score: 25, status: 'good' });
      } else {
        score += 10;
        factors.push({ name: 'ROAS', score: 10, status: 'poor' });
      }
      
      // CTR factor (0-30 points)
      if (metrics.current.ctr >= 3) {
        score += 30;
        factors.push({ name: 'CTR', score: 30, status: 'excellent' });
      } else if (metrics.current.ctr >= 1.5) {
        score += 20;
        factors.push({ name: 'CTR', score: 20, status: 'good' });
      } else {
        score += 5;
        factors.push({ name: 'CTR', score: 5, status: 'poor' });
      }
      
      // Conversion Rate factor (0-30 points)
      if (metrics.current.conversionRate >= 5) {
        score += 30;
        factors.push({ name: 'Conversion Rate', score: 30, status: 'excellent' });
      } else if (metrics.current.conversionRate >= 2) {
        score += 20;
        factors.push({ name: 'Conversion Rate', score: 20, status: 'good' });
      } else {
        score += 5;
        factors.push({ name: 'Conversion Rate', score: 5, status: 'poor' });
      }
      
      // Determine grade
      let grade: string;
      if (score >= 85) grade = 'A';
      else if (score >= 70) grade = 'B';
      else if (score >= 55) grade = 'C';
      else if (score >= 40) grade = 'D';
      else grade = 'F';
      
      // Generate recommendations
      const recommendations = [];
      if (metrics.current.roas < 2) {
        recommendations.push('Consider optimizing targeting to improve ROAS');
      }
      if (metrics.current.ctr < 1.5) {
        recommendations.push('Test new ad creatives to improve click-through rates');
      }
      if (metrics.current.conversionRate < 2) {
        recommendations.push('Review landing page experience and conversion funnel');
      }
      
      return {
        score,
        grade,
        factors,
        recommendations,
      };
    } catch (error) {
      logger.error('Error calculating performance score:', error);
      return {
        score: 0,
        grade: 'N/A',
        factors: [],
        recommendations: [],
      };
    }
  }
}

export default DashboardController;