// backend/src/services/ai-insights.service.ts
import axios from 'axios';
import { PrismaClient, Campaign, Metric, Platform } from '@prisma/client';
import { BaseService } from './base.service';
import { logger } from '../utils/logger';

export interface AIInsight {
  id: string;
  type: 'performance_prediction' | 'budget_optimization' | 'anomaly_detection' | 'audience_segmentation' | 'creative_optimization';
  title: string;
  description: string;
  confidence: number; // 0-100
  impact: 'low' | 'medium' | 'high';
  category: 'opportunity' | 'warning' | 'alert' | 'recommendation';
  data: any;
  actionable: boolean;
  estimatedImprovement?: string;
  implementationComplexity: 'easy' | 'medium' | 'hard';
  createdAt: Date;
  expiresAt?: Date;
}

export interface PerformancePrediction {
  campaignId: string;
  period: number; // days
  predictions: {
    spend: number[];
    clicks: number[];
    conversions: number[];
    roas: number[];
    dates: Date[];
  };
  confidence: number;
  factors: Array<{
    name: string;
    impact: number; // -100 to 100
    description: string;
  }>;
  recommendations: string[];
}

export interface BudgetOptimization {
  currentBudget: number;
  optimizedBudget: number;
  expectedImprovement: number; // percentage
  reallocation: Array<{
    campaignId: string;
    campaignName: string;
    currentBudget: number;
    optimizedBudget: number;
    reason: string;
  }>;
  riskLevel: 'low' | 'medium' | 'high';
  implementationSteps: string[];
}

export interface AnomalyDetection {
  campaignId: string;
  anomalies: Array<{
    metric: string;
    detectedAt: Date;
    severity: 'low' | 'medium' | 'high';
    description: string;
    expectedValue: number;
    actualValue: number;
    possibleCauses: string[];
    recommendations: string[];
  }>;
}

export interface AudienceSegmentation {
  segments: Array<{
    id: string;
    name: string;
    size: number;
    characteristics: Record<string, any>;
    performance: {
      cpc: number;
      cvr: number;
      roas: number;
    };
    recommendations: string[];
  }>;
  insights: {
    bestPerformingSegment: string;
    underperformingSegments: string[];
    newOpportunities: string[];
  };
}

export interface CreativeOptimization {
  campaignId: string;
  currentCreatives: Array<{
    id: string;
    type: 'image' | 'video' | 'text';
    performance: {
      ctr: number;
      cvr: number;
      engagement: number;
    };
  }>;
  recommendations: Array<{
    type: 'new_creative' | 'modify_existing' | 'pause_creative';
    description: string;
    priority: 'low' | 'medium' | 'high';
    expectedImprovement: string;
    creativeElements?: {
      headline?: string;
      description?: string;
      imageStyle?: string;
      colorScheme?: string;
      callToAction?: string;
    };
  }>;
}

export class AIInsightsService extends BaseService {
  private prisma: PrismaClient;
  private aiEngineUrl: string;

