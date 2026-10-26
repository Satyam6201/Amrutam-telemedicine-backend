import { Queue } from 'bullmq';
import config from './index.js';
import logger from '../src/utils/logger.js';

export const queueConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  maxRetriesPerRequest: null,
};

export const NOTIFICATION_QUEUE = 'amrutam_notifications';
export const SLOT_EXPIRATION_QUEUE = 'amrutam_slot_expirations';
export const ANALYTICS_QUEUE = 'amrutam_analytics';

export const notificationQueue = new Queue(NOTIFICATION_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const slotExpirationQueue = new Queue(SLOT_EXPIRATION_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 1000,
    },
    removeOnComplete: 500,
    removeOnFail: 2000,
  },
});

export const analyticsQueue = new Queue(ANALYTICS_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

logger.info('BullMQ Queues initialized (Notifications, Slot Expirations, Analytics)');

export async function closeQueues() {
  await Promise.all([
    notificationQueue.close().catch(() => {}),
    slotExpirationQueue.close().catch(() => {}),
    analyticsQueue.close().catch(() => {}),
  ]);
}

export default {
  notificationQueue,
  slotExpirationQueue,
  analyticsQueue,
  closeQueues,
};

