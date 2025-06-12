// backend/src/controllers/campaigns.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { CampaignsService } from '../services/campaigns.service';
import { MetricsService } from '../services/metrics.service';
import { AIInsightsService } from '../services/ai-insights.service';

const prisma = new PrismaClient();

// Validation schemas
const getCampaignsSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  platforms: z.string().optional().transform(val => val ? val.split(',') : undefined),
  status: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  platform: z.enum(['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS']),
  integrationId: z.string().min(1, 'Integration ID is required'),
  objective: z.string().optional(),
  budget: z.number().min(0).optional(),
  budgetType: z.enum(['DAILY', 'LIFETIME']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  targeting: z.any().optional(),
  geoTargeting: z.any().optional()
});

const updateCampaignSchema = createCampaignSchema.partial();

const campaignMetricsSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
  metrics: z.array(z.string()).optional()
});

export class CampaignsController {
  private campaignsService: CampaignsService;
  private metricsService: MetricsService;
  private aiInsightsService: AIInsightsService;

  constructor() {
    this.campaignsService = new CampaignsService();
    this.metricsService = new MetricsService();
    this.aiInsightsService = new AIInsightsService();
  }

  /**
   * Get campaigns list with pagination and filters
   */
  static async getCampaigns(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const query = getCampaignsSchema.parse(req.query);

      const { page, limit, platforms, status, search, sortBy, sortOrder } = query;

      // Build where clause
      const where: any = {
        userId,
        ...(platforms && { platform: { in: platforms } }),
        ...(status && { status }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { objective: { contains: search, mode: 'insensitive' } }
          ]
        })
      };

      // Get campaigns with pagination
      const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
          where,
          include: {
            integration: {
              select: {
                id: true,
                name: true,
                platform: true,
                status: true
              }
            },
            metrics: {
              where: {
                date: {
                  gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                }
              },
              select: {
                spend: true,
                clicks: true,
                impressions: true,
                conversions: true,
                ctr: true,
                cpc: true,
                roas: true
              }
            },
            insights: {
              where: {
                status: 'ACTIVE',
                priority: { in: ['HIGH', 'CRITICAL'] }
              },
              select: {
                id: true,
                type: true,
                title: true,
                priority: true
              },
              take: 3
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.campaign.count({ where })
      ]);

      // Calculate aggregated metrics for each campaign
      const campaignsWithMetrics = campaigns.map(campaign => {
        const aggregatedMetrics = campaign.metrics.reduce((acc, metric) => ({
          spend: acc.spend + Number(metric.spend || 0),
          clicks: acc.clicks + Number(metric.clicks || 0),
          impressions: acc.impressions + Number(metric.impressions || 0),
          conversions: acc.conversions + (metric.conversions || 0),
          ctr: 0, // Will calculate below
          cpc: 0, // Will calculate below
          roas: 0 // Will calculate below
        }), { spend: 0, clicks: 0, impressions: 0, conversions: 0, ctr: 0, cpc: 0, roas: 0 });

        // Calculate derived metrics
        if (aggregatedMetrics.impressions > 0) {
          aggregatedMetrics.ctr = (aggregatedMetrics.clicks / aggregatedMetrics.impressions) * 100;
        }
        if (aggregatedMetrics.clicks > 0) {
          aggregatedMetrics.cpc = aggregatedMetrics.spend / aggregatedMetrics.clicks;
        }
        if (aggregatedMetrics.spend > 0) {
          // Assuming revenue is conversions * average order value (simplified)
          const estimatedRevenue = aggregatedMetrics.conversions * 50; // Placeholder
          aggregatedMetrics.roas = estimatedRevenue / aggregatedMetrics.spend;
        }

        return {
          ...campaign,
          metrics: aggregatedMetrics,
          insights: campaign.insights
        };
      });

      const pages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: {
          campaigns: campaignsWithMetrics,
          pagination: {
            page,
            limit,
            total,
            pages
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

      logger.error('Get campaigns error:', error);
      next(error);
    }
  }

  /**
   * Get single campaign by ID
   */
  static async getCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          integration: {
            select: {
              id: true,
              name: true,
              platform: true,
              status: true
            }
          },
          metrics: {
            orderBy: { date: 'desc' },
            take: 90 // Last 90 days
          },
          insights: {
            where: { status: 'ACTIVE' },
            orderBy: { priority: 'desc' },
            take: 10
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

      res.json({
        success: true,
        data: campaign
      });

    } catch (error) {
      logger.error('Get campaign error:', error);
      next(error);
    }
  }

  /**
   * Create new campaign
   */
  static async createCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const campaignData = createCampaignSchema.parse(req.body);

      // Verify integration ownership
      const integration = await prisma.integration.findUnique({
        where: { id: campaignData.integrationId }
      });

      if (!integration || integration.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Integration not found',
          message: 'The specified integration was not found or you do not have access to it'
        });
      }

      // Verify platform matches integration
      if (integration.platform !== campaignData.platform) {
        return res.status(400).json({
          success: false,
          error: 'Platform mismatch',
          message: 'Campaign platform must match integration platform'
        });
      }

      const campaign = await prisma.campaign.create({
        data: {
          ...campaignData,
          userId,
          externalId: `local_${Date.now()}`, // Temporary ID for local campaigns
          status: 'DRAFT',
          startDate: campaignData.startDate ? new Date(campaignData.startDate) : undefined,
          endDate: campaignData.endDate ? new Date(campaignData.endDate) : undefined
        },
        include: {
          integration: {
            select: {
              id: true,
              name: true,
              platform: true,
              status: true
            }
          }
        }
      });

      logger.info(`Campaign created: ${campaign.id}`, { userId, campaignId: campaign.id });

      res.status(201).json({
        success: true,
        data: campaign,
        message: 'Campaign created successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Create campaign error:', error);
      next(error);
    }
  }

  /**
   * Update campaign
   */
  static async updateCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const updates = updateCampaignSchema.parse(req.body);

      // Verify campaign ownership
      const existingCampaign = await prisma.campaign.findUnique({
        where: { id }
      });

      if (!existingCampaign || existingCampaign.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
          message: 'The requested campaign was not found or you do not have access to it'
        });
      }

      const campaign = await prisma.campaign.update({
        where: { id },
        data: {
          ...updates,
          startDate: updates.startDate ? new Date(updates.startDate) : undefined,
          endDate: updates.endDate ? new Date(updates.endDate) : undefined,
          updatedAt: new Date()
        },
        include: {
          integration: {
            select: {
              id: true,
              name: true,
              platform: true,
              status: true
            }
          }
        }
      });

      logger.info(`Campaign updated: ${campaign.id}`, { userId, campaignId: campaign.id });

      res.json({
        success: true,
        data: campaign,
        message: 'Campaign updated successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Update campaign error:', error);
      next(error);
    }
  }

  /**
   * Delete campaign
   */
  static async deleteCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      // Verify campaign ownership
      const campaign = await prisma.campaign.findUnique({
        where: { id }
      });

      if (!campaign || campaign.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
          message: 'The requested campaign was not found or you do not have access to it'
        });
      }

      await prisma.campaign.delete({
        where: { id }
      });

      logger.info(`Campaign deleted: ${id}`, { userId, campaignId: id });

      res.json({
        success: true,
        message: 'Campaign deleted successfully'
      });

    } catch (error) {
      logger.error('Delete campaign error:', error);
      next(error);
    }
  }

  /**
   * Get campaign metrics
   */
  static async getCampaignMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const query = campaignMetricsSchema.parse(req.query);

      // Verify campaign ownership
      const campaign = await prisma.campaign.findUnique({
        where: { id }
      });

      if (!campaign || campaign.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
          message: 'The requested campaign was not found or you do not have access to it'
        });
      }

      const metricsService = new MetricsService();
      const metrics = await metricsService.getCampaignMetrics(id, {
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
        granularity: query.granularity
      });

      res.json({
        success: true,
        data: metrics
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Get campaign metrics error:', error);
      next(error);
    }
  }

  /**
   * Get campaign performance trends
   */
  static async getCampaignTrends(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { metric = 'spend', days = 30 } = req.query;

      // Verify campaign ownership
      const campaign = await prisma.campaign.findUnique({
        where: { id }
      });

      if (!campaign || campaign.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - Number(days) * 24 * 60 * 60 * 1000);

      const metricsService = new MetricsService();
      const trends = await metricsService.getCampaignTrends(id, {
        startDate,
        endDate,
        metric: metric as string
      });

      res.json({
        success: true,
        data: trends
      });

    } catch (error) {
      logger.error('Get campaign trends error:', error);
      next(error);
    }
  }

  /**
   * Get campaign AI insights
   */
  static async getCampaignInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { status = 'ACTIVE', limit = 10 } = req.query;

      // Verify campaign ownership
      const campaign = await prisma.campaign.findUnique({
        where: { id }
      });

      if (!campaign || campaign.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      const insights = await prisma.aIInsight.findMany({
        where: {
          campaignId: id,
          ...(status && { status: status as string })
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ],
        take: Number(limit)
      });

      res.json({
        success: true,
        data: insights
      });

    } catch (error) {
      logger.error('Get campaign insights error:', error);
      next(error);
    }
  }

  /**
   * Sync campaign data from platform
   */
  static async syncCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      // Verify campaign ownership
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: { integration: true }
      });

      if (!campaign || campaign.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      const campaignsService = new CampaignsService();
      const result = await campaignsService.syncCampaignData(id);

      res.json({
        success: true,
        data: result,
        message: 'Campaign sync initiated'
      });

    } catch (error) {
      logger.error('Sync campaign error:', error);
      next(error);
    }
  }

  /**
   * Bulk operations on campaigns
   */
  static async bulkOperations(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { operation, campaignIds, data } = req.body;

      if (!operation || !campaignIds || !Array.isArray(campaignIds)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'Operation and campaign IDs are required'
        });
      }

      // Verify all campaigns belong to user
      const campaigns = await prisma.campaign.findMany({
        where: {
          id: { in: campaignIds },
          userId
        }
      });

      if (campaigns.length !== campaignIds.length) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'One or more campaigns not found or access denied'
        });
      }

      let result;
      switch (operation) {
        case 'pause':
          result = await prisma.campaign.updateMany({
            where: { id: { in: campaignIds } },
            data: { status: 'PAUSED' }
          });
          break;
        
        case 'activate':
          result = await prisma.campaign.updateMany({
            where: { id: { in: campaignIds } },
            data: { status: 'ACTIVE' }
          });
          break;
        
        case 'delete':
          result = await prisma.campaign.deleteMany({
            where: { id: { in: campaignIds } }
          });
          break;
        
        case 'update':
          if (!data) {
            return res.status(400).json({
              success: false,
              error: 'Update data required'
            });
          }
          result = await prisma.campaign.updateMany({
            where: { id: { in: campaignIds } },
            data: data
          });
          break;
        
        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid operation',
            message: 'Supported operations: pause, activate, delete, update'
          });
      }

      logger.info(`Bulk operation completed: ${operation}`, { 
        userId, 
        campaignIds, 
        affected: result.count 
      });

      res.json({
        success: true,
        data: {
          operation,
          affected: result.count,
          campaignIds
        },
        message: `Bulk ${operation} completed successfully`
      });

    } catch (error) {
      logger.error('Bulk operations error:', error);
      next(error);
    }
  }
}