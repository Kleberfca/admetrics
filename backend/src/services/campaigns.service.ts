import { Campaign, CampaignStatus, Platform, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { CacheManager } from '../config/redis';
import { logger } from '../utils/logger';
import { NotFoundError, ForbiddenError, ConflictError } from '../middleware/error.middleware';
import { PlatformManagerService } from './integrations/platform-manager.service';

interface ListCampaignsOptions {
  userId: string;
  page: number;
  limit: number;
  filters?: {
    platform?: string;
    status?: string;
    search?: string;
  };
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

interface CampaignPerformance {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cvr: number;
  cpc: number;
  cpa: number;
  roas: number;
  trend: {
    spend: number;
    conversions: number;
    roas: number;
  };
}

export class CampaignService {
  private cache: CacheManager;
  private platformManager: PlatformManagerService;

  constructor() {
    this.cache = CacheManager.getInstance();
    this.platformManager = new PlatformManagerService();
  }

  /**
   * List campaigns with pagination and filters
   */
  async listCampaigns(options: ListCampaignsOptions) {
    const { userId, page, limit, filters, sort } = options;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.CampaignWhereInput = {
      userId,
      deletedAt: null
    };

    if (filters?.platform) {
      where.platform = filters.platform as Platform;
    }

    if (filters?.status) {
      where.status = filters.status as CampaignStatus;
    }

    if (filters?.search) {
      where.name = {
        contains: filters.search,
        mode: 'insensitive'
      };
    }

    // Build order by
    const orderBy: Prisma.CampaignOrderByWithRelationInput = {};
    if (sort) {
      orderBy[sort.field as keyof Campaign] = sort.order;
    }

    // Execute queries
    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy,
        skip,
        take: limit,
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
              alerts: true
            }
          }
        }
      }),
      prisma.campaign.count({ where })
    ]);

    return {
      data: campaigns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get campaign by ID
   */
  async getCampaignById(campaignId: string, userId: string) {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId,
        deletedAt: null
      },
      include: {
        integration: true,
        metrics: {
          orderBy: { date: 'desc' },
          take: 30
        },
        alerts: {
          where: { isResolved: false },
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    return campaign;
  }

  /**
   * Create new campaign
   */
  async createCampaign(data: Prisma.CampaignCreateInput) {
    // Verify integration ownership
    const integration = await prisma.integration.findFirst({
      where: {
        id: data.integration.connect?.id,
        userId: data.user.connect?.id,
        deletedAt: null
      }
    });

    if (!integration) {
      throw new NotFoundError('Integration not found');
    }

    // Create campaign
    const campaign = await prisma.campaign.create({
      data,
      include: {
        integration: true
      }
    });

    // Sync with platform if active
    if (campaign.status === 'ACTIVE') {
      await this.syncWithPlatform(campaign);
    }

    // Clear cache
    await this.cache.deletePattern(`campaigns:${data.user.connect?.id}:*`);

    return campaign;
  }

  /**
   * Update campaign
   */
  async updateCampaign(campaignId: string, userId: string, updates: Partial<Campaign>) {
    // Check ownership
    const existing = await this.getCampaignById(campaignId, userId);
    if (!existing) {
      throw new NotFoundError('Campaign not found');
    }

    // Update campaign
    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...updates,
        updatedAt: new Date()
      },
      include: {
        integration: true
      }
    });

    // Sync with platform
    await this.syncWithPlatform(campaign);

    // Clear cache
    await this.cache.delete(`campaign:${campaignId}`);
    await this.cache.deletePattern(`campaigns:${userId}:*`);

    return campaign;
  }

  /**
   * Update campaign status
   */
  async updateCampaignStatus(campaignId: string, userId: string, status: CampaignStatus) {
    const campaign = await this.updateCampaign(campaignId, userId, { status });
    
    // Update on platform
    if (campaign.integration.status === 'ACTIVE') {
      try {
        await this.platformManager.updateCampaignStatus(
          campaign.integration,
          campaign.externalId,
          status
        );
      } catch (error) {
        logger.error('Failed to update campaign status on platform', { error, campaignId });
      }
    }

    return campaign;
  }

  /**
   * Delete campaign
   */
  async deleteCampaign(campaignId: string, userId: string) {
    const campaign = await this.getCampaignById(campaignId, userId);
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    // Soft delete
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        deletedAt: new Date(),
        status: 'COMPLETED'
      }
    });

    // Clear cache
    await this.cache.delete(`campaign:${campaignId}`);
    await this.cache.deletePattern(`campaigns:${userId}:*`);
  }

  /**
   * Duplicate campaign
   */
  async duplicateCampaign(campaignId: string, userId: string, newName?: string) {
    const original = await this.getCampaignById(campaignId, userId);
    if (!original) {
      throw new NotFoundError('Campaign not found');
    }

    const { id, externalId, createdAt, updatedAt, ...campaignData } = original;

    const duplicate = await prisma.campaign.create({
      data: {
        ...campaignData,
        name: newName || `${original.name} (Copy)`,
        status: 'DRAFT',
        user: { connect: { id: userId } },
        integration: { connect: { id: original.integrationId } }
      }
    });

    return duplicate;
  }

  /**
   * Bulk update campaign status
   */
  async bulkUpdateStatus(campaignIds: string[], userId: string, status: CampaignStatus) {
    // Verify ownership
    const campaigns = await prisma.campaign.findMany({
      where: {
        id: { in: campaignIds },
        userId,
        deletedAt: null
      }
    });

    if (campaigns.length !== campaignIds.length) {
      throw new ForbiddenError('One or more campaigns not found or access denied');
    }

    // Update campaigns
    const result = await prisma.campaign.updateMany({
      where: {
        id: { in: campaignIds },
        userId
      },
      data: {
        status,
        updatedAt: new Date()
      }
    });

    // Clear cache
    await this.cache.deletePattern(`campaigns:${userId}:*`);
    for (const id of campaignIds) {
      await this.cache.delete(`campaign:${id}`);
    }

    return {
      updated: result.count,
      campaignIds
    };
  }

  /**
   * Bulk delete campaigns
   */
  async bulkDelete(campaignIds: string[], userId: string) {
    // Verify ownership
    const campaigns = await prisma.campaign.findMany({
      where: {
        id: { in: campaignIds },
        userId,
        deletedAt: null
      }
    });

    if (campaigns.length !== campaignIds.length) {
      throw new ForbiddenError('One or more campaigns not found or access denied');
    }

    // Soft delete
    const result = await prisma.campaign.updateMany({
      where: {
        id: { in: campaignIds },
        userId
      },
      data: {
        deletedAt: new Date(),
        status: 'COMPLETED'
      }
    });

    // Clear cache
    await this.cache.deletePattern(`campaigns:${userId}:*`);
    for (const id of campaignIds) {
      await this.cache.delete(`campaign:${id}`);
    }

    return {
      deleted: result.count,
      campaignIds
    };
  }

  /**
   * Get campaign performance
   */
  async getCampaignPerformance(campaignId: string, userId: string, period: string): Promise<CampaignPerformance> {
    const campaign = await this.getCampaignById(campaignId, userId);
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get metrics
    const metrics = await prisma.metric.findMany({
      where: {
        campaignId,
        date: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    // Calculate totals
    const totals = metrics.reduce((acc, metric) => ({
      impressions: acc.impressions + metric.impressions,
      clicks: acc.clicks + metric.clicks,
      conversions: acc.conversions + metric.conversions,
      spend: acc.spend + metric.spend.toNumber()
    }), {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      spend: 0
    });

    // Calculate rates
    const performance: CampaignPerformance = {
      ...totals,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cvr: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
      roas: totals.spend > 0 ? (totals.conversions * 100) / totals.spend : 0, // Assuming $100 per conversion
      trend: {
        spend: 0,
        conversions: 0,
        roas: 0
      }
    };

    // Calculate trends (compare with previous period)
    // This is simplified - in production, you'd want more sophisticated trend analysis
    
    return performance;
  }

  /**
   * Sync campaign with platform
   */
  private async syncWithPlatform(campaign: Campaign & { integration: any }) {
    try {
      if (campaign.integration.status !== 'ACTIVE') {
        return;
      }

      await this.platformManager.syncCampaign(campaign.integration, campaign.id);
    } catch (error) {
      logger.error('Failed to sync campaign with platform', { error, campaignId: campaign.id });
      // Don't throw - this is a background operation
    }
  }
}