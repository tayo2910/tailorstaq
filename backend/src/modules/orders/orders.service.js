'use strict';

/**
 * Orders service — placement, status lifecycle, history.
 *
 * Task 7.2: order placement endpoint
 * Requirements: 5.1, 5.2, 3.3, 3.4
 *
 * Task 7.4: order status update endpoint
 * Requirements: 5.3, 5.4, 5.7, 5.8
 *
 * Endpoints handled here (task 7.2):
 *   POST /api/v1/shops/:shopId/orders — place an order (customer)
 *
 * Endpoints handled here (task 7.4):
 *   PATCH /api/v1/shops/:shopId/orders/:id/status — update order status (tenant_admin)
 *
 * Task 7.7 will add listShopOrders and customer order history endpoints.
 */

import { query, queryTenant } from '../../db/queries/base.js';
import { pool } from '../../config/db.js';
import { env } from '../../config/env.js';
import { generateOrderReference } from '../../utils/orderRef.js';
import {
  enqueueOrderConfirmationEmail,
  enqueueOrderStatusEmail,
} from '../../queues/email.queue.js';
import { enqueueReceiptGenerationJob } from '../../queues/pdf.queue.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Validate order quantity: integer between 1 and 99 (inclusive).
 *
 * @param {number|string} quantity
 * @returns {string|null} error message or null
 */
export function validateOrderQuantity(quantity) {
  if (quantity === undefined || quantity === null || quantity === '') {
    return 'Quantity is required.';
  }

  const parsed = typeof quantity === 'string' ? parseInt(quantity, 10) : quantity;

  if (!Number.isInteger(parsed) || isNaN(parsed)) {
    return 'Quantity must be a whole number.';
  }

  if (parsed < 1) {
    return 'Quantity must be at least 1.';
  }

  if (parsed > 99) {
    return 'Quantity must not exceed 99.';
  }

  return null;
}

// ─── Free-tier monthly order limit check ─────────────────────────────────────

/**
 * Check whether the tenant is on the free tier and has reached the monthly
 * order limit (50 orders per calendar month).
 *
 * @param {string} tenantId
 * @returns {Promise<{ isFreeTier: boolean, monthlyCount: number, limit: number }>}
 */
async function getFreeTierOrderStatus(tenantId) {
  // Check subscription tier
  const subResult = await query(
    `SELECT tier FROM subscriptions WHERE tenant_id = $1 AND status = 'active' ORDER BY activated_at DESC LIMIT 1`,
    [tenantId],
  );

  const tier = subResult.rows.length > 0 ? subResult.rows[0].tier : 'free';
  const isFreeTier = tier === 'free';

  if (!isFreeTier) {
    return { isFreeTier: false, monthlyCount: 0, limit: env.FREE_TIER_MAX_MONTHLY_ORDERS };
  }

  // Count orders placed this calendar month for this tenant
  const countResult = await queryTenant(
    `SELECT COUNT(*) AS count FROM orders WHERE created_at >= date_trunc('month', now())`,
    [],
    tenantId,
  );

  const monthlyCount = parseInt(countResult.rows[0].count, 10);
  return { isFreeTier: true, monthlyCount, limit: env.FREE_TIER_MAX_MONTHLY_ORDERS };
}

// ─── Place order ──────────────────────────────────────────────────────────────

