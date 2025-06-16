import { Request, Response, NextFunction } from 'express';
import { CampaignService } from '../services/campaign.service';
import { AIService } from '../services/ai.service';
import { WebSocketService } from '../services/websocket.service';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export class CampaignController {
  private static campaignService = new CampaignService();
  private static aiService = new AIService();
  private static wsService = WebSocketService.getInstance();

  /**
   * List campaigns with pagination and filters
   */
  static async listCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const {
        page = '1',
        limit = '20',
        platform,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const campaigns = await CampaignController.campaignService.listCampaigns({
        userId,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        filters: {
          platform: platform as string,
          status: status as string,
          search: search as string
        },
        sort: {
          field: sortBy as string,
          order: sortOrder as 'asc' | 'desc'
        }
      });

      res.json({
        success: true,
        data: campaigns.data,
        pagination: campaigns.pagination
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

      const campaign = await CampaignController.campaignService.getCampaignById(id, userId);

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
   * Create new campaign
   */
  static async createCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const campaignData = req.body;

      const campaign = await CampaignController.campaignService.createCampaign({
        ...campaignData,
        userId
      });

      // Emit WebSocket event
      CampaignController.wsService.emitToUser(userId, 'campaign:created', {
        campaign
      });

      res.status(201).json({
        success: true,
        data: campaign,
        message: 'Campaign created successfully'
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

      const campaign = await CampaignController.campaignService.updateCampaign(
        id,
        userId,
        updates
      );

      // Emit WebSocket event
      CampaignController.wsService.emitToUser(userId, 'campaign:updated', {
        campaignId: id,
        updates
      });

      res.json({
        success: true,
        data: campaign,
        message: 'Campaign updated successfully'
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

      await CampaignController.campaignService.deleteCampaign(id, userId);

      // Emit WebSocket event
      CampaignController.wsService.emitToUser(userId, 'campaign:deleted', {
        campaignId: id
      });

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

      const campaign = await CampaignController.campaignService.updateCampaignStatus(
        id,
        userId,
        'PAUSED'
      );

      res.json({
        success: true,
        data: campaign,
        message: 'Campaign paused successfully'
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

      const campaign = await CampaignController.campaignService.updateCampaignStatus(
        id,
        userId,
        'ACTIVE'
      );

      res.json({
        success: true,
        data: campaign,
        message: 'Campaign resumed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Duplicate campaign
   */
  static async duplicateCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const { name } = req.body;

      const campaign = await CampaignController.campaignService.duplicateCampaign(
        id,
        userId,
        name
      );

      res.status(201).json({
        success: true,
        data: campaign,
        message: 'Campaign duplicated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk pause campaigns
   */
  static async bulkPauseCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { campaignIds } = req.body;

      if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
        throw new ValidationError('Campaign IDs array is required');
      }

      const results = await CampaignController.campaignService.bulkUpdateStatus(
        campaignIds,
        userId,
        'PAUSED'
      );

      res.json({
        success: true,
        data: results,
        message: `${results.updated} campaigns paused successfully`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get campaign insights
   */
  static async getCampaignInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const [campaign, insights] = await Promise.all([
        CampaignController.campaignService.getCampaignById(id, userId),
        CampaignController.aiService.getCampaignInsights(id)
      ]);

      if (!campaign) {
        throw new NotFoundError('Campaign not found');
      }

      res.json({
        success: true,
        data: insights
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get campaign performance
   */
  static async getCampaignPerformance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const { period = '7d' } = req.query;

      const performance = await CampaignController.campaignService.getCampaignPerformance(
        id,
        userId,
        period as string
      );

      res.json({
        success: true,
        data: performance
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk resume campaigns
   */
  static async bulkResumeCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { campaignIds } = req.body;

      if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
        throw new ValidationError('Campaign IDs array is required');
      }

      const results = await CampaignController.campaignService.bulkUpdateStatus(
        campaignIds,
        userId,
        'ACTIVE'
      );

      res.json({
        success: true,
        data: results,
        message: `${results.updated} campaigns resumed successfully`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk delete campaigns
   */
  static async bulkDeleteCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { campaignIds } = req.body;

      if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
        throw new ValidationError('Campaign IDs array is required');
      }

      const results = await CampaignController.campaignService.bulkDelete(
        campaignIds,
        userId
      );

      res.json({
        success: true,
        data: results,
        message: `${results.deleted} campaigns deleted successfully`
      });
    } catch (error) {
      next(error);
    }
  }
}