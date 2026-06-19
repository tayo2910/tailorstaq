'use strict';

/**
 * BullMQ email queue definition.
 *
 * This module exposes helpers for enqueueing notification jobs.
 * The email worker consumes these jobs and dispatches them via Nodemailer.
 */

import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { config } from '../config/index.js';

let _emailQueue = null;

function getEmailQueue() {
  if (!_emailQueue) {
    _emailQueue = new Queue(config.queues.email, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });

    _emailQueue.on('error', (err) => {
      console.error('[email.queue] Queue error:', err.message);
    });
  }

  return _emailQueue;
}

async function enqueueEmailJob(name, data, jobId) {
  const queue = getEmailQueue();
  const job = await queue.add(name, data, {
    jobId,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  });

  console.info('[email.queue] Enqueued job:', {
    jobId: job.id,
    name,
    data: { ...data, orderId: data.orderId ?? undefined, reference: data.reference ?? undefined },
  });

  return job;
}

export async function enqueueVerificationEmail(data) {
  await enqueueEmailJob('verification', data, `verification:${data.userId}`);
}

export async function enqueueAccountLockedEmail(data) {
  await enqueueEmailJob('account_locked', data, `account_locked:${data.userId}`);
}

export async function enqueueTenantConfirmationEmail(data) {
  await enqueueEmailJob('tenant_confirmation', data, `tenant_confirmation:${data.requestId}`);
}

export async function enqueueTenantApprovalEmail(data) {
  await enqueueEmailJob('tenant_approval', data, `tenant_approval:${data.tenantId}`);
}

export async function enqueueTenantRejectionEmail(data) {
  await enqueueEmailJob('tenant_rejection', data, `tenant_rejection:${data.requestId}`);
}

export async function enqueueOrderConfirmationEmail(data) {
  await enqueueEmailJob('order_confirmation', data, `order_confirmation:${data.orderId}`);
}

export async function enqueueOrderStatusEmail(data) {
  await enqueueEmailJob('order_status', data, `order_status:${data.orderId}:${data.newStatus}`);
}

export async function enqueueReceiptEmail(data) {
  await enqueueEmailJob('receipt', data, `receipt:${data.receiptId}`);
}

export async function enqueueSubscriptionConfirmationEmail(data) {
  await enqueueEmailJob('subscription_confirmation', data, `subscription_confirmation:${data.tenantId}`);
}

export async function enqueueSubscriptionDowngradeEmail(data) {
  await enqueueEmailJob('subscription_downgrade', data, `subscription_downgrade:${data.tenantId}:${data.reason}`);
}

export async function enqueueTenantSuspensionEmail(data) {
  await enqueueEmailJob('tenant_suspension', data, `tenant_suspension:${data.tenantId}`);
}

export async function enqueueTenantReactivationEmail(data) {
  await enqueueEmailJob('tenant_reactivation', data, `tenant_reactivation:${data.tenantId}`);
}

export async function closeEmailQueue() {
  if (_emailQueue) {
    await _emailQueue.close();
    _emailQueue = null;
  }
}
