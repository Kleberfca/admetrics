// backend/src/routes/dashboard.routes.ts
import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authenticate, requireEmailVerification } from '../middleware/auth.middleware';
import { validate } from '../middleware/error.middleware';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for dashboard operations
const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs (dashboard needs frequent updates)
  message: {
    success: false,
    message: 'Too many dashboard requests, please try again later',
    code: 'DASHBOARD_RATE_LIMIT_EXCEEDED'
  }
});

// Apply authentication to all routes
router.use(authenticate);
router.use(requireEmailVerification);

// Validation schemas
const dashboardOverviewSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  platforms: z.string().optional(),
  campaignIds: z.string().optional(),
  timezone: z.string().optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional(),
  includeComparison: z.string().optional().transform(val => val === 'true')
});

const metricsQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  platforms: z.string().optional(),
  campaignIds: z.string().optional(),
  metrics: z.string().optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional(),
  timezone: z.string().optional(),
  includeComparison: z.string().optional().transform(val => val === 'true'),
  comparisonPeriod: z.string().optional().transform(val => val ? parseInt(val) : undefined)
});

const customDashboardSchema = z.object({
  name: z.string().min(1, 'Dashboard name is required').max(100),
  layout: z.array(z.object({
    id: z.string(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    config: z.record(z.any())
  })),
  isDefault: z.boolean().optional(),
  isPublic: z.boolean().optional()
});

/**
 * @swagger
 * components:
 *   schemas:
 *     DashboardOverview:
 *       type: object
 *       properties:
 *         totalSpend:
 *           type: number
 *         totalClicks:
 *           type: number
 *         totalImpressions:
 *           type: number
 *         totalConversions:
 *           type: number
 *         averageCpc:
 *           type: number
 *         averageCtr:
 *           type: number
 *         averageRoas:
 *           type: number
 *         spendChange:
 *           type: number
 *         conversionChange:
 *           type: number
 *         platformBreakdown:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               platform:
 *                 type: string
 *               spend:
 *                 type: number
 *               conversions:
 *                 type: number
 *               roas:
 *                 type: number
 *               percentage:
 *                 type: number
 *     
 *     Widget:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         type:
 *           type: string
 *         title:
 *           type: string
 *         x:
 *           type: number
 *         y:
 *           type: number
 *         w:
 *           type: number
 *         h:
 *           type: number
 *         config:
 *           type: object
 *         data:
 *           type: object
 *     
 *     CustomDashboard:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         layout:
 *           type: array
 *           items:
 *             type: object
 *         isDefault:
 *           type: boolean
 *         isPublic:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/dashboard/overview:
 *   get:
 *     summary: Get dashboard overview metrics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for metrics (defaults to 30 days ago)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for metrics (defaults to now)
 *       - in: query
 *         name: platforms
 *         schema:
 *           type: string
 *         description: Comma-separated list of platforms to include
 *       - in: query
 *         name: campaignIds
 *         schema:
 *           type: string
 *         description: Comma-separated list of campaign IDs to include
 *       - in: query
 *         name: timezone
 *         schema:
 *           type: string
 *           default: UTC
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *       - in: query
 *         name: includeComparison
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include comparison with previous period
 *     responses:
 *       200:
 *         description: Dashboard overview retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/DashboardOverview'
 *                     - type: object
 *                       properties:
 *                         topCampaigns:
 *                           type: array
 *                           items:
 *                             type: object
 *                         platformPerformance:
 *                           type: array
 *                           items:
 *                             type: object
 *                         recentAlerts:
 *                           type: array
 *                           items:
 *                             type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/overview', dashboardLimiter, validate(dashboardOverviewSchema, 'query'), DashboardController.getOverview);

/**
 * @swagger
 * /api/dashboard/metrics:
 *   get:
 *     summary: Get detailed dashboard metrics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: platforms
 *         schema:
 *           type: string
 *         description: Comma-separated list of platforms
 *       - in: query
 *         name: campaignIds
 *         schema:
 *           type: string
 *         description: Comma-separated list of campaign IDs
 *       - in: query
 *         name: metrics
 *         schema:
 *           type: string
 *         description: Comma-separated list of specific metrics
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *       - in: query
 *         name: timezone
 *         schema:
 *           type: string
 *           default: UTC
 *       - in: query
 *         name: includeComparison
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: comparisonPeriod
 *         schema:
 *           type: integer
 *         description: Number of days for comparison period
 *     responses:
 *       200:
 *         description: Dashboard metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     metrics:
 *                       type: array
 *                       items:
 *                         type: object
 *                     aggregated:
 *                       type: object
 *                     comparison:
 *                       type: object
 *       400:
 *         description: Invalid date range or parameters
 */
router.get('/metrics', validate(metricsQuerySchema, 'query'), DashboardController.getMetrics);

/**
 * @swagger
 * /api/dashboard/widgets:
 *   get:
 *     summary: Get dashboard widgets configuration
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard widgets retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Widget'
 */
router.get('/widgets', DashboardController.getWidgets);

/**
 * @swagger
 * /api/dashboard/widgets/{type}/data:
 *   get:
 *     summary: Get data for specific widget type
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Widget type (e.g., spend-chart, conversion-funnel, top-campaigns)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: platforms
 *         schema:
 *           type: string
 *       - in: query
 *         name: campaignIds
 *         schema:
 *           type: string
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *     responses:
 *       200:
 *         description: Widget data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Widget type not found
 */
router.get('/widgets/:type/data', DashboardController.getWidgetData);

/**
 * @swagger
 * /api/dashboard/alerts:
 *   get:
 *     summary: Get dashboard alerts
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Dashboard alerts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       severity:
 *                         type: string
 *                       message:
 *                         type: string
 *                       campaignName:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       isRead:
 *                         type: boolean
 */
router.get('/alerts', DashboardController.getAlerts);

/**
 * @swagger
 * /api/dashboard/alerts/{id}/read:
 *   patch:
 *     summary: Mark alert as read
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert marked as read
 *       404:
 *         description: Alert not found
 */
router.patch('/alerts/:id/read', DashboardController.markAlertAsRead);

/**
 * @swagger
 * /api/dashboard/real-time:
 *   get:
 *     summary: Get real-time dashboard data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: campaignIds
 *         schema:
 *           type: string
 *         description: Comma-separated list of campaign IDs
 *     responses:
 *       200:
 *         description: Real-time data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     campaigns:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totals:
 *                       type: object
 *                     alerts:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.get('/real-time', DashboardController.getRealTimeData);

// Custom dashboard management

/**
 * @swagger
 * /api/dashboard/custom:
 *   get:
 *     summary: Get user's custom dashboards
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Custom dashboards retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CustomDashboard'
 */
router.get('/custom', DashboardController.getCustomDashboards);

/**
 * @swagger
 * /api/dashboard/custom:
 *   post:
 *     summary: Create custom dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - layout
 *             properties:
 *               name:
 *                 type: string
 *               layout:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     type:
 *                       type: string
 *                     x:
 *                       type: number
 *                     y:
 *                       type: number
 *                     w:
 *                       type: number
 *                     h:
 *                       type: number
 *                     config:
 *                       type: object
 *               isDefault:
 *                 type: boolean
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Custom dashboard created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/CustomDashboard'
 */
router.post('/custom', validate(customDashboardSchema), DashboardController.createCustomDashboard);

/**
 * @swagger
 * /api/dashboard/custom/{id}:
 *   get:
 *     summary: Get custom dashboard by ID
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Custom dashboard retrieved successfully
 *       404:
 *         description: Dashboard not found
 */
router.get('/custom/:id', DashboardController.getCustomDashboardById);

/**
 * @swagger
 * /api/dashboard/custom/{id}:
 *   put:
 *     summary: Update custom dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               layout:
 *                 type: array
 *                 items:
 *                   type: object
 *               isDefault:
 *                 type: boolean
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Custom dashboard updated successfully
 *       404:
 *         description: Dashboard not found
 */
router.put('/custom/:id', validate(customDashboardSchema.partial()), DashboardController.updateCustomDashboard);

/**
 * @swagger
 * /api/dashboard/custom/{id}:
 *   delete:
 *     summary: Delete custom dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Custom dashboard deleted successfully
 *       404:
 *         description: Dashboard not found
 */
router.delete('/custom/:id', DashboardController.deleteCustomDashboard);

/**
 * @swagger
 * /api/dashboard/export:
 *   post:
 *     summary: Export dashboard data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - format
 *               - startDate
 *               - endDate
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [csv, xlsx, pdf]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               platforms:
 *                 type: array
 *                 items:
 *                   type: string
 *               campaignIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               metrics:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Export file generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     downloadUrl:
 *                       type: string
 *                     filename:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 */
router.post('/export', DashboardController.exportData);

export default router;