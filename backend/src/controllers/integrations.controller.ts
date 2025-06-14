import { Request, Response, NextFunction } from 'express';
import { IntegrationsService } from '../services/integrations/platform-manager.service';
import { NotFoundError, ValidationError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { Platform } from '@prisma/client';

export class IntegrationsController {
  private static integrationsService = new IntegrationsService();

  /**
   * Get all integrations for the user
   */
  static async getIntegrations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;

      const integrations = await prisma.integration.findMany({
        where: {
          userId,
          deletedAt: null
        },
        select: {
          id: true,
          platform: true,
          name: true,
          status: true,
          lastSyncAt: true,
          lastSyncError: true,
          syncEnabled: true,
          syncFrequency: true,
          createdAt: true,
          _count: {
            select: {
              campaigns: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.json({
        success: true,
        data: integrations
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get integration by ID
   */
  static async getIntegrationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const integration = await prisma.integration.findFirst({
        where: {
          id,
          userId,
          deletedAt: null
        },
        include: {
          _count: {
            select: {
              campaigns: true,
              syncLogs: true
            }
          }
        }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      // Remove sensitive credentials before sending
      const { credentials, ...safeIntegration } = integration;

      res.json({
        success: true,
        data: safeIntegration
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new integration
   */
  static async createIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { platform, name, credentials, config, scopes, syncEnabled, syncFrequency } = req.body;

      // Check if integration already exists
      const existing = await prisma.integration.findFirst({
        where: {
          userId,
          platform,
          name,
          deletedAt: null
        }
      });

      if (existing) {
        throw new ValidationError('Integration with this name already exists for this platform');
      }

      const integration = await IntegrationsController.integrationsService.createIntegration({
        userId,
        platform,
        name,
        credentials,
        config,
        scopes,
        syncEnabled,
        syncFrequency
      });

      logger.info('Integration created', { 
        integrationId: integration.id, 
        platform, 
        userId 
      });

      res.status(201).json({
        success: true,
        message: 'Integration created successfully',
        data: integration
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update integration
   */
  static async updateIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const updates = req.body;

      const integration = await IntegrationsController.integrationsService.updateIntegration(
        id,
        userId,
        updates
      );

      logger.info('Integration updated', { integrationId: id, userId });

      res.json({
        success: true,
        message: 'Integration updated successfully',
        data: integration
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete integration
   */
  static async deleteIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      await IntegrationsController.integrationsService.deleteIntegration(id, userId);

      logger.info('Integration deleted', { integrationId: id, userId });

      res.json({
        success: true,
        message: 'Integration deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test integration connection
   */
  static async testConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { platform, credentials } = req.body;

      const result = await IntegrationsController.integrationsService.testConnection(
        platform as Platform,
        credentials
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Sync integration data
   */
  static async syncIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      // Start sync process (async)
      IntegrationsController.integrationsService.syncIntegration(id, userId)
        .then(() => {
          logger.info('Integration sync completed', { integrationId: id, userId });
        })
        .catch((error) => {
          logger.error('Integration sync failed', { integrationId: id, userId, error });
        });

      res.json({
        success: true,
        message: 'Integration sync initiated. You will be notified when complete.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sync logs for integration
   */
  static async getSyncLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const { limit = 20 } = req.query;

      // Verify integration ownership
      const integration = await prisma.integration.findFirst({
        where: {
          id,
          userId,
          deletedAt: null
        }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      const syncLogs = await prisma.syncLog.findMany({
        where: {
          integrationId: id
        },
        orderBy: {
          startedAt: 'desc'
        },
        take: Number(limit)
      });

      res.json({
        success: true,
        data: syncLogs
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get available platforms
   */
  static async getAvailablePlatforms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const platforms = [
        {
          id: 'GOOGLE_ADS',
          name: 'Google Ads',
          description: 'Google advertising platform',
          icon: 'google-ads',
          requiredScopes: ['ads:read', 'ads:write'],
          setupGuideUrl: 'https://docs.admetrics.ai/integrations/google-ads'
        },
        {
          id: 'FACEBOOK_ADS',
          name: 'Facebook Ads',
          description: 'Facebook and Instagram advertising',
          icon: 'facebook',
          requiredScopes: ['ads_read', 'ads_management'],
          setupGuideUrl: 'https://docs.admetrics.ai/integrations/facebook-ads'
        },
        {
          id: 'TIKTOK_ADS',
          name: 'TikTok Ads',
          description: 'TikTok advertising platform',
          icon: 'tiktok',
          requiredScopes: ['ad_account:read', 'campaign:read'],
          setupGuideUrl: 'https://docs.admetrics.ai/integrations/tiktok-ads'
        },
        {
          id: 'LINKEDIN_ADS',
          name: 'LinkedIn Ads',
          description: 'LinkedIn advertising platform',
          icon: 'linkedin',
          requiredScopes: ['r_ads', 'r_ads_reporting'],
          setupGuideUrl: 'https://docs.admetrics.ai/integrations/linkedin-ads'
        },
        {
          id: 'TWITTER_ADS',
          name: 'Twitter Ads',
          description: 'Twitter advertising platform',
          icon: 'twitter',
          requiredScopes: ['ads:read'],
          setupGuideUrl: 'https://docs.admetrics.ai/integrations/twitter-ads'
        }
      ];

      res.json({
        success: true,
        data: platforms
      });
    } catch (error) {
      next(error);
    }
  }
}