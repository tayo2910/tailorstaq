'use strict';

/**
 * Receipts service — data access helpers for receipt creation and retrieval.
 *
 * Task 9.1: receipt row management (create, update pdf_url)
 * Task 9.2: receipt download endpoint (getReceiptForCustomer)
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8
 */

import { query, queryTenant } from '../../db/queries/base.js';

// ─── Receipt DB helpers ───────────────────────────────────────────────────────

/**
 * Fetch all data needed to generate a receipt PDF for a completed order.
 *
 * Joins orders, shops, products, and users tables to gather every field
 * required by Requirements 6.2 and 6.3.
 *
 * @param {string} orderId   — UUID of the completed order
 * @param {string} tenantId  — UUID of the owning tenant (for RLS)
 * @returns {Promise<object>} Receipt data or null if not found
 */
export async function getReceiptData(orderId, tenantId) {
  const result = await queryTenant(
    `SELECT
       o.id                 AS order_id,
       o.reference,
       o.quantity,
       o.unit_price,
       (o.quantity * o.unit_price) AS line_total,
       (o.quantity * o.unit_price) AS order_total,
       o.updated_at         AS completion_date,
       o.customer_id,
       o.tenant_id,
       o.shop_id,
       s.name               AS shop_name,
       s.logo_url           AS shop_logo_url,
       s.address            AS shop_address,
       s.phone              AS shop_phone,
       s.contact_email      AS shop_contact_email,
       p.name               AS product_name,
       p.price              AS product_price,
       u.full_name          AS customer_name,
       u.email              AS customer_email
     FROM orders o
     JOIN shops    s ON s.id = o.shop_id
     JOIN products p ON p.id = o.product_id
     JOIN users    u ON u.id = o.customer_id
     WHERE o.id = $1`,
    [orderId],
    tenantId,
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Create a new receipts row for a completed order.
 *
 * Called before PDF generation begins so that the receipt record exists
 * and can be updated with the pdf_url once generation is complete.
 *
 * If a receipt row already exists for the order (idempotent retry), returns
 * the existing row without error.
 *
 * @param {string} orderId   — UUID of the completed order
 * @param {string} tenantId  — UUID of the owning tenant
 * @returns {Promise<{ id: string, order_id: string, tenant_id: string, pdf_url: string|null, email_sent: boolean }>}
 */
export async function createReceiptRow(orderId, tenantId) {
  // Use INSERT … ON CONFLICT DO NOTHING to handle idempotent retries.
  // Then SELECT to return the existing or newly-created row.
  await query(
    `INSERT INTO receipts (order_id, tenant_id, generated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (order_id) DO NOTHING`,
    [orderId, tenantId],
  );

  const result = await query(
    `SELECT id, order_id, tenant_id, pdf_url, email_sent, email_error, generated_at
     FROM receipts
     WHERE order_id = $1`,
    [orderId],
  );

  return result.rows[0];
}

/**
 * Update a receipts row with the generated PDF URL.
 *
 * @param {string} receiptId  — UUID of the receipt row
 * @param {string} pdfUrl     — public URL returned by the object store upload
 * @returns {Promise<object>} Updated receipt row
 */
export async function updateReceiptPdfUrl(receiptId, pdfUrl) {
  const result = await query(
    `UPDATE receipts
     SET pdf_url = $1
     WHERE id = $2
     RETURNING id, order_id, tenant_id, pdf_url, email_sent, email_error, generated_at`,
    [pdfUrl, receiptId],
  );

  return result.rows[0];
}

/**
 * Update a receipts row with the email delivery outcome.
 *
 * @param {string}  receiptId    — UUID of the receipt row
 * @param {boolean} emailSent    — true if email was delivered
 * @param {string|null} emailError — error message if delivery failed, null on success
 * @returns {Promise<object>} Updated receipt row
 */
export async function updateReceiptEmailStatus(receiptId, emailSent, emailError = null) {
  const result = await query(
    `UPDATE receipts
     SET email_sent = $1, email_error = $2
     WHERE id = $3
     RETURNING id, order_id, tenant_id, pdf_url, email_sent, email_error, generated_at`,
    [emailSent, emailError, receiptId],
  );

  return result.rows[0];
}

/**
 * Fetch a receipt row for a given order, scoped to the authenticated customer.
 *
 * Used by the download endpoint (task 9.2) to return the pdf_url or 404.
 *
 * @param {string} orderId     — UUID of the order
 * @param {string} customerId  — UUID of the authenticated customer
 * @returns {Promise<object|null>} Receipt row or null
 */
export async function getReceiptForCustomer(orderId, customerId) {
  // First confirm the order belongs to this customer
  const orderCheck = await query(
    `SELECT id FROM orders WHERE id = $1 AND customer_id = $2`,
    [orderId, customerId],
  );

  if (orderCheck.rows.length === 0) {
    return null;
  }

  const result = await query(
    `SELECT r.id, r.order_id, r.tenant_id, r.pdf_url, r.email_sent, r.email_error, r.generated_at
     FROM receipts r
     WHERE r.order_id = $1`,
    [orderId],
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}
