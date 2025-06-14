import { Request, Response, NextFunction } from 'express';
import { MetricsService } from '../services/metrics.service';
import { ExportService } from '../services/export.service';
import { WebSocketService } from '../services/websocket.service';
import { NotFoundError, ValidationError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export class MetricsController {
  private static metricsService = new MetricsService();
  private static exportService = new ExportService();
  private static wsService = WebSocketService.getInstance();

  /**
   * Get dashboard metrics
   */
  static async getDashboardMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { period = '7d' } = req.query;

      const metrics = await MetricsController.metricsService.getDashboardMetrics(
        userId,
        period as string
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
   * Get campaign metrics
   */
  static async getCampaignMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { campaignIds, startDate, endDate, granularity = 'DAILY' } = req.query;

      if (!campaignIds || !startDate || !endDate) {
        throw new ValidationError('Campaign IDs, start date, and end date are required');
      }

      const campaignIdArray = (campaignIds as string).split(',');
      
      const metrics = await MetricsController.metricsService.getAggregatedMetrics(
        userId,
        campaignIdArray,
        new Date(startDate as string),
        new Date(endDate as string)
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
   * Get platform metrics
   */
  static async getPlatformMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, platforms } = req.query;

      if (!startDate || !endDate) {
        throw new ValidationError('Start date and end date are required');
      }

      const platformMetrics = await MetricsController.metricsService.getPlatformPerformance(
        userId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      // Filter by platforms if specified
      let filteredMetrics = platformMetrics;
      if (platforms) {
        const platformList = (platforms as string).split(',');
        filteredMetrics = platformMetrics.filter(m => platformList.includes(m.platform));
      }

      res.json({
        success: true,
        data: filteredMetrics
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get top performing campaigns
   */
  static async getTopPerformers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { 
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 
        endDate = new Date(),
        limit = 10 
      } = req.query;

      const topCampaigns = await MetricsController.metricsService.getTopCampaigns(
        userId,
        new Date(startDate as string),
        new Date(endDate as string),
        Number(limit)
      );

      res.json({
        success: true,
        data: topCampaigns
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get comparison metrics
   */
  static async getComparisonMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { 
        campaignIds, 
        metric, 
        period1Start, 
        period1End, 
        period2Start, 
        period2End 
      } = req.query;

      if (!campaignIds || !metric || !period1Start || !period1End || !period2Start || !period2End) {
        throw new ValidationError('All comparison parameters are required');
      }

      const campaignIdArray = (campaignIds as string).split(',');

      // Get metrics for both periods
      const [period1Metrics, period2Metrics] = await Promise.all([
        MetricsController.metricsService.getAggregatedMetrics(
          userId,
          campaignIdArray,
          new Date(period1Start as string),
          new Date(period1End as string)
        ),
        MetricsController.metricsService.getAggregatedMetrics(
          userId,
          campaignIdArray,
          new Date(period2Start as string),
          new Date(period2End as string)
        )
      ]);

      // Calculate comparison
      const comparison = {
        period1: {
          startDate: period1Start,
          endDate: period1End,
          metrics: period1Metrics
        },
        period2: {
          startDate: period2Start,
          endDate: period2End,
          metrics: period2Metrics
        },
        change: {
          spend: period1Metrics.totalSpend > 0 
            ? ((period2Metrics.totalSpend - period1Metrics.totalSpend) / period1Metrics.totalSpend) * 100
            : 0,
          clicks: period1Metrics.totalClicks > 0
            ? ((period2Metrics.totalClicks - period1Metrics.totalClicks) / period1Metrics.totalClicks) * 100
            : 0,
          conversions: period1Metrics.totalConversions > 0
            ? ((period2Metrics.totalConversions - period1Metrics.totalConversions) / period1Metrics.totalConversions) * 100
            : 0,
          roas: period1Metrics.averageRoas > 0
            ? ((period2Metrics.averageRoas - period1Metrics.averageRoas) / period1Metrics.averageRoas) * 100
            : 0
        }
      };

      res.json({
        success: true,
        data: comparison
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export metrics
   */
  static async exportMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { campaignIds, startDate, endDate, format = 'csv', metrics } = req.body;

      // Generate export
      const exportData = await MetricsController.exportService.exportMetrics({
        userId,
        campaignIds,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        format,
        metrics
      });

      // Set appropriate headers
      let contentType: string;
      let filename: string;

      switch (format) {
        case 'excel':
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          filename = 'metrics.xlsx';
          break;
        case 'json':
          contentType = 'application/json';
          filename = 'metrics.json';
          break;
        case 'csv':
        default:
          contentType = 'text/csv';
          filename = 'metrics.csv';
          break;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.send(exportData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get real-time metrics
   */
  static async getRealtimeMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { campaignId } = req.params;

      // Verify campaign ownership
      const campaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          userId,
          deletedAt: null
        }
      });

      if (!campaign) {
        throw new NotFoundError('Campaign not found');
      }

      // Subscribe to real-time updates
      const roomId = `metrics:${campaignId}`;
      MetricsController.wsService.subscribeToRoom(req.user!.id, roomId);

      // Get current metrics
      const currentMetrics = await MetricsController.metricsService.getCampaignMetrics(
        campaignId,
        userId,
        new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        new Date(),
        'HOURLY'
      );

      res.json({
        success: true,
        data: {
          metrics: currentMetrics,
          subscriptionRoom: roomId,
          message: 'Subscribed to real-time updates'
        }
      });
    } catch (error) {
      next(error);
    }
  }
}