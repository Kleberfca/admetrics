import { Campaign, CampaignStatus, Platform, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/error.middleware';
import { PlatformManagerService } from './integrations/platform-manager.service';
import { CacheManager } from '../config/redis';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

interface CreateCampaignData {
  userId: string;
  integrationId: string;
  name: string;
  platform: Platform;
  objective?: string;
  budget?: number;
  budgetType?: 'DAILY' | 'LIFETIME';
  startDate?: Date;
  endDate?: Date;
  targeting?: any;
  geoTargeting?: any;
}

interface UpdateCampaignData {
  name?: string;
  status?: CampaignStatus;
  objective?: string;
  budget?: number;
  budgetType?: 'DAILY' | 'LIFETIME';
  startDate?: Date;
  endDate?: Date;
  targeting?: any;
  geoTargeting?: any;
}

export class CampaignsService extends EventEmitter {
  private platformManager: PlatformManagerService;

  constructor() {
    super();
    this.platformManager = new PlatformManagerService();
  }

  /**
   * Get campaign by ID
   */
  async getCampaignById(id: string, userId: string): Promise<Campaign | null> {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id,
        userId,
        deletedAt: null
      },
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
          orderBy: {
            date: 'desc'
          },
          take: 30
        },
        _count: {
          select: {
            alerts: {
              where: { isRead: false }
            },
            aiInsights: {
              where: { isRead: false }
            }
          }
        }
      }
    });

    return campaign;
  }

  /**
   * Create a new campaign
   */
  async createCampaign(data: CreateCampaignData): Promise<Campaign> {
    // Validate integration ownership
    const integration = await prisma.integration.findFirst({
      where: {
        id: data.integrationId,
        userId: data.userId,
        deletedAt: null
      }
    });

    if (!integration) {
      throw new NotFoundError('Integration not found');
    }

    if (integration.status !== 'ACTIVE') {
      throw new ValidationError('Integration is not active');
    }

    // Create campaign in platform
    try {
      const platformService = await this.platformManager.getPlatformService(integration);
      const externalCampaign = await platformService.createCampaign({
        name: data.name,
        objective: data.objective,
        budget: data.budget,
        budgetType: data.budgetType,
        startDate: data.startDate,
        endDate: data.endDate,
        targeting: data.targeting,
        geoTargeting: data.geoTargeting
      });

      // Create campaign in database
      const campaign = await prisma.campaign.create({
        data: {
          userId: data.userId,
          integrationId: data.integrationId,
          platform: integration.platform,
          externalId: externalCampaign.id,
          name: data.name,
          status: 'DRAFT',
          objective: data.objective,
          budget: data.budget,
          budgetType: data.budgetType,
          startDate: data.startDate,
          endDate: data.endDate,
          targeting: data.targeting,
          geoTargeting: data.geoTargeting,
          creatives: externalCampaign.creatives || []
        },
        include: {
          integration: true
        }
      });

      // Emit event
      this.emit('campaign:created', campaign);

      // Invalidate cache
      await CacheManager.deletePattern(`campaigns:${data.userId}:*`);

      return campaign;
    } catch (error) {
      logger.error('Failed to create campaign in platform', error);
      throw new ValidationError('Failed to create campaign in advertising platform');
    }
  }

  /**
   * Update campaign
   */
  async updateCampaign(
    id: string, 
    userId: string, 
    updates: UpdateCampaignData
  ): Promise<Campaign> {
    // Get campaign
    const campaign = await this.getCampaignById(id, userId);
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    // Update in platform
    try {
      const integration = await prisma.integration.findUnique({
        where: { id: campaign.integrationId }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      const platformService = await this.platformManager.getPlatformService(integration);
      await platformService.updateCampaign(campaign.externalId, updates);

      // Update in database
      const updatedCampaign = await prisma.campaign.update({
        where: { id },
        data: {
          ...updates,
          updatedAt: new Date()
        },
        include: {
          integration: true
        }
      });

      // Emit event
      this.emit('campaign:updated', updatedCampaign);

      // Invalidate cache
      await CacheManager.delete(`campaign:${id}`);
      await CacheManager.deletePattern(`campaigns:${userId}:*`);

      return updatedCampaign;
    } catch (error) {
      logger.error('Failed to update campaign', error);
      throw new ValidationError('Failed to update campaign');
    }
  }

  /**
   * Update campaign status
   */
  async updateCampaignStatus(
    id: string,
    userId: string,
    status: CampaignStatus
  ): Promise<Campaign> {
    const campaign = await this.getCampaignById(id, userId);
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    // Validate status transition
    if (!this.isValidStatusTransition(campaign.status, status)) {
      throw new ValidationError(`Cannot change status from ${campaign.status} to ${status}`);
    }

    // Update status in platform
    try {
      const integration = await prisma.integration.findUnique({
        where: { id: campaign.integrationId }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      const platformService = await this.platformManager.getPlatformService(integration);
      await platformService.updateCampaignStatus(campaign.externalId, status);

      // Update in database
      const updatedCampaign = await prisma.campaign.update({
        where: { id },
        data: { 
          status,
          updatedAt: new Date()
        },
        include: {
          integration: true
        }
      });

      // Emit event
      this.emit('campaign:statusChanged', {
        campaign: updatedCampaign,
        previousStatus: campaign.status,
        newStatus: status
      });

      // Create alert for status change
      await prisma.alert.create({
        data: {
          userId,
          campaignId: id,
          type: 'CAMPAIGN_ENDED',
          severity: 'LOW',
          title: `Campaign ${status === 'PAUSED' ? 'paused' : status === 'ACTIVE' ? 'resumed' : 'status changed'}`,
          message: `Campaign "${campaign.name}" status changed from ${campaign.status} to ${status}`
        }
      });

      return updatedCampaign;
    } catch (error) {
      logger.error('Failed to update campaign status', error);
      throw new ValidationError('Failed to update campaign status');
    }
  }

  /**
   * Delete campaign (soft delete)
   */
  async deleteCampaign(id: string, userId: string): Promise<void> {
    const campaign = await this.getCampaignById(id, userId);
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    // Delete from platform
    try {
      const integration = await prisma.integration.findUnique({
        where: { id: campaign.integrationId }
      });

      if (integration) {
        const platformService = await this.platformManager.getPlatformService(integration);
        await platformService.deleteCampaign(campaign.externalId);
      }
    } catch (error) {
      logger.warn('Failed to delete campaign from platform', error);
    }

    // Soft delete in database
    await prisma.campaign.update({
      where: { id },
      data: { 
        deletedAt: new Date(),
        status: 'COMPLETED'
      }
    });

    // Delete related data
    await Promise.all([
      prisma.metric.deleteMany({ where: { campaignId: id } }),
      prisma.aiInsight.deleteMany({ where: { campaignId: id } }),
      prisma.alert.deleteMany({ where: { campaignId: id } })
    ]);

    // Emit event
    this.emit('campaign:deleted', campaign);

    // Invalidate cache
    await CacheManager.delete(`campaign:${id}`);
    await CacheManager.deletePattern(`campaigns:${userId}:*`);
  }

  /**
   * Sync campaign data from platform
   */
  async syncCampaign(id: string, userId: string): Promise<void> {
    const campaign = await this.getCampaignById(id, userId);
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    try {
      const integration = await prisma.integration.findUnique({
        where: { id: campaign.integrationId }
      });

      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      const platformService = await this.platformManager.getPlatformService(integration);
      
      // Get updated campaign data
      const platformCampaign = await platformService.getCampaignById(campaign.externalId);
      
      // Update campaign
      await prisma.campaign.update({
        where: { id },
        data: {
          name: platformCampaign.name,
          status: this.mapPlatformStatus(platformCampaign.status),
          budget: platformCampaign.budget,
          lastSyncAt: new Date()
        }
      });

      // Sync metrics
      const endDate = new Date();
      const startDate = campaign.lastSyncAt || campaign.createdAt;
      
      const metrics = await platformService.getCampaignMetrics(
        [campaign.externalId],
        startDate,
        endDate
      );

      // Save metrics
      for (const metric of metrics) {
        await prisma.metric.upsert({
          where: {
            campaignId_date_granularity: {
              campaignId: id,
              date: metric.date,
              granularity: 'DAILY'
            }
          },
          update: {
            impressions: metric.impressions,
            clicks: metric.clicks,
            spend: metric.spend,
            conversions: metric.conversions,
            ctr: metric.ctr,
            cpc: metric.cpc,
            cpm: metric.cpm,
            cpa: metric.cpa,
            roas: metric.roas,
            conversionRate: metric.conversionRate,
            platformMetrics: metric.platformMetrics
          },
          create: {
            campaignId: id,
            date: metric.date,
            granularity: 'DAILY',
            impressions: metric.impressions,
            clicks: metric.clicks,
            spend: metric.spend,
            conversions: metric.conversions,
            ctr: metric.ctr,
            cpc: metric.cpc,
            cpm: metric.cpm,
            cpa: metric.cpa,
            roas: metric.roas,
            conversionRate: metric.conversionRate,
            platformMetrics: metric.platformMetrics
          }
        });
      }

      // Emit event
      this.emit('campaign:synced', campaign);

      logger.info('Campaign sync completed', { campaignId: id });
    } catch (error) {
      logger.error('Campaign sync failed', { campaignId: id, error });
      throw error;
    }
  }

  /**
   * Check if status transition is valid
   */
  private isValidStatusTransition(from: CampaignStatus, to: CampaignStatus): boolean {
    const validTransitions: Record<CampaignStatus, CampaignStatus[]> = {
      DRAFT: ['ACTIVE', 'SCHEDULED'],
      SCHEDULED: ['ACTIVE', 'PAUSED', 'DRAFT'],
      ACTIVE: ['PAUSED', 'COMPLETED'],
      PAUSED: ['ACTIVE', 'COMPLETED'],
      COMPLETED: []
    };

    return validTransitions[from]?.includes(to) || false;
  }

  /**
   * Map platform status to internal status
   */
  private mapPlatformStatus(platformStatus: string): CampaignStatus {
    const statusMap: Record<string, CampaignStatus> = {
      'ENABLED': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'REMOVED': 'COMPLETED',
      'PENDING': 'SCHEDULED',
      'DRAFT': 'DRAFT'
    };

    return statusMap[platformStatus.toUpperCase()] || 'DRAFT';
  }
}