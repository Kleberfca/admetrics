// backend/src/routes/campaigns.routes.ts
import { Router } from 'express';
import { CampaignsController } from '../controllers/campaigns.controller';
import { authenticate, requireEmailVerification, requireOrganizationAccess } from '../middleware/auth.middleware';
import { validate } from '../middleware/error.middleware';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for campaign operations
const campaignLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many campaign requests, please try again later',
    code: 'CAMPAIGN_RATE_LIMIT_EXCEEDED'
  }
});

// Apply authentication to all routes
router.use(authenticate);
router.use(requireEmailVerification);

// Validation schemas
const getCampaignsSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  platforms: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
});

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(255),
  platform: z.enum(['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS']),
  integrationId: z.string().min(1, 'Integration ID is required'),
  objective: z.string().optional(),
  budget: z.number().min(0).optional(),
  budgetType: z.enum(['DAILY', 'LIFETIME']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  targeting: z.any().optional(),
  geoTargeting: z.any().optional()
});

const updateCampaignSchema = createCampaignSchema.partial().omit({ platform: true, integrationId: true });

const campaignMetricsSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional(),
  metrics: z.array(z.string()).optional()
});

const bulkUpdateSchema = z.object({
  campaignIds: z.array(z.string()).min(1),
  updates: updateCampaignSchema
});

