import { Queue, Worker } from 'bullmq';
import { config } from '../config/env';
import { OverlayEvent } from '../types/OverlayEventTypes';
import { emitToOverlay } from '../services/overlayEventService';
import { logger } from '../utils/logger';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

export const eventQueue = new Queue<OverlayEvent>('events', {
  connection,
});

export const eventWorker = new Worker<OverlayEvent>(
  'events',
  async (job) => {
    const event = job.data;
    logger.info(`Processing event queue job: ${event.event}`);

    emitToOverlay(event);

    logger.info(`Event queue job completed: ${event.event}`);
    return event;
  },
  {
    connection,
    concurrency: 10, // High concurrency for fast event broadcasting
  }
);

eventWorker.on('completed', (job) => {
  logger.info(`Event job ${job.id} completed`);
});

eventWorker.on('failed', (job, err) => {
  logger.error(`Event job ${job?.id} failed:`, err);
});

export async function addEventToQueue(event: OverlayEvent): Promise<void> {
  await eventQueue.add('broadcast-event', event, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });
}