/**
 * Place a new order in a shop.
 *
 * Flow:
 *  1. Validate quantity (1–99).
 *  2. Verify the shop exists and belongs to the tenant.
 *  3. Verify the product exists, is active, and belongs to the shop.
 *  4. Check free-tier monthly order limit inside the same transaction as the insert.
 *  5. Generate a unique order reference.
 *  6. Insert the order row with status = 'received'.
 *  7. Insert the initial order_status_history row.
 *  8. Enqueue order confirmation email (fire-and-forget).
 *
 * Requirements: 5.1, 5.2, 3.3, 3.4
 *
 * @param {{
 *   tenantId: string,
 *   shopId: string,
 *   customerId: string,
 *   productId: string,
 *   quantity: number|string,
 * }} data
 * @returns {Promise<{ order: object }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function placeOrder({ tenantId, shopId, customerId, productId, quantity }) {
  // 1. Validate quantity
  const quantityError = validateOrderQuantity(quantity);
  if (quantityError) {
    const err = new Error(quantityError);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const parsedQuantity = typeof quantity === 'string' ? parseInt(quantity, 10) : quantity;

  // 2. Verify the shop exists and belongs to the tenant
  const shopResult = await query(
    'SELECT id FROM shops WHERE id = $1 AND tenant_id = $2',
    [shopId, tenantId],
  );

  if (shopResult.rows.length === 0) {
    const err = new Error('Shop not found or does not belong to your account.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // 3. Verify the product exists, is active, and belongs to the shop
  const productResult = await queryTenant(
    `SELECT id, price FROM products WHERE id = $1 AND shop_id = $2 AND active = true`,
    [productId, shopId],
    tenantId,
  );

  if (productResult.rows.length === 0) {
    const err = new Error('Product not found or is not available.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const unitPrice = productResult.rows[0].price;

  // 4. Check free-tier monthly order limit (Requirement 3.3, 3.4)
  const { isFreeTier, monthlyCount, limit } = await getFreeTierOrderStatus(tenantId);

  if (isFreeTier && monthlyCount >= limit) {
    const err = new Error(
      `You have reached the free tier limit of ${limit} orders per calendar month. Upgrade to the paid tier to place more orders.`,
    );
    err.status = 422;
    err.code = 'LIMIT_EXCEEDED';
    throw err;
  }

  // 5. Generate a unique order reference (Requirement 5.2)
  const reference = await generateOrderReference();

  // 6 & 7. Insert order + initial status history inside a single transaction
  const client = await pool.connect();
  let order;

  try {
    await client.query('BEGIN');

    // Set RLS tenant context
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      tenantId,
    ]);

    // Insert the order row
    const orderInsert = await client.query(
      `INSERT INTO orders
         (tenant_id, shop_id, customer_id, product_id, reference, quantity, unit_price, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'received')
       RETURNING id, tenant_id, shop_id, customer_id, product_id, reference,
                 quantity, unit_price, status, created_at, updated_at`,
      [tenantId, shopId, customerId, productId, reference, parsedQuantity, unitPrice],
    );

    order = orderInsert.rows[0];

    // Insert the initial order_status_history row
    await client.query(
      `INSERT INTO order_status_history (order_id, tenant_id, status, recorded_at)
       VALUES ($1, $2, 'received', NOW())`,
      [order.id, tenantId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 8. Enqueue order confirmation email (fire-and-forget — Requirement 5.4 pattern)
  enqueueOrderConfirmationEmail({
    orderId: order.id,
    customerId,
    tenantId,
    shopId,
    reference: order.reference,
  }).catch((err) => {
    console.error('[ordersService] Failed to enqueue order confirmation email:', err);
  });

  return { order };
}

// ─── Order status lifecycle ───────────────────────────────────────────────────

/**
 * Terminal statuses — no further transitions are allowed from these states.
 * Requirements: 5.7, 5.8
 */
export const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

/**
 * Valid forward transitions in the order lifecycle.
 * "cancelled" is reachable from any non-terminal status.
 * Requirements: 5.3, 5.7
 */
export const VALID_TRANSITIONS = {
  received: new Set(['in-progress', 'cancelled']),
  'in-progress': new Set(['ready-for-pickup', 'cancelled']),
  'ready-for-pickup': new Set(['completed', 'cancelled']),
};

