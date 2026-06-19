'use strict';

/**
 * BullMQ PDF generation worker — consumes the `pdf-generation` queue.
 *
 * Task 9.1
 * Requirements: 6.1, 6.2, 6.3, 6.7, 6.8
 *
 * Job flow per job:
 *  1. Create (or retrieve) the receipts DB row for the order.
 *  2. Fetch all order data required for the receipt (shop, product, customer).
 *  3. Build the receipt PDF using PDFKit:
 *     - Shop logo (or TAILORSTAQ placeholder if not set — Req 6.7)
 *     - Shop name, address, phone, contact email (or "not provided" — Req 6.8)
 *     - Order reference, customer name, product name, quantity,
 *       unit price, line total, order total, completion date (Req 6.3)
 *  4. Upload the PDF buffer to the object store.
 *  5. Update receipts.pdf_url with the returned URL.
 *  6. Enqueue the receipt email job (Req 6.4).
 */

import { Worker } from 'bullmq';
import PDFDocument from 'pdfkit';
import { config } from '../../config/index.js';
import { redisConnection } from '../../config/redis.js';
import { getReceiptData, createReceiptRow, updateReceiptPdfUrl } from '../../modules/receipts/receipts.service.js';
import { uploadFile, buildKey } from '../../utils/storage.js';
import { enqueueReceiptEmail } from '../email.queue.js';

// ─── PDF building ─────────────────────────────────────────────────────────────

/**
 * Format a monetary value as a string, e.g. "1250.00".
 *
 * @param {number|string} value
 * @returns {string}
 */
function formatMoney(value) {
  return parseFloat(value).toFixed(2);
}

/**
 * Format a UTC timestamp to a human-readable date string, e.g. "12 Jan 2025".
 *
 * @param {Date|string} date
 * @returns {string}
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Return the display value for an optional shop field.
 * If the value is null/undefined/empty, returns "Not provided".
 *
 * Requirement 6.8
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
function fieldOrNotProvided(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'Not provided';
  }
  return String(value).trim();
}

/**
 * Build a receipt PDF buffer from the receipt data row.
 *
 * Requirements: 6.2, 6.3, 6.7, 6.8
 *
 * @param {object}  data      — row returned by getReceiptData()
 * @param {object}  [options]
 * @param {boolean} [options.compress=true] — set false in tests to make text readable
 * @returns {Promise<Buffer>}
 */
export async function buildReceiptPdf(data, { compress = true } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4', compress });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header: TAILORSTAQ brand title ────────────────────────────────────────
    doc
      .fontSize(22)
      .fillColor('#1a2e4a') // dark blue brand colour
      .text('TAILORSTAQ', { align: 'center' })
      .fontSize(12)
      .fillColor('#6b3a1f') // chocolate brown brand colour
      .text('Receipt', { align: 'center' })
      .moveDown(1);

    // ── Shop logo or placeholder ──────────────────────────────────────────────
    // Requirement 6.7: substitute TAILORSTAQ placeholder when logo_url is missing
    if (data.shop_logo_url) {
      // Note: PDFKit can embed remote images if passed as a URL string.
      // In production the logo_url points to the object store, so PDFKit
      // will fetch it over HTTPS.  If the fetch fails we silently skip the logo.
      try {
        doc.image(data.shop_logo_url, { fit: [80, 80], align: 'center' }).moveDown(0.5);
      } catch {
        // Fall through — missing/unreadable logo is non-fatal
        doc
          .fontSize(10)
          .fillColor('#888888')
          .text('[Logo unavailable]', { align: 'center' })
          .moveDown(0.5);
      }
    } else {
      // Requirement 6.7: TAILORSTAQ placeholder text when no logo is set
      doc
        .fontSize(10)
        .fillColor('#888888')
        .text('[TAILORSTAQ – Shop Logo]', { align: 'center' })
        .moveDown(0.5);
    }

    // ── Shop details ──────────────────────────────────────────────────────────
    // Requirements: 6.2, 6.8 (missing fields → "Not provided")
    doc
      .fontSize(14)
      .fillColor('#000000')
      .text(data.shop_name, { align: 'left' })
      .fontSize(10)
      .fillColor('#333333');

    const shopAddress = fieldOrNotProvided(data.shop_address);
    const shopPhone = fieldOrNotProvided(data.shop_phone);
    const shopEmail = fieldOrNotProvided(data.shop_contact_email);

    doc
      .text(`Address: ${shopAddress}`)
      .text(`Phone:   ${shopPhone}`)
      .text(`Email:   ${shopEmail}`)
      .moveDown(1);

    // ── Horizontal rule ───────────────────────────────────────────────────────
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor('#cccccc')
      .stroke()
      .moveDown(0.5);

    // ── Receipt metadata ──────────────────────────────────────────────────────
    doc
      .fontSize(10)
      .fillColor('#333333')
      .text(`Order Reference: ${data.reference}`)
      .text(`Customer Name:   ${data.customer_name}`)
      .text(`Completion Date: ${formatDate(data.completion_date)}`)
      .moveDown(1);

    // ── Line items header ─────────────────────────────────────────────────────
    doc
      .fontSize(11)
      .fillColor('#1a2e4a')
      .text('Product', 50, doc.y, { continued: true, width: 200 })
      .text('Qty', 250, doc.y, { continued: true, width: 60 })
      .text('Unit Price', 310, doc.y, { continued: true, width: 100 })
      .text('Line Total', 410, doc.y, { width: 100 })
      .moveDown(0.3);

    // Thin underline for header
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor('#aaaaaa')
      .stroke()
      .moveDown(0.3);

    // ── Line items ────────────────────────────────────────────────────────────
    // Requirements: 6.3
    const lineTotal = parseFloat(data.quantity) * parseFloat(data.unit_price);

    doc
      .fontSize(10)
      .fillColor('#000000')
      .text(data.product_name, 50, doc.y, { continued: true, width: 200 })
      .text(String(data.quantity), 250, doc.y, { continued: true, width: 60 })
      .text(formatMoney(data.unit_price), 310, doc.y, { continued: true, width: 100 })
      .text(formatMoney(lineTotal), 410, doc.y, { width: 100 })
      .moveDown(1);

    // ── Order total ───────────────────────────────────────────────────────────
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor('#cccccc')
      .stroke()
      .moveDown(0.5);

    doc
      .fontSize(12)
      .fillColor('#1a2e4a')
      .text(`Order Total: £${formatMoney(lineTotal)}`, { align: 'right' })
      .moveDown(2);

    // ── Footer ────────────────────────────────────────────────────────────────
    doc
      .fontSize(8)
      .fillColor('#888888')
      .text('Thank you for your order. For enquiries contact your shop.', {
        align: 'center',
      });

    doc.end();
  });
}

