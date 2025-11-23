import { Queue, Worker } from 'bullmq';
import { config } from '../config/env';
import { createDonation } from '../services/donationService';
import { ProcessedDonation } from '../types/DonationTypes';
import { logger } from '../utils/logger';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

export const donationQueue = new Queue<ProcessedDonation>('donations', {
  connection,
});

export const donationWorker = new Worker<ProcessedDonation>(
  'donations',
  async (job) => {
    const donation = job.data;
    logger.info(`Processing donation queue job: ${donation.txHash}`);

    const result = await createDonation(donation);

    if (!result) {
      throw new Error('Failed to create donation');
    }

    logger.info(`Donation queue job completed: ${result.id}`);
    return result;
  },
  {
    connection,
    concurrency: 5,
  }
);

donationWorker.on('completed', (job) => {
  logger.info(`Donation job ${job.id} completed`);
});

donationWorker.on('failed', (job, err) => {
  logger.error(`Donation job ${job?.id} failed:`, err);
});

export async function addDonationToQueue(donation: ProcessedDonation): Promise<void> {
  await donationQueue.add('process-donation', donation, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  });
}

