import { Router } from 'express';
import { MetricsController } from '../controllers/metrics.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const metricsQuerySchema = z.object({
  query: z.object({
    campaignIds: z.string().optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    granularity: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(),
    metrics: z.string().optional(),
    groupBy: z.string().optional()
  })
});

const dashboardQuerySchema = z.object({
  query: z.object({
    period: z.enum(['24h', '7d', '30d', '90d', 'custom']).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  })
});

const exportSchema = z.object({
  body: z.object({
    campaignIds: z.array(z.string().uuid()),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    format: z.enum(['csv', 'excel', 'json', 'pdf']),
    metrics: z.array(z.string()).optional(),
    groupBy: z.string().optional(),
    includeCharts: z.boolean().optional()
  })
});

// All routes require authentication
router.use(authenticate);

// Dashboard metrics
router.get('/dashboard', validateRequest(dashboardQuerySchema), MetricsController.getDashboardMetrics);

// Campaign metrics
router.get('/campaigns', validateRequest(metricsQuerySchema), MetricsController.getCampaignMetrics);

// Platform metrics
router.get('/platforms', MetricsController.getPlatformMetrics);

// Top performers
router.get('/top-performers', MetricsController.getTopPerformers);

// Comparison
router.get('/comparison', MetricsController.getComparison);

// Real-time metrics (WebSocket endpoint info)
router.get('/realtime/info', MetricsController.getRealtimeInfo);

// Export metrics
router.post('/export', validateRequest(exportSchema), MetricsController.exportMetrics);

// Custom metrics
router.get('/custom/:metricId', MetricsController.getCustomMetric);

export default router;