// backend/src/controllers/integrations.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient, Platform, IntegrationStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { ApiKeyManager, PLATFORM_CREDENTIALS } from '../config/api-keys';
import { ValidationError, NotFoundError } from '../middleware/error.middleware';
import { ServiceFactory } from '../services/base.service';

const prisma = new PrismaClient();

// Validation schemas
const createIntegrationSchema = z.object({
  platform: z.enum(['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS']),
  name: z.string().min(1, 'Integration name is required').max(100),
  credentials: z.record(z.any()),
  config: z.record(z.any()).optional(),
  scopes: z.array(z.string()).optional(),
  syncEnabled: z.boolean().optional().default(true),
  syncFrequency: z.enum(['REAL_TIME', 'EVERY_5_MINUTES', 'EVERY_15_MINUTES', 'HOURLY', 'DAILY']).optional().default('HOURLY')
});

const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  credentials: z.record(z.any()).optional(),
  config: z.record(z.any()).optional(),
  scopes: z.array(z.string()).optional(),
  syncEnabled: z.boolean().optional(),
  syncFrequency: z.enum(['REAL_TIME', 'EVERY_5_MINUTES', 'EVERY_15_MINUTES', 'HOURLY', 'DAILY']).optional()
});

const testConnectionSchema = z.object({
  platform: z.enum(['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS']),
  credentials: z.record(z.any())
});

