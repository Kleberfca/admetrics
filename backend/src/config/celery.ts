import Bull from 'bull';
import { logger } from '../utils/logger';

// Create queues
export const campaignSyncQueue = new Bull('campaign-sync', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
});

export const reportGenerationQueue = new Bull('report-generation', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
});

export const aiTrainingQueue = new Bull('ai-training', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
});

// Global error handler for queues
const handleQueueError = (error: Error, queue: string) => {
  logger.error(`Queue ${queue} error:`, error);
};

// Set up error handlers
campaignSyncQueue.on('error', (error) => handleQueueError(error, 'campaign-sync'));
reportGenerationQueue.on('error', (error) => handleQueueError(error, 'report-generation'));
aiTrainingQueue.on('error', (error) => handleQueueError(error, 'ai-training'));

// Queue event handlers
campaignSyncQueue.on('completed', (job) => {
  logger.info(`Campaign sync job ${job.id} completed`);
});

reportGenerationQueue.on('completed', (job) => {
  logger.info(`Report generation job ${job.id} completed`);
});

aiTrainingQueue.on('completed', (job) => {
  logger.info(`AI training job ${job.id} completed`);
});