  constructor() {
    super({
      rateLimit: {
        maxRequests: 50,
        windowMs: 60000 // 1 minute
      },
      timeout: 60000, // AI operations can take longer
      cacheEnabled: true,
      cacheTtl: 1800 // 30 minutes
    });

    this.prisma = new PrismaClient();
    this.aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:5000';
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const response = await axios.get(`${this.aiEngineUrl}/health`);
      
      if (response.status === 200) {
        return { success: true, message: 'Database and AI engine connections successful' };
      } else {
        return { success: false, message: 'AI engine not responding' };
      }
    } catch (error) {
      return { success: false, message: `Connection failed: ${error.message}` };
    }
  }

  /**
   * Generate comprehensive insights for a campaign
   */
  async generateCampaignInsights(
    campaign: Campaign,
    metrics: Metric[]
  ): Promise<{
    performance: 'excellent' | 'good' | 'average' | 'poor';
    recommendations: string[];
    trends: {
      spend: number;
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
  }> {
    return this.executeWithPolicy('generate_campaign_insights', async () => {
      if (metrics.length === 0) {
        return {
          performance: 'poor' as const,
          recommendations: ['No data available for analysis'],
          trends: { spend: 0, conversions: 0, roas: 0 },
          alerts: [],
          optimizationOpportunities: []
        };
      }

      // Prepare data for AI analysis
      const analysisData = {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          platform: campaign.platform,
          objective: campaign.objective,
          budget: campaign.budget,
          startDate: campaign.startDate,
          targeting: campaign.targeting
        },
        metrics: metrics.map(m => ({
          date: m.date,
          spend: m.spend,
          clicks: m.clicks,
          impressions: m.impressions,
          conversions: m.conversions,
          cpc: m.costPerClick,
          ctr: m.clickThroughRate,
          cvr: m.conversionRate,
          roas: m.returnOnAdSpend
        }))
      };

      // Call AI engine for analysis
      const response = await axios.post(`${this.aiEngineUrl}/insights/campaign-analysis`, analysisData);
      const aiInsights = response.data;

      // Calculate trends
      const trends = this.calculateTrends(metrics);

      // Determine performance level
      const avgRoas = metrics.reduce((sum, m) => sum + m.returnOnAdSpend, 0) / metrics.length;
      const performance = this.determinePerformanceLevel(avgRoas, trends.roas);

      // Generate alerts
      const alerts = this.generateAlerts(campaign, metrics, trends);

      return {
        performance,
        recommendations: aiInsights.recommendations || [],
        trends,
        alerts,
        optimizationOpportunities: aiInsights.optimizationOpportunities || []
      };
    }, {
      cacheKey: `campaign_insights:${campaign.id}:${metrics.length}`,
      cacheTtl: 1800
    });
  }

  /**
   * Predict campaign performance for future periods
   */
  async predictPerformance(
    campaignId: string,
    predictionDays: number = 30
  ): Promise<PerformancePrediction> {
    return this.executeWithPolicy('predict_performance', async () => {
      // Get historical data
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          metrics: {
            orderBy: { date: 'desc' },
            take: 90 // Last 90 days for prediction
          }
        }
      });

      if (!campaign || campaign.metrics.length < 7) {
        throw new Error('Insufficient data for prediction (minimum 7 days required)');
      }

      // Prepare data for AI prediction
      const predictionData = {
        campaignId,
        platform: campaign.platform,
        historical_data: campaign.metrics.map(m => ({
          date: m.date,
          spend: m.spend,
          clicks: m.clicks,
          conversions: m.conversions,
          roas: m.returnOnAdSpend
        })),
        prediction_days: predictionDays,
        campaign_info: {
          budget: campaign.budget,
          objective: campaign.objective,
          targeting: campaign.targeting
        }
      };

      // Call AI engine for prediction
      const response = await axios.post(`${this.aiEngineUrl}/predictions/performance`, predictionData);
      const prediction = response.data;

      return {
        campaignId,
        period: predictionDays,
        predictions: {
          spend: prediction.spend_forecast,
          clicks: prediction.clicks_forecast,
          conversions: prediction.conversions_forecast,
          roas: prediction.roas_forecast,
          dates: prediction.dates.map((d: string) => new Date(d))
        },
        confidence: prediction.confidence,
        factors: prediction.factors || [],
        recommendations: prediction.recommendations || []
      };
    }, {
      cacheKey: `prediction:${campaignId}:${predictionDays}`,
      cacheTtl: 3600 // 1 hour
    });
  }

  /**
   * Optimize budget allocation across campaigns
   */
  async optimizeBudget(
    userId: string,
    campaignIds: string[],
    totalBudget: number,
    constraints?: {
      minBudgetPerCampaign?: number;
      maxBudgetPerCampaign?: number;
      platformLimits?: Record<Platform, number>;
    }
  ): Promise<BudgetOptimization> {
    return this.executeWithPolicy('optimize_budget', async () => {
      // Get campaigns with recent performance data
      const campaigns = await this.prisma.campaign.findMany({
        where: {
          id: { in: campaignIds },
          userId
        },
        include: {
          metrics: {
            where: {
              date: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
              }
            },
            orderBy: { date: 'desc' }
          }
        }
      });

      if (campaigns.length === 0) {
        throw new Error('No campaigns found for budget optimization');
      }

      // Prepare data for AI optimization
      const optimizationData = {
        campaigns: campaigns.map(c => ({
          id: c.id,
          name: c.name,
          platform: c.platform,
          currentBudget: c.budget,
          metrics: c.metrics.map(m => ({
            date: m.date,
            spend: m.spend,
            conversions: m.conversions,
            roas: m.returnOnAdSpend
          }))
        })),
        totalBudget,
        constraints: constraints || {}
      };

      // Call AI engine for optimization
      const response = await axios.post(`${this.aiEngineUrl}/optimization/budget`, optimizationData);
      const optimization = response.data;

      const currentBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);

      return {
        currentBudget,
        optimizedBudget: totalBudget,
        expectedImprovement: optimization.expected_improvement,
        reallocation: optimization.reallocation.map((r: any) => ({
          campaignId: r.campaign_id,
          campaignName: campaigns.find(c => c.id === r.campaign_id)?.name || '',
          currentBudget: campaigns.find(c => c.id === r.campaign_id)?.budget || 0,
          optimizedBudget: r.optimized_budget,
          reason: r.reason
        })),
        riskLevel: optimization.risk_level,
        implementationSteps: optimization.implementation_steps || []
      };
    }, {
      cacheKey: `budget_optimization:${campaignIds.join(',')}:${totalBudget}`,
      cacheTtl: 1800
    });
  }

  /**
   * Detect anomalies in campaign performance
   */
  async detectAnomalies(campaignId: string): Promise<AnomalyDetection> {
    return this.executeWithPolicy('detect_anomalies', async () => {
      // Get recent metrics for anomaly detection
      const metrics = await this.prisma.metric.findMany({
        where: {
          campaignId,
          date: {
            gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // Last 60 days
          }
        },
        orderBy: { date: 'desc' }
      });

      if (metrics.length < 14) {
        throw new Error('Insufficient data for anomaly detection (minimum 14 days required)');
      }

      // Prepare data for AI anomaly detection
      const anomalyData = {
        campaignId,
        metrics: metrics.map(m => ({
          date: m.date,
          spend: m.spend,
          clicks: m.clicks,
          impressions: m.impressions,
          conversions: m.conversions,
          cpc: m.costPerClick,
          ctr: m.clickThroughRate,
          cvr: m.conversionRate,
          roas: m.returnOnAdSpend
        }))
      };

      // Call AI engine for anomaly detection
      const response = await axios.post(`${this.aiEngineUrl}/anomalies/detect`, anomalyData);
      const anomalies = response.data;

      return {
        campaignId,
        anomalies: anomalies.detected_anomalies.map((a: any) => ({
          metric: a.metric,
          detectedAt: new Date(a.detected_at),
          severity: a.severity,
          description: a.description,
          expectedValue: a.expected_value,
          actualValue: a.actual_value,
          possibleCauses: a.possible_causes || [],
          recommendations: a.recommendations || []
        }))
      };
    }, {
      cacheKey: `anomalies:${campaignId}`,
      cacheTtl: 600 // 10 minutes
    });
  }

  /**
   * Analyze and segment audience data
   */
  async analyzeAudience(
    campaignIds: string[],
    platform: Platform
  ): Promise<AudienceSegmentation> {
    return this.executeWithPolicy('analyze_audience', async () => {
      // Get campaign data for audience analysis
      const campaigns = await this.prisma.campaign.findMany({
        where: {
          id: { in: campaignIds },
          platform
        },
        include: {
          metrics: {
            where: {
              date: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
              }
            }
          }
        }
      });

      if (campaigns.length === 0) {
        throw new Error('No campaigns found for audience analysis');
      }

      // Prepare data for AI audience analysis
      const audienceData = {
        platform,
        campaigns: campaigns.map(c => ({
          id: c.id,
          targeting: c.targeting,
          geoTargeting: c.geoTargeting,
          metrics: c.metrics.map(m => ({
            date: m.date,
            spend: m.spend,
            clicks: m.clicks,
            conversions: m.conversions,
            roas: m.returnOnAdSpend
          }))
        }))
      };

      // Call AI engine for audience analysis
      const response = await axios.post(`${this.aiEngineUrl}/audience/analyze`, audienceData);
      const analysis = response.data;

      return {
        segments: analysis.segments.map((s: any) => ({
          id: s.id,
          name: s.name,
          size: s.size,
          characteristics: s.characteristics,
          performance: s.performance,
          recommendations: s.recommendations || []
        })),
        insights: {
          bestPerformingSegment: analysis.insights.best_performing_segment,
          underperformingSegments: analysis.insights.underperforming_segments || [],
          newOpportunities: analysis.insights.new_opportunities || []
        }
      };
    }, {
      cacheKey: `audience_analysis:${campaignIds.join(',')}:${platform}`,
      cacheTtl: 7200 // 2 hours
    });
  }

  /**
   * Generate insights for comparing multiple campaigns
   */
  async generateComparisonInsights(campaigns: Array<{
    id: string;
    name: string;
    platform: Platform;
    metrics: any;
  }>): Promise<string[]> {
    return this.executeWithPolicy('generate_comparison_insights', async () => {
      const insights: string[] = [];

      if (campaigns.length < 2) {
        return ['At least 2 campaigns required for comparison'];
      }

      // Compare ROAS performance
      const sortedByRoas = campaigns.sort((a, b) => b.metrics.roas - a.metrics.roas);
      const best = sortedByRoas[0];
      const worst = sortedByRoas[sortedByRoas.length - 1];

      if (best.metrics.roas > worst.metrics.roas * 1.5) {
        insights.push(
          `${best.name} is performing significantly better with ${best.metrics.roas.toFixed(2)}x ROAS compared to ${worst.name} (${worst.metrics.roas.toFixed(2)}x)`
        );
      }

      // Compare by platform
      const platformGroups = campaigns.reduce((groups, campaign) => {
        if (!groups[campaign.platform]) {
          groups[campaign.platform] = [];
        }
        groups[campaign.platform].push(campaign);
        return groups;
      }, {} as Record<Platform, typeof campaigns>);

      Object.entries(platformGroups).forEach(([platform, platformCampaigns]) => {
        if (platformCampaigns.length > 1) {
          const avgRoas = platformCampaigns.reduce((sum, c) => sum + c.metrics.roas, 0) / platformCampaigns.length;
          insights.push(
            `Average ROAS for ${platform} campaigns: ${avgRoas.toFixed(2)}x`
          );
        }
      });

      // Efficiency insights
      const avgCpc = campaigns.reduce((sum, c) => sum + c.metrics.cpc, 0) / campaigns.length;
      const efficientCampaigns = campaigns.filter(c => c.metrics.cpc < avgCpc * 0.8);
      
      if (efficientCampaigns.length > 0) {
        insights.push(
          `Most cost-efficient campaigns: ${efficientCampaigns.map(c => c.name).join(', ')}`
        );
      }

      return insights;
    });
  }

  /**
   * Analyze campaign and store insights in database
   */
  async analyzeCampaign(campaignId: string): Promise<void> {
    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          metrics: {
            orderBy: { date: 'desc' },
            take: 30
          }
        }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const insights = await this.generateCampaignInsights(campaign, campaign.metrics);

      // Store insights in database (would require an insights table)
      logger.info(`Generated insights for campaign ${campaign.name}:`, insights);

    } catch (error) {
      logger.error(`Failed to analyze campaign ${campaignId}:`, error);
    }
  }

  // Private helper methods

  private calculateTrends(metrics: Metric[]): {
    spend: number;
    conversions: number;
    roas: number;
  } {
    if (metrics.length < 2) {
      return { spend: 0, conversions: 0, roas: 0 };
    }

    const sortedMetrics = metrics.sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstHalf = sortedMetrics.slice(0, Math.floor(metrics.length / 2));
    const secondHalf = sortedMetrics.slice(Math.floor(metrics.length / 2));

    const firstHalfAvg = {
      spend: firstHalf.reduce((sum, m) => sum + m.spend, 0) / firstHalf.length,
      conversions: firstHalf.reduce((sum, m) => sum + m.conversions, 0) / firstHalf.length,
      roas: firstHalf.reduce((sum, m) => sum + m.returnOnAdSpend, 0) / firstHalf.length
    };

    const secondHalfAvg = {
      spend: secondHalf.reduce((sum, m) => sum + m.spend, 0) / secondHalf.length,
      conversions: secondHalf.reduce((sum, m) => sum + m.conversions, 0) / secondHalf.length,
      roas: secondHalf.reduce((sum, m) => sum + m.returnOnAdSpend, 0) / secondHalf.length
    };

    return {
      spend: firstHalfAvg.spend > 0 ? ((secondHalfAvg.spend - firstHalfAvg.spend) / firstHalfAvg.spend) * 100 : 0,
      conversions: firstHalfAvg.conversions > 0 ? ((secondHalfAvg.conversions - firstHalfAvg.conversions) / firstHalfAvg.conversions) * 100 : 0,
      roas: firstHalfAvg.roas > 0 ? ((secondHalfAvg.roas - firstHalfAvg.roas) / firstHalfAvg.roas) * 100 : 0
    };
  }

  private determinePerformanceLevel(avgRoas: number, roasTrend: number): 'excellent' | 'good' | 'average' | 'poor' {
    if (avgRoas >= 4 && roasTrend >= 0) return 'excellent';
    if (avgRoas >= 2.5 && roasTrend >= -10) return 'good';
    if (avgRoas >= 1.5 && roasTrend >= -25) return 'average';
    return 'poor';
  }

  private generateAlerts(
    campaign: Campaign,
    metrics: Metric[],
    trends: { spend: number; conversions: number; roas: number }
  ): Array<{
    type: 'warning' | 'error' | 'info';
    message: string;
    severity: 'low' | 'medium' | 'high';
  }> {
    const alerts: Array<{
      type: 'warning' | 'error' | 'info';
      message: string;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    // Budget alerts
    const totalSpend = metrics.reduce((sum, m) => sum + m.spend, 0);
    if (campaign.budget && totalSpend > campaign.budget * 0.9) {
      alerts.push({
        type: 'warning',
        message: 'Campaign spend is approaching budget limit',
        severity: 'medium'
      });
    }

    // Performance alerts
    if (trends.roas < -50) {
      alerts.push({
        type: 'error',
        message: 'ROAS has declined significantly',
        severity: 'high'
      });
    }

    if (trends.conversions < -30) {
      alerts.push({
        type: 'warning',
        message: 'Conversion rate is trending downward',
        severity: 'medium'
      });
    }

    // Positive alerts
    if (trends.roas > 25) {
      alerts.push({
        type: 'info',
        message: 'Campaign performance is improving',
        severity: 'low'
      });
    }

    return alerts;
  }
}