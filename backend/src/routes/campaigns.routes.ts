import { Router } from 'express';
import { CampaignsController } from '../controllers/campaigns.controller';
import { validate } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Campaign name is required'),
    platform: z.enum(['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS']),
    integrationId: z.string().uuid('Invalid integration ID'),
    objective: z.string().optional(),
    budget: z.number().positive().optional(),
    budgetType: z.enum(['DAILY', 'LIFETIME']).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    targeting: z.any().optional()
  })
});

const updateCampaignSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID')
  }),
  body: createCampaignSchema.shape.body.partial()
});

const campaignIdSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID')
  })
});

const getCampaignsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    platforms: z.string().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
  })
});

const campaignMetricsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID')
  }),
  query: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    granularity: z.enum(['hour', 'day', 'week', 'month']).optional()
  })
});

// Routes
router.get('/', validate(getCampaignsSchema), CampaignsController.getCampaigns);
router.get('/:id', validate(campaignIdSchema), CampaignsController.getCampaignById);
router.post('/', validate(createCampaignSchema), CampaignsController.createCampaign);
router.put('/:id', validate(updateCampaignSchema), CampaignsController.updateCampaign);
router.delete('/:id', validate(campaignIdSchema), CampaignsController.deleteCampaign);

// Campaign actions
router.post('/:id/pause', validate(campaignIdSchema), CampaignsController.pauseCampaign);
router.post('/:id/resume', validate(campaignIdSchema), CampaignsController.resumeCampaign);
router.post('/:id/sync', validate(campaignIdSchema), CampaignsController.syncCampaign);

// Campaign metrics
router.get('/:id/metrics', validate(campaignMetricsSchema), CampaignsController.getCampaignMetrics);
router.get('/:id/insights', validate(campaignIdSchema), CampaignsController.getCampaignInsights);

export { router as campaignsRoutes };