import { Router } from 'express';
import { IntegrationsController } from '../controllers/integrations.controller';
import { validate } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createIntegrationSchema = z.object({
  body: z.object({
    platform: z.enum(['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS']),
    name: z.string().min(1, 'Integration name is required').max(100),
    credentials: z.record(z.any()),
    config: z.record(z.any()).optional(),
    scopes: z.array(z.string()).optional(),
    syncEnabled: z.boolean().optional().default(true),
    syncFrequency: z.enum(['REAL_TIME', 'EVERY_5_MINUTES', 'EVERY_15_MINUTES', 'HOURLY', 'DAILY']).optional().default('HOURLY')
  })
});

const updateIntegrationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid integration ID')
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    credentials: z.record(z.any()).optional(),
    config: z.record(z.any()).optional(),
    scopes: z.array(z.string()).optional(),
    syncEnabled: z.boolean().optional(),
    syncFrequency: z.enum(['REAL_TIME', 'EVERY_5_MINUTES', 'EVERY_15_MINUTES', 'HOURLY', 'DAILY']).optional()
  })
});

const integrationIdSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid integration ID')
  })
});

const testConnectionSchema = z.object({
  body: z.object({
    platform: z.enum(['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS']),
    credentials: z.record(z.any())
  })
});

const syncLogsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid integration ID')
  }),
  query: z.object({
    limit: z.string().optional().transform(val => val ? parseInt(val) : 20)
  })
});

// Routes
router.get('/', IntegrationsController.getIntegrations);
router.get('/platforms', IntegrationsController.getAvailablePlatforms);
router.get('/:id', validate(integrationIdSchema), IntegrationsController.getIntegrationById);
router.post('/', validate(createIntegrationSchema), IntegrationsController.createIntegration);
router.put('/:id', validate(updateIntegrationSchema), IntegrationsController.updateIntegration);
router.delete('/:id', validate(integrationIdSchema), IntegrationsController.deleteIntegration);

// Integration actions
router.post('/test-connection', validate(testConnectionSchema), IntegrationsController.testConnection);
router.post('/:id/sync', validate(integrationIdSchema), IntegrationsController.syncIntegration);
router.get('/:id/sync-logs', validate(syncLogsSchema), IntegrationsController.getSyncLogs);

export { router as integrationsRoutes };