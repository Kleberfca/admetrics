import { AIInsight, Campaign, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import axios from 'axios';
import { WebSocketService } from './websocket.service';
import { CacheManager, Cacheable } from '../config/redis';

interface AIInsightData {
  campaignId: string;
  type: 'prediction' | 'optimization' | 'anomaly';
  category: 'performance' | 'budget' | 'audience' | 'creative';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  confidence: number;
  data: any;
  recommendations: string[];
}

interface PerformancePrediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  change: number;
  confidence: number;
  timeframe: string;
}

export class AIInsightsService {
  private aiEngineUrl: string;
  private wsService: WebSocketService;

  constructor() {
    this.aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:5000';
    this.wsService = WebSocketService.getInstance();
  }

  /**
   * Get AI insights for a campaign
   */
  @Cacheable((target, propertyKey, campaignId: string, userId: string) => ({
    key: `ai-insights:${campaignId}`,
    ttl: 300 // 5 minutes
  }))
  async getCampaignInsights(campaignId: string, userId: string): Promise<AIInsight[]> {
    // Verify campaign ownership
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId,
        deletedAt: null
      }
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get insights from database
    const insights = await prisma.aIInsight.findMany({
      where: {
        campaignId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      orderBy: [
        { severity: 'desc' },
        { confidence: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return insights;
  }

  /**
   * Generate performance insights
   */
  async generatePerformanceInsights(campaignId: string): Promise<AIInsightData[]> {
    try {
      // Get campaign metrics
      const metrics = await prisma.metric.findMany({
        where: {
          campaignId,
          date: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        orderBy: {
          date: 'desc'
        }
      });

      if (metrics.length < 7) {
        return [];
      }

      // Call AI engine for predictions
      const response = await axios.post(`${this.aiEngineUrl}/api/predict/performance`, {
        campaign_id: campaignId,
        prediction_days: 7
      });

      const predictions: PerformancePrediction[] = response.data.data;
      const insights: AIInsightData[] = [];

      // Analyze predictions
      predictions.forEach(prediction => {
        if (Math.abs(prediction.change) > 20 && prediction.confidence > 0.8) {
          const isPositive = prediction.change > 0;
          const severity = Math.abs(prediction.change) > 50 ? 'critical' : 'warning';

          insights.push({
            campaignId,
            type: 'prediction',
            category: 'performance',
            title: `${prediction.metric} ${isPositive ? 'Increase' : 'Decrease'} Expected`,
            description: `${prediction.metric} is predicted to ${isPositive ? 'increase' : 'decrease'} by ${Math.abs(prediction.change).toFixed(1)}% over the next ${prediction.timeframe}`,
            severity,
            confidence: prediction.confidence,
            data: prediction,
            recommendations: this.getPerformanceRecommendations(prediction, isPositive)
          });
        }
      });

      // Save insights to database
      await this.saveInsights(insights);

      return insights;
    } catch (error) {
      logger.error('Failed to generate performance insights', { campaignId, error });
      return [];
    }
  }

  /**
   * Generate optimization insights
   */
  async generateOptimizationInsights(campaignId: string): Promise<AIInsightData[]> {
    try {
      // Get campaign and related campaigns for optimization
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
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

      if (!campaign) {
        return [];
      }

      // Get all user campaigns for budget optimization
      const allCampaigns = await prisma.campaign.findMany({
        where: {
          userId: campaign.userId,
          status: 'ACTIVE',
          deletedAt: null
        }
      });

      // Call AI engine for optimization
      const response = await axios.post(`${this.aiEngineUrl}/api/optimize/budget`, {
        total_budget: allCampaigns.reduce((sum, c) => sum + (c.budget || 0), 0),
        campaign_ids: allCampaigns.map(c => c.id),
        optimization_goal: 'conversions'
      });

      const optimizationResult = response.data.data;
      const insights: AIInsightData[] = [];

      // Check if current campaign needs budget adjustment
      const currentBudget = campaign.budget || 0;
      const recommendedBudget = optimizationResult.allocations[campaignId] || currentBudget;
      const budgetChange = ((recommendedBudget - currentBudget) / currentBudget) * 100;

      if (Math.abs(budgetChange) > 10) {
        insights.push({
          campaignId,
          type: 'optimization',
          category: 'budget',
          title: 'Budget Optimization Opportunity',
          description: `Adjusting budget by ${budgetChange.toFixed(1)}% could improve overall performance`,
          severity: Math.abs(budgetChange) > 30 ? 'warning' : 'info',
          confidence: optimizationResult.confidence || 0.85,
          data: {
            currentBudget,
            recommendedBudget,
            expectedImprovement: optimizationResult.expectedImprovement
          },
          recommendations: [
            `${budgetChange > 0 ? 'Increase' : 'Decrease'} daily budget to $${recommendedBudget.toFixed(2)}`,
            'Monitor performance for 3-5 days after adjustment',
            'Consider reallocating budget from lower-performing campaigns'
          ]
        });
      }

      // Save insights
      await this.saveInsights(insights);

      return insights;
    } catch (error) {
      logger.error('Failed to generate optimization insights', { campaignId, error });
      return [];
    }
  }

  /**
   * Generate audience insights
   */
  async generateAudienceInsights(campaignId: string): Promise<AIInsightData[]> {
    try {
      // Call AI engine for audience segmentation
      const response = await axios.post(`${this.aiEngineUrl}/api/segment/audience`, {
        campaign_id: campaignId
      });

      const segments = response.data.data;
      const insights: AIInsightData[] = [];

      // Analyze segments
      if (segments.highValueSegments && segments.highValueSegments.length > 0) {
        insights.push({
          campaignId,
          type: 'optimization',
          category: 'audience',
          title: 'High-Value Audience Segments Identified',
          description: `${segments.highValueSegments.length} audience segments show significantly higher conversion rates`,
          severity: 'info',
          confidence: 0.9,
          data: segments,
          recommendations: [
            'Create separate ad groups for high-value segments',
            'Increase bids for high-converting audiences',
            'Develop tailored creatives for each segment'
          ]
        });
      }

      // Save insights
      await this.saveInsights(insights);

      return insights;
    } catch (error) {
      logger.error('Failed to generate audience insights', { campaignId, error });
      return [];
    }
  }

  /**
   * Detect anomalies
   */
  async detectAnomalies(campaignIds: string[]): Promise<AIInsightData[]> {
    try {
      // Call AI engine for anomaly detection
      const response = await axios.post(`${this.aiEngineUrl}/api/detect/anomalies`, {
        campaign_ids: campaignIds,
        metric_type: 'all'
      });

      const anomalies = response.data.data;
      const insights: AIInsightData[] = [];

      // Process critical anomalies
      if (anomalies.critical) {
        anomalies.critical.forEach((anomaly: any) => {
          insights.push({
            campaignId: anomaly.campaign_id,
            type: 'anomaly',
            category: 'performance',
            title: `Anomaly Detected: ${anomaly.metric}`,
            description: anomaly.description,
            severity: 'critical',
            confidence: anomaly.confidence,
            data: anomaly,
            recommendations: this.getAnomalyRecommendations(anomaly)
          });
        });
      }

      // Process warning anomalies
      if (anomalies.warning) {
        anomalies.warning.forEach((anomaly: any) => {
          insights.push({
            campaignId: anomaly.campaign_id,
            type: 'anomaly',
            category: 'performance',
            title: `Unusual Pattern: ${anomaly.metric}`,
            description: anomaly.description,
            severity: 'warning',
            confidence: anomaly.confidence,
            data: anomaly,
            recommendations: this.getAnomalyRecommendations(anomaly)
          });
        });
      }

      // Save insights
      await this.saveInsights(insights);

      return insights;
    } catch (error) {
      logger.error('Failed to detect anomalies', { campaignIds, error });
      return [];
    }
  }

  /**
   * Mark insight as read
   */
  async markAsRead(insightId: string, userId: string): Promise<void> {
    await prisma.aIInsight.updateMany({
      where: {
        id: insightId,
        campaign: {
          userId
        }
      },
      data: {
        isRead: true
      }
    });
  }

  /**
   * Mark insight as actioned
   */
  async markAsActioned(insightId: string, userId: string): Promise<void> {
    await prisma.aIInsight.updateMany({
      where: {
        id: insightId,
        campaign: {
          userId
        }
      },
      data: {
        isActioned: true,
        actionedAt: new Date()
      }
    });
  }

  /**
   * Save insights to database
   */
  private async saveInsights(insights: AIInsightData[]): Promise<void> {
    try {
      const insightRecords = insights.map(insight => ({
        campaignId: insight.campaignId,
        type: insight.type,
        category: insight.category,
        title: insight.title,
        description: insight.description,
        severity: insight.severity,
        confidence: insight.confidence,
        data: insight.data,
        recommendations: insight.recommendations,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }));

      await prisma.aIInsight.createMany({
        data: insightRecords,
        skipDuplicates: true
      });

      // Broadcast new insights via WebSocket
      insights.forEach(insight => {
        WebSocketService.publishEvent('ai_insight', {
          campaignId: insight.campaignId,
          insight
        });
      });
    } catch (error) {
      logger.error('Failed to save insights', error);
    }
  }

  /**
   * Get performance recommendations
   */
  private getPerformanceRecommendations(
    prediction: PerformancePrediction,
    isPositive: boolean
  ): string[] {
    const recommendations: string[] = [];

    if (prediction.metric === 'spend' && !isPositive) {
      recommendations.push(
        'Review bid strategies to ensure competitiveness',
        'Check if daily budget caps are limiting delivery',
        'Verify campaign is not being outbid by competitors'
      );
    }

    if (prediction.metric === 'conversions' && !isPositive) {
      recommendations.push(
        'Review and refresh ad creatives',
        'Check landing page performance and load times',
        'Consider expanding target audience',
        'Test different ad formats or placements'
      );
    }

    if (prediction.metric === 'cpc' && !isPositive) {
      recommendations.push(
        'Improve Quality Score by enhancing ad relevance',
        'Refine keyword targeting to reduce competition',
        'Test automated bidding strategies'
      );
    }

    return recommendations;
  }

  /**
   * Get anomaly recommendations
   */
  private getAnomalyRecommendations(anomaly: any): string[] {
    const recommendations: string[] = [];

    switch (anomaly.metric) {
      case 'ctr':
        recommendations.push(
          'Check if ad creatives are still relevant',
          'Verify ad placements are appropriate',
          'Review targeting settings for changes'
        );
        break;

      case 'spend':
        recommendations.push(
          'Verify budget settings are correct',
          'Check for unauthorized changes',
          'Review bid strategy performance'
        );
        break;

      case 'conversions':
        recommendations.push(
          'Check tracking pixel implementation',
          'Verify landing page functionality',
          'Review for seasonal or market changes'
        );
        break;

      default:
        recommendations.push(
          'Investigate recent campaign changes',
          'Compare with historical patterns',
          'Monitor closely for next 24-48 hours'
        );
    }

    return recommendations;
  }

  /**
   * Generate insights for all active campaigns
   */
  async generateAllInsights(): Promise<void> {
    try {
      // Get all active campaigns
      const campaigns = await prisma.campaign.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null
        },
        select: {
          id: true
        }
      });

      const campaignIds = campaigns.map(c => c.id);

      // Generate different types of insights
      await Promise.all([
        this.detectAnomalies(campaignIds),
        ...campaignIds.map(id => this.generatePerformanceInsights(id)),
        ...campaignIds.map(id => this.generateOptimizationInsights(id))
      ]);

      logger.info('Generated insights for all active campaigns', {
        campaignCount: campaigns.length
      });
    } catch (error) {
      logger.error('Failed to generate all insights', error);
    }
  }
}