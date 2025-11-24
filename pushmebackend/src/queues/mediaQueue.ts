import { Queue, Worker } from 'bullmq';
import { config } from '../config/env';
import { processMedia, uploadProcessedMedia, ProcessedMedia } from '../services/mediaService';
import { DonationType } from '../types/DonationTypes';
import { logger } from '../utils/logger';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

interface MediaJobData {
  fileBuffer: Buffer;
  fileName: string;
  type: DonationType;
}

export const mediaQueue = new Queue<MediaJobData>('media', {
  connection,
});

export const mediaWorker = new Worker<MediaJobData>(
  'media',
  async (job) => {
    const { fileBuffer, fileName, type } = job.data;
    logger.info(`Processing media queue job: ${fileName}, type: ${type}`);

    // Process media
    const processed = await processMedia(fileBuffer, fileName, type);

    if (!processed) {
      throw new Error('Failed to process media');
    }

    // Upload to storage
    const url = await uploadProcessedMedia(processed, type);

    if (!url) {
      throw new Error('Failed to upload media');
    }

    logger.info(`Media queue job completed: ${url}`);
    return { url, metadata: processed.metadata };
  },
  {
    connection,
    concurrency: 2, // Lower concurrency for CPU-intensive media processing
  }
);

mediaWorker.on('completed', (job) => {
  logger.info(`Media job ${job.id} completed`);
});

mediaWorker.on('failed', (job, err) => {
  logger.error(`Media job ${job?.id} failed:`, err);
});

export async function addMediaToQueue(
  fileBuffer: Buffer,
  fileName: string,
  type: DonationType
): Promise<{ jobId: string; promise: Promise<{ url: string; metadata: any }> }> {
  const job = await mediaQueue.add('process-media', { fileBuffer, fileName, type }, {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  });

  // Create a promise that resolves when the job completes
  // Note: This is a workaround for BullMQ v5 API changes
  const promise = new Promise<{ url: string; metadata: any }>((resolve, reject) => {
    const checkJob = async () => {
      const jobState = await job.getState();
      if (jobState === 'completed') {
        const result = await job.returnvalue;
        resolve(result);
      } else if (jobState === 'failed') {
        reject(new Error('Job failed'));
      } else {
        setTimeout(checkJob, 500);
      }
    };
    checkJob();
  });

  return {
    jobId: job.id!,
    promise,
  };
}

