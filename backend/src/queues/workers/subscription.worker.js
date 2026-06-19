'use strict';

/**
 * BullMQ subscription worker — processes subscription expiry checks
 * and downgrades expired paid subscriptions to free tier.
 *
 * Task 10.2
 * Requirements: 3.8
 */

import { Worker } from 'bullmq';
import { redisConnection } from '../../config/redis.js';
import { downgradeExpiredSubscriptions } from '../../modules/subscriptions/subscriptions.service.js';

async function processJob(job) {
  switch (job.name) {
    case 'expiry_check': {
      const result = await downgradeExpiredSubscriptions();
      console.info(`[subscription.worker] Expiry check complete: ${result.downgraded} subscriptions downgraded`);
      return result;
    }

    default:
      throw new Error(`Unsupported subscription job type: ${job.name}`);
  }
}

export function startSubscriptionWorker() {
  const worker = new Worker('subscription', processJob, {
    connection: redisConnection,
    concurrency: 1,
  });

  worker.on('completed', (job) => {
    console.info(`[subscription.worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[subscription.worker] Job ${job?.id} failed:`, err?.message || err);
  });

  worker.on('error', (err) => {
    console.error('[subscription.worker] Worker error:', err.message);
  });

  return worker;
}

if (process.env.START_SUBSCRIPTION_WORKER === 'true') {
  startSubscriptionWorker();
  console.info('[subscription.worker] Subscription worker started');
}
