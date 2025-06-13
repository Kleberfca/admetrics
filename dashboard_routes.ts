import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import DashboardController from '../controllers/dashboard.controller';
import { MetricsService } from '../services/metrics.service';
import { validateRequest } from '../middleware/validation';
import { body, query, param } from 'express-validator';

const router = Router();
const prisma = new PrismaClient();

// Initialize Redis (this would typically be done in app.ts and passed down)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Initialize services and controller
const metricsService = new MetricsService(prisma, redis);
const dashboardController = new DashboardController(metricsService);

/**
 * @swagger
 * components:
 *   schemas:
 *     DashboardOverview:
 *       type: object
 *       properties:
 *         summary:
 *           type: object
 *           description: Metrics summary
 *         activeCampaigns:
 *           type: integer
 *           description: Number of active campaigns
 *         integrations:
 *           type: object
 *           description: Integration status
 *         alerts:
 *           type: array
 *           description: Recent alerts
 *         performance:
 *           type: object
 *           description: Performance score and grade
 */

/**
 * @swagger
 * /api/dashboard/overview:
 *   get:
 *     summary: Get dashboard overview
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for metrics (ISO 8601)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for metrics (ISO 8601)
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
 *     responses:
 *       200:
 *         description: Dashboard overview data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/DashboardOverview'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  '/overview',
  [
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('platforms').optional().isString().withMessage('Platforms must be a string'),
    query('campaignIds').optional().isString().withMessage('Campaign IDs must be a string'),
    validateRequest,
  ],
  dashboardController.getOverview
);

/**
 * @swagger
 * /api/dashboard/performance-chart:
 *   get:
 *     summary: Get performance chart data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for metrics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for metrics
 *       - in: query
 *         name: metrics
 *         schema:
 *           type: string
 *           default: "spend,clicks,conversions"
 *         description: Comma-separated list of metrics
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Group data by time period
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
 *     responses:
 *       200:
 *         description: Performance chart data
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
 *                     chartData:
 *                       type: array
 *                     metrics:
 *                       type: array
 *                     dateRange:
 *                       type: object
 *                     groupBy:
 *                       type: string
 */
router.get(
  '/performance-chart',
  [
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('metrics').optional().isString().withMessage('Metrics must be a string'),
    query('groupBy').optional().isIn(['day', 'week', 'month']).withMessage('Invalid groupBy value'),
    query('platforms').optional().isString().withMessage('Platforms must be a string'),
    query('campaignIds').optional().isString().withMessage('Campaign IDs must be a string'),
    validateRequest,
  ],
  dashboardController.getPerformanceChart
);

/**
 * @swagger
 * /api/dashboard/platform-comparison:
 *   get:
 *     summary: Get platform comparison data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for metrics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for metrics
 *       - in: query
 *         name: metric
 *         schema:
 *           type: string
 *           default: "spend"
 *         description: Metric to compare across platforms
 *     responses:
 *       200:
 *         description: Platform comparison data
 */
router.get(
  '/platform-comparison',
  [
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('metric').optional().isString().withMessage('Metric must be a string'),
    validateRequest,
  ],
  dashboardController.getPlatformComparison
);

/**
 * @swagger
 * /api/dashboard/top-campaigns:
 *   get:
 *     summary: Get top performing campaigns
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for metrics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for metrics
 *       - in: query
 *         name: metric
 *         schema:
 *           type: string
 *           default: "roas"
 *         description: Metric to rank campaigns by
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of top campaigns to return
 *       - in: query
 *         name: platforms
 *         schema:
 *           type: string
 *         description: Comma-separated list of platforms
 *     responses:
 *       200:
 *         description: Top performing campaigns
 */
router.get(
  '/top-campaigns',
  [
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('metric').optional().isString().withMessage('Metric must be a string'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('platforms').optional().isString().withMessage('Platforms must be a string'),
    validateRequest,
  ],
  dashboardController.getTopCampaigns
);

/**
 * @swagger
 * /api/dashboard/layouts:
 *   get:
 *     summary: Get saved dashboard layouts
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of saved dashboard layouts
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
 *                       name:
 *                         type: string
 *                       layout:
 *                         type: object
 *                       widgets:
 *                         type: object
 *                       filters:
 *                         type: object
 *                       isPublic:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                       updatedAt:
 *                         type: string
 */
router.get('/layouts', dashboardController.getDashboardLayouts);

/**
 * @swagger
 * /api/dashboard/layouts:
 *   post:
 *     summary: Save dashboard layout
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
 *                 description: Dashboard name
 *               layout:
 *                 type: object
 *                 description: Dashboard layout configuration
 *               widgets:
 *                 type: object
 *                 description: Widget configurations
 *               filters:
 *                 type: object
 *                 description: Default filters
 *               isDefault:
 *                 type: boolean
 *                 description: Set as default dashboard
 *     responses:
 *       200:
 *         description: Dashboard layout saved successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/layouts',
  [
    body('name')
      .notEmpty()
      .withMessage('Dashboard name is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Dashboard name must be between 1 and 100 characters'),
    body('layout')
      .notEmpty()
      .withMessage('Dashboard layout is required')
      .isObject()
      .withMessage('Layout must be an object'),
    body('widgets')
      .optional()
      .isObject()
      .withMessage('Widgets must be an object'),
    body('filters')
      .optional()
      .isObject()
      .withMessage('Filters must be an object'),
    body('isDefault')
      .optional()
      .isBoolean()
      .withMessage('isDefault must be a boolean'),
    validateRequest,
  ],
  dashboardController.saveDashboardLayout
);

/**
 * @swagger
 * /api/dashboard/layouts/{id}:
 *   delete:
 *     summary: Delete dashboard layout
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dashboard ID
 *     responses:
 *       200:
 *         description: Dashboard deleted successfully
 *       404:
 *         description: Dashboard not found
 */
router.delete(
  '/layouts/:id',
  [
    param('id').isString().notEmpty().withMessage('Dashboard ID is required'),
    validateRequest,
  ],
  async (req, res) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    try {
      // Check if dashboard exists and belongs to user
      const dashboard = await prisma.dashboard.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!dashboard) {
        return res.status(404).json({
          success: false,
          message: 'Dashboard not found',
          error: 'NOT_FOUND',
        });
      }

      // Delete dashboard
      await prisma.dashboard.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: 'Dashboard deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting dashboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete dashboard',
        error: 'INTERNAL_ERROR',
      });
    }
  }
);

export default router;