/**
 * Determine whether a status transition is valid.
 *
 * @param {string} currentStatus
 * @param {string} newStatus
 * @returns {{ valid: boolean, terminalError: boolean }}
 *   - `terminalError` is true when the current status is terminal (completed/cancelled)
 *   - `valid` is false for any invalid transition (including terminal → anything)
 */
export function isValidStatusTransition(currentStatus, newStatus) {
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return { valid: false, terminalError: true };
  }

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.has(newStatus)) {
    return { valid: false, terminalError: false };
  }

  return { valid: true, terminalError: false };
}

// ─── Update order status ──────────────────────────────────────────────────────

/**
 * Update the status of an order.
 *
 * Flow:
 *  1. Validate that `newStatus` is a recognised status value.
 *  2. Fetch the current order (tenant-scoped) to verify it exists and belongs
 *     to the shop.
 *  3. Validate the transition against the lifecycle rules.
 *  4. Inside a transaction:
 *     a. Update `orders.status` and `orders.updated_at`.
 *     b. Insert a new `order_status_history` row with a UTC timestamp.
 *  5. Enqueue a customer notification email (fire-and-forget).
 *  6. If the new status is `completed`, enqueue a receipt generation job
 *     (fire-and-forget).
 *
 * Requirements: 5.3, 5.4, 5.7, 5.8
 *
 * @param {string} tenantId
 * @param {string} shopId
 * @param {string} orderId
 * @param {string} newStatus
 * @returns {Promise<{ order: object }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function updateOrderStatus(tenantId, shopId, orderId, newStatus) {
  // 1. Validate that newStatus is a recognised value
  const allStatuses = new Set([
    'received',
    'in-progress',
    'ready-for-pickup',
    'completed',
    'cancelled',
  ]);

  if (!newStatus || !allStatuses.has(newStatus)) {
    const err = new Error(
      `Invalid status value "${newStatus}". Allowed values: received, in-progress, ready-for-pickup, completed, cancelled.`,
    );
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 2. Fetch the current order (tenant-scoped, must belong to the shop)
  const orderResult = await queryTenant(
    `SELECT id, tenant_id, shop_id, customer_id, product_id, reference,
            quantity, unit_price, status, created_at, updated_at
     FROM orders
     WHERE id = $1 AND shop_id = $2`,
    [orderId, shopId],
    tenantId,
  );

  if (orderResult.rows.length === 0) {
    const err = new Error('Order not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const currentOrder = orderResult.rows[0];

  // 3. Validate the transition
  const { valid, terminalError } = isValidStatusTransition(currentOrder.status, newStatus);

  if (!valid) {
    if (terminalError) {
      const err = new Error(
        `Order is in a terminal state ("${currentOrder.status}") and cannot be updated.`,
      );
      err.status = 422;
      err.code = 'TERMINAL_ORDER_STATE';
      throw err;
    }

    const err = new Error(
      `Invalid status transition from "${currentOrder.status}" to "${newStatus}".`,
    );
    err.status = 422;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 4. Persist the new status + history row inside a transaction
  const client = await pool.connect();
  let updatedOrder;

  try {
    await client.query('BEGIN');

    // Set RLS tenant context
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      tenantId,
    ]);

    // 4a. Update the order status
    const updateResult = await client.query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING id, tenant_id, shop_id, customer_id, product_id, reference,
                 quantity, unit_price, status, created_at, updated_at`,
      [newStatus, orderId, tenantId],
    );

    updatedOrder = updateResult.rows[0];

    // 4b. Insert order_status_history row with UTC timestamp
    await client.query(
      `INSERT INTO order_status_history (order_id, tenant_id, status, recorded_at)
       VALUES ($1, $2, $3, NOW())`,
      [orderId, tenantId, newStatus],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 5. Enqueue customer notification email (fire-and-forget — Requirement 5.4)
  enqueueOrderStatusEmail({
    orderId,
    customerId: currentOrder.customer_id,
    tenantId,
    shopId,
    reference: currentOrder.reference,
    newStatus,
  }).catch((err) => {
    console.error('[ordersService] Failed to enqueue order status email:', err);
  });

  // 6. If completed, enqueue receipt generation job (Requirement 5.8 / 6.1)
  if (newStatus === 'completed') {
    enqueueReceiptGenerationJob({
      orderId,
      tenantId,
      shopId,
      customerId: currentOrder.customer_id,
      reference: currentOrder.reference,
    }).catch((err) => {
      console.error('[ordersService] Failed to enqueue receipt generation job:', err);
    });
  }

  return { order: updatedOrder };
}

// ─── List shop orders (tenant_admin) ─────────────────────────────────────────

/**
 * List all orders for a shop (tenant-scoped).
 *
 * Returns orders with product name and customer name for display in the
 * Tenant_Admin order management view.
 *
 * Requirements: 5.3, 5.4
 *
 * @param {string} tenantId
 * @param {string} shopId
 * @returns {Promise<{ orders: object[] }>}
 */
