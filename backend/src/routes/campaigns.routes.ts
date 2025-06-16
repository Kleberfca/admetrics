import { Router } from 'express';
import { CampaignController } from '../controllers/campaign.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createCampaignSchema = z.object({
  body: z.object({
    integrationId: z.string().uuid(),
    name: z.string().min(1).max(255),
    status: z.enum(['ACTIVE', 'PAUSED', 'DRAFT']).optional(),
    objective: z.string().optional(),
    budget: z.number().positive().optional(),
    budgetType: z.enum(['DAILY', 'LIFETIME']).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    targeting: z.object({}).optional(),
    geoTargeting: z.object({}).optional()
  })
});

const updateCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'DRAFT']).optional(),
    budget: z.number().positive().optional(),
    budgetType: z.enum(['DAILY', 'LIFETIME']).optional(),
    endDate: z.string().datetime().optional(),
    targeting: z.object({}).optional()
  })
});

const listCampaignsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    platform: z.string().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
  })
});

// All routes require authentication
router.use(authenticate);

// List campaigns
router.get('/', validateRequest(listCampaignsSchema), CampaignController.listCampaigns);

// Get campaign by ID
router.get('/:id', CampaignController.getCampaignById);

// Create campaign
router.post('/', validateRequest(createCampaignSchema), CampaignController.createCampaign);

// Update campaign
router.patch('/:id', validateRequest(updateCampaignSchema), CampaignController.updateCampaign);

// Delete campaign
router.delete('/:id', authorize('ADMIN', 'USER'), CampaignController.deleteCampaign);

// Campaign actions
router.post('/:id/pause', CampaignController.pauseCampaign);
router.post('/:id/resume', CampaignController.resumeCampaign);
router.post('/:id/duplicate', CampaignController.duplicateCampaign);

// Bulk operations
router.post('/bulk/pause', CampaignController.bulkPauseCampaigns);
router.post('/bulk/resume', CampaignController.bulkResumeCampaigns);
router.post('/bulk/delete', authorize('ADMIN', 'USER'), CampaignController.bulkDeleteCampaigns);

// Campaign insights
router.get('/:id/insights', CampaignController.getCampaignInsights);
router.get('/:id/performance', CampaignController.getCampaignPerformance);

export default router;