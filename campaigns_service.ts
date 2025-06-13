// backend/src/services/campaigns.service.ts
import { PrismaClient, Campaign, Platform } from '@prisma/client';
import { BaseService, ServiceFactory, PlatformService } from './base.service';
import { logger } from '../utils/logger';
import { MetricsService } from './metrics.service';
import { AIInsightsService } from './ai-insights.service';

export interface CampaignCreateData {
  name: string;
  platform: Platform;
  integrationId: string;
  objective?: string;
  budget?: number;
  budgetType?: 'DAILY' | 'LIFETIME';
  startDate?: Date;
  endDate?: Date;
  targeting?: any;
  geoTargeting?: any;
  status?: string;
}

export interface CampaignUpdateData {
  name?: string;
  budget?: number;
  budgetType?: 'DAILY' | 'LIFETIME';
  startDate?: Date;
  endDate?: Date;
  targeting?: any;
  geoTargeting?: any;
  status?: string;
}

export interface CampaignFilters {
  platforms?: Platform[];
  status?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  organizationId?: string;
}

export interface CampaignMetrics {
  campaignId: string;
  period: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  cpc: number;
  ctr: number;
  cvr: number;
  cpa: number;
  roas: number;
  reach?: number;
  frequency?: number;
  cpm: number;
}

export interface CampaignPerformanceInsight {
  campaignId: string;
  campaignName: string;
  platform: Platform;
  insights: {
    performance: 'excellent' | 'good' | 'average' | 'poor';
    recommendations: string[];
    trends: {
      spend: number; // percentage change
      conversions: number;
      roas: number;
    };
    alerts: Array<{
      type: 'warning' | 'error' | 'info';
      message: string;
      severity: 'low' | 'medium' | 'high';
    }>;
    optimizationOpportunities: Array<{
      type: 'budget' | 'targeting' | 'bidding' | 'creative';
      impact: 'low' | 'medium' | 'high';
      description: string;
      estimatedImprovement: string;
    }>;
  };
}

export class CampaignsService extends BaseService {
  private prisma: PrismaClient;
  private metricsService: MetricsService;
  private aiInsightsService: AIInsightsService;