export async function listShopOrders(tenantId, shopId) {
  const result = await queryTenant(
    `SELECT
       o.id,
       o.reference,
       o.quantity,
       o.unit_price,
       o.status,
       o.created_at,
       o.updated_at,
       p.name AS product_name,
       u.full_name AS customer_name
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN users u ON u.id = o.customer_id
     WHERE o.shop_id = $1
     ORDER BY o.created_at DESC`,
    [shopId],
    tenantId,
  );

  return { orders: result.rows };
}

// ─── Customer order list ──────────────────────────────────────────────────────

/**
 * List all orders for the authenticated customer across all shops.
 *
 * Returns: reference, shop name, product name, quantity, status, last updated.
 *
 * Requirements: 5.5
 *
 * @param {string} customerId  UUID of the authenticated customer
 * @returns {Promise<{ orders: object[] }>}
 */
export async function listCustomerOrders(customerId) {
  const result = await query(
    `SELECT
       o.id,
       o.reference,
       o.quantity,
       o.unit_price,
       o.status,
       o.created_at,
       o.updated_at,
       s.name AS shop_name,
       p.name AS product_name
     FROM orders o
     JOIN shops s ON s.id = o.shop_id
     JOIN products p ON p.id = o.product_id
     WHERE o.customer_id = $1
     ORDER BY o.updated_at DESC`,
    [customerId],
  );

  return { orders: result.rows };
}

// ─── Customer order detail ────────────────────────────────────────────────────

/**
 * Return full detail for a single order belonging to the authenticated customer,
 * including the complete order_status_history.
 *
 * Requirements: 5.6
 *
 * @param {string} customerId  UUID of the authenticated customer
 * @param {string} orderId     UUID of the order
 * @returns {Promise<{ order: object, statusHistory: object[] }>}
 * @throws {{ status: 404, code: 'NOT_FOUND' }} when order not found or does not belong to customer
 */
export async function getCustomerOrderDetail(customerId, orderId) {
  // Fetch the order — must belong to this customer
  const orderResult = await query(
    `SELECT
       o.id,
       o.reference,
       o.quantity,
       o.unit_price,
       o.status,
       o.created_at,
       o.updated_at,
       s.name AS shop_name,
       p.name AS product_name,
       p.id AS product_id,
       o.shop_id,
       o.tenant_id
     FROM orders o
     JOIN shops s ON s.id = o.shop_id
     JOIN products p ON p.id = o.product_id
     WHERE o.id = $1 AND o.customer_id = $2`,
    [orderId, customerId],
  );

  if (orderResult.rows.length === 0) {
    const err = new Error('Order not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const order = orderResult.rows[0];

  // Fetch the complete status history for this order
  const historyResult = await query(
    `SELECT id, status, recorded_at
     FROM order_status_history
     WHERE order_id = $1
     ORDER BY recorded_at ASC`,
    [orderId],
  );

  return { order, statusHistory: historyResult.rows };
}