// ─── Worker ───────────────────────────────────────────────────────────────────

/**
 * Process a single `generate-receipt` job from the pdf-generation queue.
 *
 * @param {import('bullmq').Job} job
 * @returns {Promise<void>}
 */
async function processJob(job) {
  const { orderId, tenantId, reference } = job.data;

  console.info(`[pdf.worker] Processing job ${job.id} — order ${reference}`);

  // 1. Create or retrieve the receipt row
  const receipt = await createReceiptRow(orderId, tenantId);

  // 2. Fetch all data needed to build the PDF
  const data = await getReceiptData(orderId, tenantId);

  if (!data) {
    throw new Error(
      `[pdf.worker] Order not found: orderId=${orderId}, tenantId=${tenantId}`,
    );
  }

  // 3. Build the PDF buffer
  const pdfBuffer = await buildReceiptPdf(data);

  // 4. Upload the PDF to the object store
  const key = buildKey('receipts', `${orderId}-${Date.now()}.pdf`);
  const pdfUrl = await uploadFile(pdfBuffer, key, 'application/pdf');

  console.info(`[pdf.worker] PDF uploaded: ${pdfUrl}`);

  // 5. Update receipts.pdf_url
  const updatedReceipt = await updateReceiptPdfUrl(receipt.id, pdfUrl);

  console.info(`[pdf.worker] Receipt row updated: receiptId=${updatedReceipt.id}`);

  // 6. Enqueue receipt email job (fire-and-forget within the worker)
  // Requirement 6.4: attempt to send the PDF to the customer's email
  await enqueueReceiptEmail({
    orderId,
    receiptId: updatedReceipt.id,
    tenantId,
    customerId: data.customer_id,
    customerEmail: data.customer_email,
    customerName: data.customer_name,
    reference: data.reference,
    shopName: data.shop_name,
    shopContactEmail: data.shop_contact_email || null,
    pdfUrl,
  });

  console.info(`[pdf.worker] Receipt email job enqueued for order ${reference}`);
}

// ─── Worker bootstrap ─────────────────────────────────────────────────────────

/**
 * Start the PDF generation worker.
 *
 * The worker is created lazily when this module is first imported so that
 * integration tests can control when the worker starts.
 *
 * @returns {import('bullmq').Worker}
 */
export function startPdfWorker() {
  const worker = new Worker(config.queues.pdf, processJob, {
    connection: redisConnection,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    console.info(`[pdf.worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[pdf.worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[pdf.worker] Worker error:', err.message);
  });

  return worker;
}

// Auto-start when this file is run directly (i.e. as a standalone worker process)
// In test environments this block is not reached because the file is imported.
if (process.env.START_PDF_WORKER === 'true') {
  startPdfWorker();
  console.info('[pdf.worker] PDF generation worker started');
}
