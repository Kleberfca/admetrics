// backend/src/routes/integrations.routes.ts
import { Router } from 'express';
import { IntegrationsController } from '../controllers/integrations.controller';
import { authenticate, requireEmailVerification } from '../middleware/auth.middleware';
import { validate } from '../middleware/error.middleware';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for integration operations
const integrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: {
    success: false,
    message: 'Too many integration requests, please try again later',
    code: 'INTEGRATION_RATE_LIMIT_EXCEEDED'
  }
});

// Apply authentication to all routes
router.use(authenticate);
router.use(requireEmailVerification);

// Validation schemas
const createIntegrationSchema = z.object({
  platform: z.enum(['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS']),
  name: z.string().min(1).max(100),
  credentials: z.record(z.any()),
  config: z.record(z.any()).optional(),
  scopes: z.array(z.string()).optional(),
  syncEnabled: z.boolean().optional(),
  syncFrequency: z.enum(['REAL_TIME', 'EVERY_5_MINUTES', 'EVERY_15_MINUTES', 'HOURLY', 'DAILY']).optional()
});

const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  credentials: z.record(z.any()).optional(),
  config: z.record(z.any()).optional(),
  scopes: z.array(z.string()).optional(),
  syncEnabled: z.boolean().optional(),
  syncFrequency: z.enum(['REAL_TIME', 'EVERY_5_MINUTES', 'EVERY_15_MINUTES', 'HOURLY', 'DAILY']).optional()
});