const compareCampaignsSchema = z.object({
  campaignIds: z.array(z.string()).min(2, 'At least 2 campaigns required for comparison'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Campaign:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         platform:
 *           type: string
 *           enum: [GOOGLE_ADS, FACEBOOK_ADS, INSTAGRAM_ADS, TIKTOK_ADS, LINKEDIN_ADS, TWITTER_ADS, YOUTUBE_ADS, PINTEREST_ADS, SNAPCHAT_ADS]
 *         status:
 *           type: string
 *           enum: [DRAFT, ACTIVE, PAUSED, ENDED]
 *         objective:
 *           type: string
 *         budget:
 *           type: number
 *         budgetType:
 *           type: string
 *           enum: [DAILY, LIFETIME]
 *         startDate:
 *           type: string
 *           format: date-time
 *         endDate:
 *           type: string
 *           format: date-time
 *         targeting:
 *           type: object
 *         geoTargeting:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     CampaignMetrics:
 *       type: object
 *       properties:
 *         campaignId:
 *           type: string
 *         date:
 *           type: string
 *           format: date
 *         spend:
 *           type: number
 *         clicks:
 *           type: number
 *         impressions:
 *           type: number
 *         conversions:
 *           type: number
 *         cpc:
 *           type: number
 *         ctr:
 *           type: number
 *         cvr:
 *           type: number
 *         cpa:
 *           type: number
 *         roas:
 *           type: number
 *         cpm:
 *           type: number
 */

/**
 * @swagger
 * /api/campaigns:
 *   get:
 *     summary: Get campaigns with pagination and filters
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: platforms
 *         schema:
 *           type: string
 *         description: Comma-separated list of platforms
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, PAUSED, ENDED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in campaign names and objectives
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: updatedAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Campaigns retrieved successfully
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
 *                     campaigns:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Campaign'
 *                     total:
 *                       type: number
 *                     totalPages:
 *                       type: number
 *                     currentPage:
 *                       type: number
 */
router.get('/', campaignLimiter, validate(getCampaignsSchema, 'query'), CampaignsController.getCampaigns);

/**
 * @swagger
 * /api/campaigns:
 *   post:
 *     summary: Create a new campaign
 *     tags: [Campaigns]
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
 *               - platform
 *               - integrationId
 *             properties:
 *               name:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [GOOGLE_ADS, FACEBOOK_ADS, INSTAGRAM_ADS, TIKTOK_ADS, LINKEDIN_ADS, TWITTER_ADS, YOUTUBE_ADS, PINTEREST_ADS, SNAPCHAT_ADS]
 *               integrationId:
 *                 type: string
 *               objective:
 *                 type: string
 *               budget:
 *                 type: number
 *               budgetType:
 *                 type: string
 *                 enum: [DAILY, LIFETIME]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               targeting:
 *                 type: object
 *               geoTargeting:
 *                 type: object
 *     responses:
 *       201:
 *         description: Campaign created successfully
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
 *                   $ref: '#/components/schemas/Campaign'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Integration not found
 */
router.post('/', validate(createCampaignSchema), CampaignsController.createCampaign);

/**
 * @swagger
 * /api/campaigns/{id}:
 *   get:
 *     summary: Get campaign by ID
 *     tags: [Campaigns]
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
 *         description: Campaign retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Campaign'
 *       404:
 *         description: Campaign not found
 */
router.get('/:id', CampaignsController.getCampaignById);

/**
 * @swagger
 * /api/campaigns/{id}:
 *   put:
 *     summary: Update campaign
 *     tags: [Campaigns]
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
 *               budget:
 *                 type: number
 *               budgetType:
 *                 type: string
 *                 enum: [DAILY, LIFETIME]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               targeting:
 *                 type: object
 *               geoTargeting:
 *                 type: object
 *               status:
 *                 type: string
 *                 enum: [DRAFT, ACTIVE, PAUSED, ENDED]
 *     responses:
 *       200:
 *         description: Campaign updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Campaign not found
 */
router.put('/:id', validate(updateCampaignSchema), CampaignsController.updateCampaign);

/**
 * @swagger
 * /api/campaigns/{id}:
 *   delete:
 *     summary: Delete campaign
 *     tags: [Campaigns]
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
 *         description: Campaign deleted successfully
 *       404:
 *         description: Campaign not found
 */
router.delete('/:id', CampaignsController.deleteCampaign);

/**
 * @swagger
 * /api/campaigns/{id}/status:
 *   patch:
 *     summary: Update campaign status
 *     tags: [Campaigns]
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
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, PAUSED, ENDED]
 *     responses:
 *       200:
 *         description: Campaign status updated successfully
 *       400:
 *         description: Invalid status
 *       404:
 *         description: Campaign not found
 */
router.patch('/:id/status', CampaignsController.updateCampaignStatus);

/**
 * @swagger
 * /api/campaigns/{id}/metrics:
 *   get:
 *     summary: Get campaign metrics
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *       - in: query
 *         name: metrics
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Specific metrics to include
 *     responses:
 *       200:
 *         description: Campaign metrics retrieved successfully
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
 *                     $ref: '#/components/schemas/CampaignMetrics'
 *       404:
 *         description: Campaign not found
 */
router.get('/:id/metrics', validate(campaignMetricsSchema, 'query'), CampaignsController.getCampaignMetrics);

/**
 * @swagger
 * /api/campaigns/{id}/insights:
 *   get:
 *     summary: Get AI insights for campaign
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: period
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: Campaign insights retrieved successfully
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
 *                     campaignId:
 *                       type: string
 *                     campaignName:
 *                       type: string
 *                     platform:
 *                       type: string
 *                     insights:
 *                       type: object
 *                       properties:
 *                         performance:
 *                           type: string
 *                           enum: [excellent, good, average, poor]
 *                         recommendations:
 *                           type: array
 *                           items:
 *                             type: string
 *                         trends:
 *                           type: object
 *                         alerts:
 *                           type: array
 *                           items:
 *                             type: object
 *                         optimizationOpportunities:
 *                           type: array
 *                           items:
 *                             type: object
 *       404:
 *         description: Campaign not found
 */
router.get('/:id/insights', CampaignsController.getCampaignInsights);

/**
 * @swagger
 * /api/campaigns/bulk/update:
 *   patch:
 *     summary: Bulk update campaigns
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - campaignIds
 *               - updates
 *             properties:
 *               campaignIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               updates:
 *                 type: object
 *                 properties:
 *                   budget:
 *                     type: number
 *                   status:
 *                     type: string
 *                     enum: [ACTIVE, PAUSED, ENDED]
 *     responses:
 *       200:
 *         description: Bulk update completed
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
 *                     success:
 *                       type: number
 *                     failed:
 *                       type: number
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.patch('/bulk/update', validate(bulkUpdateSchema), CampaignsController.bulkUpdateCampaigns);

/**
 * @swagger
 * /api/campaigns/sync:
 *   post:
 *     summary: Sync campaigns from platforms
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               integrationId:
 *                 type: string
 *                 description: Specific integration to sync (optional)
 *     responses:
 *       200:
 *         description: Sync completed
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
 *                     synced:
 *                       type: number
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.post('/sync', CampaignsController.syncCampaigns);

/**
 * @swagger
 * /api/campaigns/compare:
 *   post:
 *     summary: Compare multiple campaigns
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - campaignIds
 *               - startDate
 *               - endDate
 *             properties:
 *               campaignIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 2
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Campaign comparison completed
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
 *                     campaigns:
 *                       type: array
 *                       items:
 *                         type: object
 *                     comparison:
 *                       type: object
 *                       properties:
 *                         bestPerforming:
 *                           type: string
 *                         worstPerforming:
 *                           type: string
 *                         insights:
 *                           type: array
 *                           items:
 *                             type: string
 */
router.post('/compare', validate(compareCampaignsSchema), CampaignsController.compareCampaigns);

export default router;