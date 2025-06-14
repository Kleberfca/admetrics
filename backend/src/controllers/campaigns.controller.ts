import { Request, Response, NextFunction } from 'express';
import { CampaignsService } from '../services/campaigns.service';
import { MetricsService } from '../services/metrics.service';
import { AIInsightsService } from '../services/ai-insights.service';
import { NotFoundError, ValidationError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { paginate } from '../config/database';
import { prisma } from '../config/database';

export class CampaignsController {
  private static campaignsService = new CampaignsService();
  private static metricsService = new MetricsService();
  private static aiInsightsService = new AIInsightsService();

  /**
   * Get campaigns list with pagination and filters
   */
  static async getCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { 
        page = 1, 
        limit = 20, 
        platforms, 
        status, 
        search, 
        sortBy = 'updatedAt', 
        sortOrder = 'desc' 
      } = req.query;

      // Build where clause
      const where: any = {
        userId,
        deletedAt: null,
        ...(platforms && { platform: { in: platforms as string[] } }),
        ...(status && { status }),
        ...(search && {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' } },
            { externalId: { contains: search as string, mode: 'insensitive' } }
          ]
        })
      };

      // Get paginated campaigns
      const result = await paginate(prisma.campaign, {
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
          _count: {
            select: {
              metrics: true,
              alerts: true,
              aiInsights: {
                where: { isRead: false }
              }
            }
          }
        },
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      });

      res.json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get campaign by ID
   */
  static async getCampaignById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const campaign = await CampaignsController.campaignsService.getCampaignById(id, userId);

      if (!campaign) {
        throw new NotFoundError('Campaign not found');
      }

      res.json({
        success: true,
        data: campaign
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new campaign
   */
  static async createCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const campaignData = req.body;

      const campaign = await CampaignsController.campaignsService.createCampaign({
        ...campaignData,
        userId
      });

      logger.info('Campaign created', { campaignId: campaign.id, userId });

      res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        data: campaign
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update campaign
   */
  static async updateCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const updates = req.body;

      const campaign = await CampaignsController.campaignsService.updateCampaign(
        id,
        userId,
        updates
      );

      logger.info('Campaign updated', { campaignId: id, userId });

      res.json({
        success: true,
        message: 'Campaign updated successfully',
        data: campaign
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete campaign
   */
  static async deleteCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      await CampaignsController.campaignsService.deleteCampaign(id, userId);

      logger.info('Campaign deleted', { campaignId: id, userId });

      res.json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Pause campaign
   */
  static async pauseCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const campaign = await CampaignsController.campaignsService.updateCampaignStatus(
        id,
        userId,
        'PAUSED'
      );

      logger.info('Campaign paused', { campaignId: id, userId });

      res.json({
        success: true,
        message: 'Campaign paused successfully',
        data: campaign
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resume campaign
   */
  static async resumeCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const campaign = await CampaignsController.campaignsService.updateCampaignStatus(
        id,
        userId,
        'ACTIVE'
      );

      logger.info('Campaign resumed', { campaignId: id, userId });

      res.json({
        success: true,
        message: 'Campaign resumed successfully',
        data: campaign
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Sync campaign data
   */
  static async syncCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      // Start sync process (async)
      CampaignsController.campaignsService.syncCampaign(id, userId)
        .then(() => {
          logger.info('Campaign sync completed', { campaignId: id, userId });
        })
        .catch((error) => {
          logger.error('Campaign sync failed', { campaignId: id, userId, error });
        });

      res.json({
        success: true,
        message: 'Campaign sync initiated. You will be notified when complete.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get campaign metrics
   */
  static async getCampaignMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const { startDate, endDate, granularity = 'day' } = req.query;

      if (!startDate || !endDate) {
        throw new ValidationError('Start date and end date are required');
      }

      const metrics = await CampaignsController.metricsService.getCampaignMetrics(
        id,
        userId,
        new Date(startDate as string),
        new Date(endDate as string),
        granularity as any
      );

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get campaign AI insights
   */
  static async getCampaignInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const insights = await CampaignsController.aiInsightsService.getCampaignInsights(
        id,
        userId
      );

      res.json({
        success: true,
        data: insights
      });
    } catch (error) {
      next(error);
    }
  }
}