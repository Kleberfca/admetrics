import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { campaignsRoutes } from './campaigns.routes';
import { metricsRoutes } from './metrics.routes';
import { integrationsRoutes } from './integrations.routes';
import { reportsRoutes } from './reports.routes';
import { aiInsightsRoutes } from './ai-insights.routes';
import { usersRoutes } from './users.routes';
import { settingsRoutes } from './settings.routes';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.use('/auth', authRoutes);

// Protected routes
router.use('/campaigns', authenticate, campaignsRoutes);
router.use('/metrics', authenticate, metricsRoutes);
router.use('/integrations', authenticate, integrationsRoutes);
router.use('/reports', authenticate, reportsRoutes);
router.use('/ai-insights', authenticate, aiInsightsRoutes);
router.use('/users', authenticate, usersRoutes);
router.use('/settings', authenticate, settingsRoutes);

// API status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'AdMetrics API is running',
    timestamp: new Date().toISOString()
  });
});

export default router;