const testCredentialsSchema = z.object({
  platform: z.enum(['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS']),
  credentials: z.record(z.any())
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Integration:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         platform:
 *           type: string
 *           enum: [GOOGLE_ADS, FACEBOOK_ADS, INSTAGRAM_ADS, TIKTOK_ADS, LINKEDIN_ADS, TWITTER_ADS, YOUTUBE_ADS, PINTEREST_ADS, SNAPCHAT_ADS]
 *         name:
 *           type: string
 *         status:
 *           type: string
 *           enum: [PENDING, CONNECTED, ERROR, PAUSED]
 *         syncEnabled:
 *           type: boolean
 *         syncFrequency:
 *           type: string
 *           enum: [REAL_TIME, EVERY_5_MINUTES, EVERY_15_MINUTES, HOURLY, DAILY]
 *         lastSyncAt:
 *           type: string
 *           format: date-time
 *         nextSyncAt:
 *           type: string
 *           format: date-time
 *         errorCount:
 *           type: number
 *         lastError:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     PlatformConfig:
 *       type: object
 *       properties:
 *         platform:
 *           type: string
 *         isRequired:
 *           type: boolean
 *         fields:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               label:
 *                 type: string
 *               description:
 *                 type: string
 *               required:
 *                 type: boolean
 *               validation:
 *                 type: object
 *         requiredScopes:
 *           type: array
 *           items:
 *             type: string
 *         oauthUrl:
 *           type: string
 *         documentation:
 *           type: object
 */

/**
 * @swagger
 * /api/integrations:
 *   get:
 *     summary: Get all integrations for user
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Integrations retrieved successfully
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
 *                     $ref: '#/components/schemas/Integration'
 *       401:
 *         description: Unauthorized
 */
router.get('/', integrationLimiter, IntegrationsController.getIntegrations);

/**
 * @swagger
 * /api/integrations:
 *   post:
 *     summary: Create a new integration
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - platform
 *               - name
 *               - credentials
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [GOOGLE_ADS, FACEBOOK_ADS, INSTAGRAM_ADS, TIKTOK_ADS, LINKEDIN_ADS, TWITTER_ADS, YOUTUBE_ADS, PINTEREST_ADS, SNAPCHAT_ADS]
 *               name:
 *                 type: string
 *               credentials:
 *                 type: object
 *                 description: Platform-specific credentials
 *               config:
 *                 type: object
 *                 description: Optional configuration settings
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *               syncEnabled:
 *                 type: boolean
 *               syncFrequency:
 *                 type: string
 *                 enum: [REAL_TIME, EVERY_5_MINUTES, EVERY_15_MINUTES, HOURLY, DAILY]
 *     responses:
 *       201:
 *         description: Integration created successfully
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
 *                   $ref: '#/components/schemas/Integration'
 *       400:
 *         description: Validation error or connection test failed
 *       409:
 *         description: Integration already exists for this platform
 */
router.post('/', validate(createIntegrationSchema), IntegrationsController.createIntegration);

/**
 * @swagger
 * /api/integrations/{id}:
 *   get:
 *     summary: Get integration by ID
 *     tags: [Integrations]
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
 *         description: Integration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Integration'
 *                     - type: object
 *                       properties:
 *                         campaigns:
 *                           type: array
 *                           items:
 *                             type: object
 *       404:
 *         description: Integration not found
 */
router.get('/:id', IntegrationsController.getIntegrationById);

/**
 * @swagger
 * /api/integrations/{id}:
 *   put:
 *     summary: Update integration
 *     tags: [Integrations]
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
 *               credentials:
 *                 type: object
 *               config:
 *                 type: object
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *               syncEnabled:
 *                 type: boolean
 *               syncFrequency:
 *                 type: string
 *                 enum: [REAL_TIME, EVERY_5_MINUTES, EVERY_15_MINUTES, HOURLY, DAILY]
 *     responses:
 *       200:
 *         description: Integration updated successfully
 *       400:
 *         description: Validation error or connection test failed
 *       404:
 *         description: Integration not found
 */
router.put('/:id', validate(updateIntegrationSchema), IntegrationsController.updateIntegration);

/**
 * @swagger
 * /api/integrations/{id}:
 *   delete:
 *     summary: Delete integration
 *     tags: [Integrations]
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
 *         description: Integration deleted successfully
 *       400:
 *         description: Cannot delete integration with associated campaigns
 *       404:
 *         description: Integration not found
 */
router.delete('/:id', IntegrationsController.deleteIntegration);

/**
 * @swagger
 * /api/integrations/{id}/test:
 *   post:
 *     summary: Test integration connection
 *     tags: [Integrations]
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
 *         description: Connection test completed
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
 *                     connected:
 *                       type: boolean
 *                     message:
 *                       type: string
 *                     details:
 *                       type: object
 *       404:
 *         description: Integration not found
 */
router.post('/:id/test', IntegrationsController.testConnection);

/**
 * @swagger
 * /api/integrations/{id}/sync:
 *   post:
 *     summary: Manually sync integration data
 *     tags: [Integrations]
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
 *         description: Sync completed successfully
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
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     platform:
 *                       type: string
 *                     recordsProcessed:
 *                       type: number
 *                     duration:
 *                       type: number
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Sync is disabled for this integration
 *       404:
 *         description: Integration not found
 */
router.post('/:id/sync', IntegrationsController.syncIntegration);

/**
 * @swagger
 * /api/integrations/{id}/sync-history:
 *   get:
 *     summary: Get integration sync history
 *     tags: [Integrations]
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
 *         description: Sync history retrieved successfully
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
 *                     lastSyncAt:
 *                       type: string
 *                       format: date-time
 *                     nextSyncAt:
 *                       type: string
 *                       format: date-time
 *                     syncFrequency:
 *                       type: string
 *                     errorCount:
 *                       type: number
 *                     lastError:
 *                       type: string
 *                     status:
 *                       type: string
 *       404:
 *         description: Integration not found
 */
router.get('/:id/sync-history', IntegrationsController.getSyncHistory);

/**
 * @swagger
 * /api/integrations/{id}/status:
 *   patch:
 *     summary: Update integration status
 *     tags: [Integrations]
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
 *                 enum: [CONNECTED, PAUSED, ERROR]
 *     responses:
 *       200:
 *         description: Integration status updated successfully
 *       400:
 *         description: Invalid status
 *       404:
 *         description: Integration not found
 */
router.patch('/:id/status', IntegrationsController.updateIntegrationStatus);

// Platform configuration routes

/**
 * @swagger
 * /api/integrations/platforms:
 *   get:
 *     summary: Get supported platforms
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Supported platforms retrieved successfully
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
 *                       platform:
 *                         type: string
 *                       name:
 *                         type: string
 *                       isRequired:
 *                         type: boolean
 *                       hasOAuth:
 *                         type: boolean
 *                       documentation:
 *                         type: object
 */
router.get('/platforms', IntegrationsController.getSupportedPlatforms);

/**
 * @swagger
 * /api/integrations/platforms/{platform}/config:
 *   get:
 *     summary: Get platform configuration requirements
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: platform
 *         required: true
 *         schema:
 *           type: string
 *           enum: [GOOGLE_ADS, FACEBOOK_ADS, INSTAGRAM_ADS, TIKTOK_ADS, LINKEDIN_ADS, TWITTER_ADS, YOUTUBE_ADS, PINTEREST_ADS, SNAPCHAT_ADS]
 *     responses:
 *       200:
 *         description: Platform configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PlatformConfig'
 *       404:
 *         description: Platform not supported
 */
router.get('/platforms/:platform/config', IntegrationsController.getPlatformConfig);

/**
 * @swagger
 * /api/integrations/test-credentials:
 *   post:
 *     summary: Test credentials before saving
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - platform
 *               - credentials
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [GOOGLE_ADS, FACEBOOK_ADS, INSTAGRAM_ADS, TIKTOK_ADS, LINKEDIN_ADS, TWITTER_ADS, YOUTUBE_ADS, PINTEREST_ADS, SNAPCHAT_ADS]
 *               credentials:
 *                 type: object
 *                 description: Platform-specific credentials to test
 *     responses:
 *       200:
 *         description: Credentials test completed
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
 *                     connected:
 *                       type: boolean
 *                     message:
 *                       type: string
 *                     details:
 *                       type: object
 *       400:
 *         description: Invalid credentials format
 */
router.post('/test-credentials', validate(testCredentialsSchema), IntegrationsController.testCredentials);

export default router;