  constructor() {
    super({
      rateLimit: {
        maxRequests: 100,
        windowMs: 60000 // 1 minute
      },
      timeout: 30000,
      cacheEnabled: true,
      cacheTtl: 300 // 5 minutes
    });

    this.prisma = new PrismaClient();
    this.metricsService = new MetricsService();
    this.aiInsightsService = new AIInsightsService();
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { success: true, message: 'Database connection successful' };
    } catch (error) {
      return { success: false, message: `Database connection failed: ${error.message}` };
    }
  }

  /**
   * Get campaigns with pagination and filters
   */
  async getCampaigns(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters: CampaignFilters = {}
  ): Promise<{
    campaigns: Campaign[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    return this.executeWithPolicy('get_campaigns', async () => {
      const skip = (page - 1) * limit;
      
      // Build where clause
      const where: any = {
        userId,
        ...(filters.platforms && { platform: { in: filters.platforms } }),
        ...(filters.status && { status: filters.status }),
        ...(filters.organizationId && { 
          user: {
            organizationMembers: {
              some: { organizationId: filters.organizationId }
            }
          }
        }),
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { objective: { contains: filters.search, mode: 'insensitive' } }
          ]
        })
      };

      // Add date filters if provided
      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
      }

      const [campaigns, total] = await Promise.all([
        this.prisma.campaign.findMany({
          where,
          skip,
          take: limit,
          orderBy: { updatedAt: 'desc' },
          include: {
            integration: {
              select: {
                id: true,
                platform: true,
                name: true,
                status: true
              }
            },
            _count: {
              select: {
                metrics: true
              }
            }
          }
        }),
        this.prisma.campaign.count({ where })
      ]);

      return {
        campaigns,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
      };
    }, {
      cacheKey: `campaigns:${userId}:${page}:${limit}:${JSON.stringify(filters)}`,
      cacheTtl: 300
    });
  }

  /**
   * Get campaign by ID
   */
  async getCampaignById(campaignId: string, userId: string): Promise<Campaign | null> {
    return this.executeWithPolicy('get_campaign_by_id', async () => {
      const campaign = await this.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          userId
        },
        include: {
          integration: true,
          metrics: {
            take: 30,
            orderBy: { date: 'desc' }
          }
        }
      });

      return campaign;
    }, {
      cacheKey: `campaign:${campaignId}:${userId}`,
      cacheTtl: 300
    });
  }

  /**
   * Create new campaign
   */
  async createCampaign(userId: string, data: CampaignCreateData): Promise<Campaign> {
    return this.executeWithPolicy('create_campaign', async () => {
      // Verify integration belongs to user
      const integration = await this.prisma.integration.findFirst({
        where: {
          id: data.integrationId,
          userId
        }
      });

      if (!integration) {
        throw new Error('Integration not found or access denied');
      }

      // Get platform service
      const platformService = ServiceFactory.create(data.platform);
      await platformService.initialize(integration.credentials as any);

      // Create campaign on platform
      const platformCampaign = await platformService.createCampaign({
        name: data.name,
        budget: data.budget,
        budgetType: data.budgetType,
        startDate: data.startDate,
        endDate: data.endDate,
        objective: data.objective,
        targeting: data.targeting,
        geoTargeting: data.geoTargeting
      });

      // Save to database
      const campaign = await this.prisma.campaign.create({
        data: {
          userId,
          integrationId: data.integrationId,
          platform: data.platform,
          externalId: platformCampaign.externalId,
          name: data.name,
          status: 'DRAFT',
          objective: data.objective,
          budget: data.budget,
          budgetType: data.budgetType,
          startDate: data.startDate,
          endDate: data.endDate,
          targeting: data.targeting,
          geoTargeting: data.geoTargeting,
          settings: {}
        },
        include: {
          integration: true
        }
      });

      logger.info(`Campaign created: ${campaign.name} (${campaign.id})`);

      // Trigger AI analysis for new campaign
      this.aiInsightsService.analyzeCampaign(campaign.id).catch(error => {
        logger.error('Failed to analyze new campaign:', error);
      });

      return campaign;
    });
  }

  /**
   * Update campaign
   */
  async updateCampaign(
    campaignId: string, 
    userId: string, 
    updates: CampaignUpdateData
  ): Promise<Campaign> {
    return this.executeWithPolicy('update_campaign', async () => {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        include: { integration: true }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Update on platform if campaign is active
      if (campaign.status === 'ACTIVE' && campaign.externalId) {
        const platformService = ServiceFactory.create(campaign.platform);
        await platformService.initialize(campaign.integration.credentials as any);
        
        await platformService.updateCampaign(campaign.externalId, updates);
      }

      // Update in database
      const updatedCampaign = await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          ...updates,
          updatedAt: new Date()
        },
        include: {
          integration: true
        }
      });

      logger.info(`Campaign updated: ${updatedCampaign.name} (${campaignId})`);

      return updatedCampaign;
    });
  }

  /**
   * Update campaign status (pause/resume/stop)
   */
  async updateCampaignStatus(
    campaignId: string, 
    userId: string, 
    status: 'ACTIVE' | 'PAUSED' | 'ENDED'
  ): Promise<Campaign> {
    return this.executeWithPolicy('update_campaign_status', async () => {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        include: { integration: true }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Update on platform
      if (campaign.externalId) {
        const platformService = ServiceFactory.create(campaign.platform);
        await platformService.initialize(campaign.integration.credentials as any);
        
        await platformService.updateCampaignStatus(campaign.externalId, status);
      }

      // Update in database
      const updatedCampaign = await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status,
          updatedAt: new Date()
        }
      });

      logger.info(`Campaign status updated: ${updatedCampaign.name} -> ${status}`);

      return updatedCampaign;
    });
  }

  /**
   * Delete campaign
   */
  async deleteCampaign(campaignId: string, userId: string): Promise<void> {
    return this.executeWithPolicy('delete_campaign', async () => {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        include: { integration: true }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Delete from platform
      if (campaign.externalId) {
        try {
          const platformService = ServiceFactory.create(campaign.platform);
          await platformService.initialize(campaign.integration.credentials as any);
          
          await platformService.deleteCampaign(campaign.externalId);
        } catch (error) {
          logger.warn(`Failed to delete campaign from platform: ${error.message}`);
          // Continue with database deletion even if platform deletion fails
        }
      }

      // Delete from database (cascade will handle related records)
      await this.prisma.campaign.delete({
        where: { id: campaignId }
      });

      logger.info(`Campaign deleted: ${campaign.name} (${campaignId})`);
    });
  }

  /**
   * Get campaign metrics for date range
   */
  async getCampaignMetrics(
    campaignId: string,
    userId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<CampaignMetrics[]> {
    return this.executeWithPolicy('get_campaign_metrics', async () => {
      // Verify campaign access
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: campaignId, userId }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      return this.metricsService.getCampaignMetrics(
        [campaignId],
        startDate,
        endDate,
        granularity
      );
    }, {
      cacheKey: `campaign_metrics:${campaignId}:${startDate.toISOString()}:${endDate.toISOString()}:${granularity}`,
      cacheTtl: 300
    });
  }

  /**
   * Get campaign performance insights
   */
  async getCampaignInsights(
    campaignId: string,
    userId: string,
    period: number = 30
  ): Promise<CampaignPerformanceInsight> {
    return this.executeWithPolicy('get_campaign_insights', async () => {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        include: {
          metrics: {
            where: {
              date: {
                gte: new Date(Date.now() - period * 24 * 60 * 60 * 1000)
              }
            },
            orderBy: { date: 'desc' }
          }
        }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Generate insights using AI service
      const insights = await this.aiInsightsService.generateCampaignInsights(
        campaign,
        campaign.metrics
      );

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        platform: campaign.platform,
        insights
      };
    }, {
      cacheKey: `campaign_insights:${campaignId}:${period}`,
      cacheTtl: 3600 // 1 hour
    });
  }

  /**
   * Bulk update campaigns
   */
  async bulkUpdateCampaigns(
    userId: string,
    campaignIds: string[],
    updates: Partial<CampaignUpdateData>
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    return this.executeWithPolicy('bulk_update_campaigns', async () => {
      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const campaignId of campaignIds) {
        try {
          await this.updateCampaign(campaignId, userId, updates);
          success++;
        } catch (error) {
          failed++;
          errors.push(`Campaign ${campaignId}: ${error.message}`);
        }
      }

      logger.info(`Bulk update completed: ${success} success, ${failed} failed`);

      return { success, failed, errors };
    });
  }

  /**
   * Sync campaigns from platforms
   */
  async syncCampaigns(userId: string, integrationId?: string): Promise<{
    synced: number;
    errors: string[];
  }> {
    return this.executeWithPolicy('sync_campaigns', async () => {
      let synced = 0;
      const errors: string[] = [];

      // Get integrations to sync
      const integrations = await this.prisma.integration.findMany({
        where: {
          userId,
          ...(integrationId && { id: integrationId }),
          status: 'CONNECTED',
          syncEnabled: true
        }
      });

      for (const integration of integrations) {
        try {
          const platformService = ServiceFactory.create(integration.platform);
          await platformService.initialize(integration.credentials as any);

          const platformCampaigns = await platformService.getCampaigns();

          for (const platformCampaign of platformCampaigns) {
            try {
              // Check if campaign already exists
              const existingCampaign = await this.prisma.campaign.findFirst({
                where: {
                  externalId: platformCampaign.externalId,
                  integrationId: integration.id
                }
              });

              if (existingCampaign) {
                // Update existing campaign
                await this.prisma.campaign.update({
                  where: { id: existingCampaign.id },
                  data: {
                    name: platformCampaign.name,
                    status: platformCampaign.status,
                    budget: platformCampaign.budget,
                    budgetType: platformCampaign.budgetType,
                    startDate: platformCampaign.startDate,
                    endDate: platformCampaign.endDate,
                    lastSyncAt: new Date()
                  }
                });
              } else {
                // Create new campaign
                await this.prisma.campaign.create({
                  data: {
                    userId,
                    integrationId: integration.id,
                    platform: integration.platform,
                    externalId: platformCampaign.externalId,
                    name: platformCampaign.name,
                    status: platformCampaign.status,
                    objective: platformCampaign.objective,
                    budget: platformCampaign.budget,
                    budgetType: platformCampaign.budgetType,
                    startDate: platformCampaign.startDate,
                    endDate: platformCampaign.endDate,
                    targeting: platformCampaign.targeting,
                    geoTargeting: platformCampaign.geoTargeting,
                    settings: {},
                    lastSyncAt: new Date()
                  }
                });
              }

              synced++;
            } catch (error) {
              errors.push(`Campaign ${platformCampaign.name}: ${error.message}`);
            }
          }

          // Update integration last sync time
          await this.prisma.integration.update({
            where: { id: integration.id },
            data: { lastSyncAt: new Date() }
          });

        } catch (error) {
          errors.push(`Integration ${integration.name}: ${error.message}`);
        }
      }

      logger.info(`Campaign sync completed: ${synced} campaigns synced`);

      return { synced, errors };
    });
  }

  /**
   * Get campaign comparison data
   */
  async compareCampaigns(
    userId: string,
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<{
    campaigns: Array<{
      id: string;
      name: string;
      platform: Platform;
      metrics: CampaignMetrics;
    }>;
    comparison: {
      bestPerforming: string;
      worstPerforming: string;
      insights: string[];
    };
  }> {
    return this.executeWithPolicy('compare_campaigns', async () => {
      const campaigns = await Promise.all(
        campaignIds.map(async (id) => {
          const campaign = await this.getCampaignById(id, userId);
          if (!campaign) throw new Error(`Campaign ${id} not found`);

          const metrics = await this.getCampaignMetrics(id, userId, startDate, endDate);
          const aggregatedMetrics = this.aggregateMetrics(metrics);

          return {
            id: campaign.id,
            name: campaign.name,
            platform: campaign.platform,
            metrics: aggregatedMetrics
          };
        })
      );

      // Determine best and worst performing campaigns
      const sortedByRoas = campaigns.sort((a, b) => b.metrics.roas - a.metrics.roas);
      const bestPerforming = sortedByRoas[0]?.id || '';
      const worstPerforming = sortedByRoas[sortedByRoas.length - 1]?.id || '';

      // Generate comparison insights
      const insights = await this.aiInsightsService.generateComparisonInsights(campaigns);

      return {
        campaigns,
        comparison: {
          bestPerforming,
          worstPerforming,
          insights
        }
      };
    }, {
      cacheKey: `campaign_comparison:${campaignIds.join(',')}:${startDate.toISOString()}:${endDate.toISOString()}`,
      cacheTtl: 1800 // 30 minutes
    });
  }

  /**
   * Aggregate metrics array into single metrics object
   */
  private aggregateMetrics(metrics: CampaignMetrics[]): CampaignMetrics {
    if (metrics.length === 0) {
      return {
        campaignId: '',
        period: '',
        spend: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        cpc: 0,
        ctr: 0,
        cvr: 0,
        cpa: 0,
        roas: 0,
        cpm: 0
      };
    }

    const totalSpend = metrics.reduce((sum, m) => sum + m.spend, 0);
    const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
    const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
    const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);

    return {
      campaignId: metrics[0].campaignId,
      period: `${metrics.length} days`,
      spend: totalSpend,
      clicks: totalClicks,
      impressions: totalImpressions,
      conversions: totalConversions,
      cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      cvr: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      roas: totalSpend > 0 ? (totalConversions * 100) / totalSpend : 0, // Assuming $100 value per conversion
      cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0
    };
  }
}