export class IntegrationsController {
  /**
   * Get all integrations for user
   */
  static async getIntegrations(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const integrations = await prisma.integration.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              campaigns: true
            }
          }
        }
      });

      // Mask sensitive credentials in response
      const maskedIntegrations = integrations.map(integration => ({
        ...integration,
        credentials: ApiKeyManager.maskCredentials(
          ApiKeyManager.decryptCredentials(integration.credentials as string)
        )
      }));

      res.json({
        success: true,
        data: maskedIntegrations
      });

      logger.info(`Retrieved ${integrations.length} integrations for user: ${userId}`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get integration by ID
   */
  static async getIntegrationById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const integrationId = req.params.id;

      const integration = await prisma.integration.findFirst({
        where: {
          id: integrationId,
          userId
        },
        include: {
          campaigns: {
            select: {
              id: true,
              name: true,
              status: true,
              platform: true
            }
          },
          _count: {
            select: {
              campaigns: true
            }
          }
        }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      // Mask sensitive credentials
      const maskedIntegration = {
        ...integration,
        credentials: ApiKeyManager.maskCredentials(
          ApiKeyManager.decryptCredentials(integration.credentials as string)
        )
      };

      res.json({
        success: true,
        data: maskedIntegration
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create new integration
   */
  static async createIntegration(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const data = createIntegrationSchema.parse(req.body);

      // Validate credentials format
      const validation = ApiKeyManager.validateCredentials(data.platform, data.credentials);
      if (!validation.isValid) {
        throw new ValidationError('Invalid credentials', validation.errors.map(error => ({
          message: error,
          field: 'credentials'
        })));
      }

      // Test connection before saving
      const connectionTest = await ApiKeyManager.testCredentials(data.platform, data.credentials);
      if (!connectionTest.success) {
        return res.status(400).json({
          success: false,
          message: 'Connection test failed',
          details: connectionTest.message
        });
      }

      // Check if integration with same platform already exists
      const existingIntegration = await prisma.integration.findFirst({
        where: {
          userId,
          platform: data.platform
        }
      });

      if (existingIntegration) {
        return res.status(409).json({
          success: false,
          message: `Integration for ${data.platform} already exists. Please update the existing integration or delete it first.`
        });
      }

      // Encrypt and save credentials
      const encryptedCredentials = ApiKeyManager.encryptCredentials(data.credentials);

      const integration = await prisma.integration.create({
        data: {
          userId,
          platform: data.platform,
          name: data.name,
          credentials: encryptedCredentials,
          config: data.config || {},
          scopes: data.scopes || ApiKeyManager.getRequiredScopes(data.platform),
          status: 'CONNECTED',
          syncEnabled: data.syncEnabled,
          syncFrequency: data.syncFrequency,
          lastSyncAt: null,
          nextSyncAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
        }
      });

      logger.info(`Integration created: ${integration.name} (${integration.platform}) for user: ${userId}`);

      // Return integration with masked credentials
      res.status(201).json({
        success: true,
        message: 'Integration created successfully',
        data: {
          ...integration,
          credentials: ApiKeyManager.maskCredentials(data.credentials)
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Update integration
   */
  static async updateIntegration(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const integrationId = req.params.id;
      const updates = updateIntegrationSchema.parse(req.body);

      const integration = await prisma.integration.findFirst({
        where: {
          id: integrationId,
          userId
        }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      // If credentials are being updated, validate and test them
      if (updates.credentials) {
        const validation = ApiKeyManager.validateCredentials(integration.platform, updates.credentials);
        if (!validation.isValid) {
          throw new ValidationError('Invalid credentials', validation.errors.map(error => ({
            message: error,
            field: 'credentials'
          })));
        }

        // Test new credentials
        const connectionTest = await ApiKeyManager.testCredentials(integration.platform, updates.credentials);
        if (!connectionTest.success) {
          return res.status(400).json({
            success: false,
            message: 'Connection test failed with new credentials',
            details: connectionTest.message
          });
        }

        // Encrypt new credentials
        updates.credentials = ApiKeyManager.encryptCredentials(updates.credentials);
      }

      const updatedIntegration = await prisma.integration.update({
        where: { id: integrationId },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      });

      logger.info(`Integration updated: ${updatedIntegration.name} (${integrationId})`);

      // Return with masked credentials
      const responseData = {
        ...updatedIntegration,
        credentials: ApiKeyManager.maskCredentials(
          ApiKeyManager.decryptCredentials(updatedIntegration.credentials as string)
        )
      };

      res.json({
        success: true,
        message: 'Integration updated successfully',
        data: responseData
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Delete integration
   */
  static async deleteIntegration(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const integrationId = req.params.id;

      const integration = await prisma.integration.findFirst({
        where: {
          id: integrationId,
          userId
        },
        include: {
          _count: {
            select: {
              campaigns: true
            }
          }
        }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      // Check if integration has campaigns
      if (integration._count.campaigns > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete integration. It has ${integration._count.campaigns} associated campaigns. Please delete or reassign campaigns first.`
        });
      }

      await prisma.integration.delete({
        where: { id: integrationId }
      });

      logger.info(`Integration deleted: ${integration.name} (${integrationId})`);

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
  static async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const integrationId = req.params.id;
      const userId = req.user!.id;

      const integration = await prisma.integration.findFirst({
        where: {
          id: integrationId,
          userId
        }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      // Decrypt credentials and test connection
      const credentials = ApiKeyManager.decryptCredentials(integration.credentials as string);
      const result = await ApiKeyManager.testCredentials(integration.platform, credentials);

      // Update integration status based on test result
      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          status: result.success ? 'CONNECTED' : 'ERROR',
          lastError: result.success ? null : result.message,
          lastErrorAt: result.success ? null : new Date()
        }
      });

      res.json({
        success: true,
        data: {
          connected: result.success,
          message: result.message,
          details: result.details
        }
      });

      logger.info(`Connection test for ${integration.name}: ${result.success ? 'success' : 'failed'}`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test credentials before saving
   */
  static async testCredentials(req: Request, res: Response, next: NextFunction) {
    try {
      const data = testConnectionSchema.parse(req.body);

      // Validate credentials format
      const validation = ApiKeyManager.validateCredentials(data.platform, data.credentials);
      if (!validation.isValid) {
        throw new ValidationError('Invalid credentials', validation.errors.map(error => ({
          message: error,
          field: 'credentials'
        })));
      }

      // Test connection
      const result = await ApiKeyManager.testCredentials(data.platform, data.credentials);

      res.json({
        success: true,
        data: {
          connected: result.success,
          message: result.message,
          details: result.details
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Get platform configuration requirements
   */
  static async getPlatformConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const platform = req.params.platform as Platform;

      const config = PLATFORM_CREDENTIALS[platform];
      if (!config) {
        return res.status(404).json({
          success: false,
          message: `Platform ${platform} not supported`
        });
      }

      // Get OAuth URL if supported
      let oauthUrl: string | undefined;
      try {
        const redirectUri = `${process.env.FRONTEND_URL}/integrations/callback`;
        oauthUrl = ApiKeyManager.generateOAuthUrl(platform, redirectUri);
      } catch (error) {
        // OAuth not supported for this platform
      }

      // Get documentation URLs
      const docs = ApiKeyManager.getDocumentationUrls(platform);

      res.json({
        success: true,
        data: {
          platform: config.platform,
          isRequired: config.isRequired,
          fields: config.fields,
          requiredScopes: ApiKeyManager.getRequiredScopes(platform),
          oauthUrl,
          documentation: docs
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get supported platforms
   */
  static async getSupportedPlatforms(req: Request, res: Response, next: NextFunction) {
    try {
      const platforms = Object.entries(PLATFORM_CREDENTIALS).map(([key, config]) => ({
        platform: key,
        name: config.platform,
        isRequired: config.isRequired,
        hasOAuth: ['GOOGLE_ADS', 'FACEBOOK_ADS', 'LINKEDIN_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS'].includes(key),
        documentation: ApiKeyManager.getDocumentationUrls(key)
      }));

      res.json({
        success: true,
        data: platforms
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Sync integration data
   */
  static async syncIntegration(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const integrationId = req.params.id;

      const integration = await prisma.integration.findFirst({
        where: {
          id: integrationId,
          userId
        }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      if (!integration.syncEnabled) {
        return res.status(400).json({
          success: false,
          message: 'Sync is disabled for this integration'
        });
      }

      // Decrypt credentials and create service
      const credentials = ApiKeyManager.decryptCredentials(integration.credentials as string);
      const service = ServiceFactory.create(integration.platform);
      await service.initialize(credentials);

      // Sync data (this would typically be done in a background job)
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

      const syncResult = await service.syncData(startDate, endDate);

      // Update integration sync status
      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          lastSyncAt: new Date(),
          nextSyncAt: new Date(Date.now() + 60 * 60 * 1000), // Next hour
          errorCount: syncResult.success ? 0 : integration.errorCount + 1,
          lastError: syncResult.success ? null : syncResult.errors.join(', '),
          lastErrorAt: syncResult.success ? null : new Date()
        }
      });

      res.json({
        success: true,
        message: 'Sync completed successfully',
        data: syncResult
      });

      logger.info(`Manual sync completed for integration: ${integration.name}`, syncResult);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get integration sync history
   */
  static async getSyncHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const integrationId = req.params.id;

      const integration = await prisma.integration.findFirst({
        where: {
          id: integrationId,
          userId
        }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      // In a real implementation, you would have a sync_history table
      // For now, return the basic sync information
      const syncHistory = {
        lastSyncAt: integration.lastSyncAt,
        nextSyncAt: integration.nextSyncAt,
        syncFrequency: integration.syncFrequency,
        errorCount: integration.errorCount,
        lastError: integration.lastError,
        lastErrorAt: integration.lastErrorAt,
        status: integration.status
      };

      res.json({
        success: true,
        data: syncHistory
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update integration status (enable/disable)
   */
  static async updateIntegrationStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const integrationId = req.params.id;
      const { status } = req.body;

      if (!['CONNECTED', 'PAUSED', 'ERROR'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be CONNECTED, PAUSED, or ERROR'
        });
      }

      const integration = await prisma.integration.findFirst({
        where: {
          id: integrationId,
          userId
        }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          status: status as IntegrationStatus,
          syncEnabled: status === 'CONNECTED',
          updatedAt: new Date()
        }
      });

      res.json({
        success: true,
        message: `Integration ${status === 'CONNECTED' ? 'enabled' : 'disabled'} successfully`
      });

      logger.info(`Integration status updated: ${integration.name} -> ${status}`);
    } catch (error) {
      next(error);
    }
  }
}