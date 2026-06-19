'use strict';

import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { config } from '../../config/index.js';
import { redisConnection } from '../../config/redis.js';
import { pool } from '../../config/db.js';
import { queryTenant } from '../../db/queries/base.js';
import {
  buildVerificationEmail,
  buildAccountLockedEmail,
  buildTenantConfirmationEmail,
  buildTenantApprovalEmail,
  buildTenantRejectionEmail,
  buildOrderConfirmationEmail,
  buildOrderStatusEmail,
  buildReceiptEmail,
  buildSubscriptionConfirmationEmail,
  buildSubscriptionDowngradeEmail,
  buildTenantSuspensionEmail,
  buildTenantReactivationEmail,
} from '../../modules/notifications/notifications.service.js';
import { updateReceiptEmailStatus } from '../../modules/receipts/receipts.service.js';

function createTransporter() {
  const transportOptions = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
  };

  if (config.smtp.user && config.smtp.password) {
    transportOptions.auth = {
      user: config.smtp.user,
      pass: config.smtp.password,
    };
  }

  return nodemailer.createTransport(transportOptions);
}

async function recordNotificationFailure(job, errorMessage) {
  try {
    await pool.query(
      `INSERT INTO notification_failures (job_name, job_data, error_message)
       VALUES ($1, $2, $3)`,
      [job.name, JSON.stringify(job.data), errorMessage],
    );

    if (job.name === 'receipt' && job.data?.receiptId) {
      try {
        await updateReceiptEmailStatus(job.data.receiptId, false, errorMessage);
      } catch (statusErr) {
        console.error('[email.worker] Could not update receipt email status after failure:', statusErr.message);
      }
    }
  } catch (err) {
    console.error('[email.worker] Could not persist notification failure:', err.message);
  }
}

async function fetchPdf(url) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch PDF from object store: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function loadOrderNotificationData(orderId, tenantId) {
  const result = await queryTenant(
    `SELECT
       o.reference,
       u.full_name AS customer_name,
       u.email AS customer_email,
       s.name AS shop_name,
       s.contact_email AS shop_contact_email
     FROM orders o
     JOIN users u ON u.id = o.customer_id
     JOIN shops s ON s.id = o.shop_id
     WHERE o.id = $1`,
    [orderId],
    tenantId,
  );

  if (result.rows.length === 0) {
    throw new Error(`Order data not found for notification: orderId=${orderId}`);
  }

  return result.rows[0];
}

async function processJob(job) {
  let payload;
  const attachments = [];

  switch (job.name) {
    case 'verification':
      payload = buildVerificationEmail(job.data);
      break;

    case 'account_locked':
      payload = buildAccountLockedEmail(job.data);
      break;

    case 'tenant_confirmation':
      payload = buildTenantConfirmationEmail(job.data);
      break;

    case 'tenant_approval':
      payload = buildTenantApprovalEmail(job.data);
      break;

    case 'tenant_rejection':
      payload = buildTenantRejectionEmail(job.data);
      break;

    case 'order_confirmation': {
      const orderData = await loadOrderNotificationData(job.data.orderId, job.data.tenantId);
      payload = buildOrderConfirmationEmail({
        orderId: job.data.orderId,
        customerEmail: orderData.customer_email,
        customerName: orderData.customer_name,
        reference: orderData.reference,
        shopName: orderData.shop_name,
        shopContactEmail: orderData.shop_contact_email,
      });
      break;
    }

    case 'order_status': {
      const orderData = await loadOrderNotificationData(job.data.orderId, job.data.tenantId);
      payload = buildOrderStatusEmail({
        orderId: job.data.orderId,
        customerEmail: orderData.customer_email,
        customerName: orderData.customer_name,
        reference: orderData.reference,
        shopName: orderData.shop_name,
        shopContactEmail: orderData.shop_contact_email,
        newStatus: job.data.newStatus,
      });
      break;
    }

    case 'receipt': {
      payload = buildReceiptEmail(job.data);
      const pdfBuffer = await fetchPdf(job.data.pdfUrl);
      attachments.push({
        filename: `receipt-${job.data.receiptId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
      break;
    }

    case 'subscription_confirmation':
      payload = buildSubscriptionConfirmationEmail(job.data);
      break;

    case 'subscription_downgrade':
      payload = buildSubscriptionDowngradeEmail(job.data);
      break;

    case 'tenant_suspension':
      payload = buildTenantSuspensionEmail(job.data);
      break;

    case 'tenant_reactivation':
      payload = buildTenantReactivationEmail(job.data);
      break;

    default:
      throw new Error(`Unsupported email job type: ${job.name}`);
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `${config.smtp.fromName} <${config.smtp.fromEmail}>`,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    attachments,
  });

  if (job.name === 'receipt' && job.data?.receiptId) {
    try {
      await updateReceiptEmailStatus(job.data.receiptId, true, null);
    } catch (statusErr) {
      console.error('[email.worker] Could not update receipt email status after success:', statusErr.message);
    }
  }
}

export function startEmailWorker() {
  const worker = new Worker(config.queues.email, processJob, {
    connection: redisConnection,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    console.info(`[email.worker] Job ${job.id} completed`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[email.worker] Job ${job?.id} failed:`, err?.message || err);

    const attempts = job?.opts?.attempts ?? 0;
    const attemptsMade = job?.attemptsMade ?? 0;

    if (attemptsMade >= attempts) {
      await recordNotificationFailure(job, err?.message || String(err));
    }
  });

  worker.on('error', (err) => {
    console.error('[email.worker] Worker error:', err.message);
  });

  return worker;
}

if (process.env.START_EMAIL_WORKER === 'true') {
  startEmailWorker();
  console.info('[email.worker] Email worker started');
}
