'use strict';

/**
 * BullMQ subscription queue — expiry check and downgrade jobs.
 *
 * Task 10.2
 * Requirements: 3.8
 */

import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { config } from '../config/index.js';

let _subscriptionQueue = null;

function getSubscriptionQueue() {
  if (!_subscriptionQueue) {
    _subscriptionQueue = new Queue('subscription', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    });

    _subscriptionQueue.on('error', (err) => {
      console.error('[subscription.queue] Queue error:', err.message);
    });
  }

  return _subscriptionQueue;
}

/**
 * Enqueue a subscription expiry check job.
 */
export async function enqueueSubscriptionExpiryCheck() {
  const queue = getSubscriptionQueue();
  const job = await queue.add(
    'expiry_check',
    { checkedAt: new Date().toISOString() },
    {
      jobId: `expiry_check:${Date.now()}`,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  );

  console.info('[subscription.queue] Enqueued expiry check job:', job.id);
  return job;
}

export async function closeSubscriptionQueue() {
  if (_subscriptionQueue) {
    await _subscriptionQueue.close();
    _subscriptionQueue = null;
  }
}
