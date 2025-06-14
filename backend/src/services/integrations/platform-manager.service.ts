import { Platform, Integration, IntegrationStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { GoogleAdsService } from './google-ads.service';
import { FacebookAdsService } from './facebook-ads.service';
import { TikTokAdsService } from './tiktok-ads.service';
import { LinkedInAdsService } from './linkedin-ads.service';
import { PlatformService } from './platform.interface';
import { validateCredentials, PlatformCredentials } from '../../config/api-keys';
import { EncryptionService } from '../../utils/encryption';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../middleware/error.middleware';

interface CreateIntegrationData {
  userId: string;
  platform: Platform;
  name: string;
  credentials: PlatformCredentials;
  config?: any;
  scopes?: string[];
  syncEnabled?: boolean;
  syncFrequency?: any;
}

export class PlatformManagerService {
  private platformServices: Map<Platform, PlatformService>;
  private encryptionService: EncryptionService;

  constructor() {
    this.platformServices = new Map();
    this.encryptionService = new EncryptionService();
    this.initializePlatformServices();
  }

  /**
   * Initialize platform services
   */
  private initializePlatformServices(): void {
    // Services will be instantiated on demand to avoid unnecessary connections
  }

  /**
   * Get platform service instance
   */
  async getPlatformService(integration: Integration): Promise<PlatformService> {
    if (!this.platformServices.has(integration.platform)) {
      const service = await this.createPlatformService(integration);
      this.platformServices.set(integration.platform, service);
    }

    return this.platformServices.get(integration.platform)!;
  }

  /**
   * Create platform service instance
   */
  private async createPlatformService(integration: Integration): Promise<PlatformService> {
    // Decrypt credentials
    const credentials = await this.encryptionService.decrypt(integration.credentials);

    switch (integration.platform) {
      case 'GOOGLE_ADS':
        return new GoogleAdsService(credentials);
        
      case 'FACEBOOK_ADS':
      case 'INSTAGRAM_ADS':
        return new FacebookAdsService(credentials);
        
      case 'TIKTOK_ADS':
        return new TikTokAdsService(credentials);
        
      case 'LINKEDIN_ADS':
        return new LinkedInAdsService(credentials);
        
      default:
        throw new Error(`Unsupported platform: ${integration.platform}`);
    }
  }

  /**
   * Create a new integration
   */
  async createIntegration(data: CreateIntegrationData): Promise<Integration> {
    // Validate credentials
    if (!validateCredentials(data.platform, data.credentials)) {
      throw new ValidationError('Invalid credentials for platform');
    }

    // Test connection
    const testResult = await this.testConnection(data.platform, data.credentials);
    if (!testResult.success) {
      throw new ValidationError(`Connection test failed: ${testResult.message}`);
    }

    // Encrypt credentials
    const encryptedCredentials = await this.encryptionService.encrypt(data.credentials);

    // Create integration
    const integration = await prisma.integration.create({
      data: {
        userId: data.userId,
        platform: data.platform,
        name: data.name,
        credentials: encryptedCredentials,
        config: data.config || {},
        scopes: data.scopes || [],
        status: 'ACTIVE',
        syncEnabled: data.syncEnabled ?? true,
        syncFrequency: data.syncFrequency || 'HOURLY'
      }
    });

    // Initial sync
    this.syncIntegration(integration.id, data.userId).catch(error => {
      logger.error('Initial sync failed', { integrationId: integration.id, error });
    });

    return integration;
  }

  /**
   * Update integration
   */
  async updateIntegration(
    id: string,
    userId: string,
    updates: Partial<CreateIntegrationData>
  ): Promise<Integration> {
    const integration = await prisma.integration.findFirst({
      where: { id, userId, deletedAt: null }
    });

    if (!integration) {
      throw new NotFoundError('Integration not found');
    }

    const updateData: any = {};

    if (updates.name) {
      updateData.name = updates.name;
    }

    if (updates.credentials) {
      // Validate new credentials
      if (!validateCredentials(integration.platform, updates.credentials)) {
        throw new ValidationError('Invalid credentials for platform');
      }

      // Test connection with new credentials
      const testResult = await this.testConnection(integration.platform, updates.credentials);
      if (!testResult.success) {
        throw new ValidationError(`Connection test failed: ${testResult.message}`);
      }

      updateData.credentials = await this.encryptionService.encrypt(updates.credentials);
    }

    if (updates.config !== undefined) {
      updateData.config = updates.config;
    }

    if (updates.scopes !== undefined) {
      updateData.scopes = updates.scopes;
    }

    if (updates.syncEnabled !== undefined) {
      updateData.syncEnabled = updates.syncEnabled;
    }

    if (updates.syncFrequency !== undefined) {
      updateData.syncFrequency = updates.syncFrequency;
    }

    return prisma.integration.update({
      where: { id },
      data: updateData
    });
  }

  /**
   * Delete integration
   */
  async deleteIntegration(id: string, userId: string): Promise<void> {
    const integration = await prisma.integration.findFirst({
      where: { id, userId, deletedAt: null }
    });

    if (!integration) {
      throw new NotFoundError('Integration not found');
    }

    // Soft delete
    await prisma.integration.update({
      where: { id },
      data: { 
        deletedAt: new Date(),
        status: 'INACTIVE'
      }
    });

    // Also soft delete related campaigns
    await prisma.campaign.updateMany({
      where: { integrationId: id },
      data: { deletedAt: new Date() }
    });
  }

  /**
   * Test connection to platform
   */
  async testConnection(
    platform: Platform,
    credentials: PlatformCredentials
  ): Promise<{ success: boolean; message: string }> {
    try {
      let service: PlatformService;

      switch (platform) {
        case 'GOOGLE_ADS':
          service = new GoogleAdsService(credentials);
          break;
          
        case 'FACEBOOK_ADS':
        case 'INSTAGRAM_ADS':
          service = new FacebookAdsService(credentials);
          break;
          
        case 'TIKTOK_ADS':
          service = new TikTokAdsService(credentials);
          break;
          
        case 'LINKEDIN_ADS':
          service = new LinkedInAdsService(credentials);
          break;
          
        default:
          return {
            success: false,
            message: `Unsupported platform: ${platform}`
          };
      }

      return await service.testConnection();
    } catch (error: any) {
      logger.error('Connection test failed', { platform, error });
      return {
        success: false,
        message: error.message || 'Connection test failed'
      };
    }
  }

  /**
   * Sync integration data
   */
  async syncIntegration(id: string, userId: string): Promise<void> {
    const syncLog = await prisma.syncLog.create({
      data: {
        integrationId: id,
        status: 'started',
        startedAt: new Date()
      }
    });

    try {
      const integration = await prisma.integration.findFirst({
        where: { id, userId, deletedAt: null }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      const service = await this.getPlatformService(integration);

      // Sync campaigns
      const campaigns = await service.getCampaigns();
      let syncedCount = 0;
      let failedCount = 0;

      for (const platformCampaign of campaigns) {
        try {
          // Upsert campaign
          await prisma.campaign.upsert({
            where: {
              integrationId_externalId: {
                integrationId: id,
                externalId: platformCampaign.id
              }
            },
            update: {
              name: platformCampaign.name,
              status: platformCampaign.status as any,
              budget: platformCampaign.budget,
              lastSyncAt: new Date()
            },
            create: {
              userId,
              integrationId: id,
              platform: integration.platform,
              externalId: platformCampaign.id,
              name: platformCampaign.name,
              status: platformCampaign.status as any,
              objective: platformCampaign.objective,
              budget: platformCampaign.budget,
              budgetType: platformCampaign.budgetType as any,
              startDate: platformCampaign.startDate,
              endDate: platformCampaign.endDate,
              targeting: platformCampaign.targeting,
              lastSyncAt: new Date()
            }
          });

          syncedCount++;
        } catch (error) {
          logger.error('Failed to sync campaign', { 
            campaignId: platformCampaign.id, 
            error 
          });
          failedCount++;
        }
      }

      // Update integration last sync
      await prisma.integration.update({
        where: { id },
        data: { 
          lastSyncAt: new Date(),
          lastSyncError: failedCount > 0 ? `Failed to sync ${failedCount} campaigns` : null
        }
      });

      // Complete sync log
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: failedCount === 0 ? 'success' : 'partial',
          recordsSync: syncedCount,
          recordsFailed: failedCount,
          completedAt: new Date(),
          duration: Math.floor((Date.now() - syncLog.startedAt.getTime()) / 1000)
        }
      });

      logger.info('Integration sync completed', {
        integrationId: id,
        syncedCount,
        failedCount
      });
    } catch (error: any) {
      // Update sync log with error
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'failed',
          errors: { message: error.message },
          completedAt: new Date(),
          duration: Math.floor((Date.now() - syncLog.startedAt.getTime()) / 1000)
        }
      });

      // Update integration with error
      await prisma.integration.update({
        where: { id },
        data: {
          lastSyncError: error.message,
          status: 'ERROR'
        }
      });

      logger.error('Integration sync failed', { integrationId: id, error });
      throw error;
    }
  }

  /**
   * Sync all active integrations
   */
  async syncAllIntegrations(): Promise<void> {
    const integrations = await prisma.integration.findMany({
      where: {
        status: 'ACTIVE',
        syncEnabled: true,
        deletedAt: null
      }
    });

    logger.info(`Starting sync for ${integrations.length} integrations`);

    await Promise.allSettled(
      integrations.map(integration => 
        this.syncIntegration(integration.id, integration.userId)
      )
    );
  }
}

// Alias for backwards compatibility
export const IntegrationsService = PlatformManagerService;