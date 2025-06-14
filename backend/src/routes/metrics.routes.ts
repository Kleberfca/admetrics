import { Router } from 'express';
import { MetricsController } from '../controllers/metrics.controller';
import { validate } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const dashboardMetricsSchema = z.object({
  query: z.object({
    period: z.enum(['24h', '7d', '30d', '90d']).optional().default('7d')
  })
});

const campaignMetricsSchema = z.object({
  query: z.object({
    campaignIds: z.string(), // comma-separated list
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    granularity: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).optional().default('DAILY')
  })
});

const platformMetricsSchema = z.object({
  query: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    platforms: z.string().optional() // comma-separated list
  })
});

const comparisonMetricsSchema = z.object({
  query: z.object({
    campaignIds: z.string(), // comma-separated list
    metric: z.enum(['spend', 'clicks', 'conversions', 'roas', 'ctr', 'cpc']),
    period1Start: z.string().datetime(),
    period1End: z.string().datetime(),
    period2Start: z.string().datetime(),
    period2End: z.string().datetime()
  })
});

const exportMetricsSchema = z.object({
  body: z.object({
    campaignIds: z.array(z.string()),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    format: z.enum(['csv', 'excel', 'json']).default('csv'),
    metrics: z.array(z.string()).optional()
  })
});

// Routes
router.get('/dashboard', validate(dashboardMetricsSchema), MetricsController.getDashboardMetrics);
router.get('/campaigns', validate(campaignMetricsSchema), MetricsController.getCampaignMetrics);
router.get('/platforms', validate(platformMetricsSchema), MetricsController.getPlatformMetrics);
router.get('/top-performers', MetricsController.getTopPerformers);
router.get('/comparison', validate(comparisonMetricsSchema), MetricsController.getComparisonMetrics);
router.post('/export', validate(exportMetricsSchema), MetricsController.exportMetrics);

// Real-time metrics
router.get('/realtime/:campaignId', MetricsController.getRealtimeMetrics);

export { router as metricsRoutes };