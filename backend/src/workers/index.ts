import { campaignSyncQueue, reportGenerationQueue, aiTrainingQueue } from '../config/celery';
import { CampaignSyncWorker } from './campaign-sync.worker';
import { ReportGenerationWorker } from './report-generation.worker';
import { AITrainingWorker } from './ai-training.worker';
import { logger } from '../utils/logger';

// Initialize workers
const campaignSyncWorker = new CampaignSyncWorker();
const reportGenerationWorker = new ReportGenerationWorker();
const aiTrainingWorker = new AITrainingWorker();

// Process campaign sync jobs
campaignSyncQueue.process(async (job) => {
  logger.info(`Processing campaign sync job ${job.id}`);
  return await campaignSyncWorker.process(job.data);
});

// Process report generation jobs
reportGenerationQueue.process(async (job) => {
  logger.info(`Processing report generation job ${job.id}`);
  return await reportGenerationWorker.process(job.data);
});

// Process AI training jobs
aiTrainingQueue.process(async (job) => {
  logger.info(`Processing AI training job ${job.id}`);
  return await aiTrainingWorker.process(job.data);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing queues...');
  
  await Promise.all([
    campaignSyncQueue.close(),
    reportGenerationQueue.close(),
    aiTrainingQueue.close(),
  ]);
  
  process.exit(0);
});

logger.info('Workers initialized and listening for jobs');