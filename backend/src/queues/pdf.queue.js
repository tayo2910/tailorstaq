'use strict';

/**
 * BullMQ PDF generation queue.
 *
 * Task 9.1 — implements the real Queue instance and the enqueueReceiptGenerationJob helper.
 *
 * The queue name is read from config so it matches the worker subscription.
 * Requirements: 6.1, 6.2, 6.3, 6.7, 6.8
 */

import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { config } from '../config/index.js';

// ─── Queue instance ───────────────────────────────────────────────────────────

/**
 * Lazily-created BullMQ Queue instance for PDF generation jobs.
 * Creation is deferred to first use so that modules can be imported in test
 * environments without needing a live Redis connection.
 */
let _pdfQueue = null;

/**
 * Returns the singleton pdf-generation Queue, creating it on first call.
 *
 * @returns {import('bullmq').Queue}
 */
function getPdfQueue() {
  if (!_pdfQueue) {
    _pdfQueue = new Queue(config.queues.pdf, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000, // 1 s, 4 s, 16 s
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });

    _pdfQueue.on('error', (err) => {
      console.error('[pdf.queue] Queue error:', err.message);
    });
  }

  return _pdfQueue;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Enqueue a receipt PDF generation job.
 *
 * Triggered when an order status is set to "completed" (Requirement 6.1).
 * The PDF worker (task 9.1) consumes this job, generates the receipt PDF,
 * uploads it to the object store, and enqueues a receipt email job.
 *
 * @param {{
 *   orderId: string,
 *   tenantId: string,
 *   shopId: string,
 *   customerId: string,
 *   reference: string,
 * }} data
 * @returns {Promise<import('bullmq').Job>}
 */
export async function enqueueReceiptGenerationJob(data) {
  const queue = getPdfQueue();
  const job = await queue.add('generate-receipt', data, {
    jobId: `receipt:${data.orderId}`, // idempotent — prevents duplicate generation
  });

  console.info('[pdf.queue] Enqueued receipt generation job:', {
    jobId: job.id,
    orderId: data.orderId,
    tenantId: data.tenantId,
    reference: data.reference,
  });

  return job;
}

/**
 * Gracefully close the queue connection.
 * Call this during application shutdown.
 *
 * @returns {Promise<void>}
 */
export async function closePdfQueue() {
  if (_pdfQueue) {
    await _pdfQueue.close();
    _pdfQueue = null;
  }
}
