'use strict';

/**
 * Order routes — placement, status updates, customer order history.
 *
 * Task 7.2: order placement endpoint
 * Requirements: 5.1, 5.2, 3.3, 3.4
 *
 * Task 7.4: order status update endpoint
 * Requirements: 5.3, 5.4, 5.7, 5.8
 *
 * Task 7.7: customer order list and detail endpoints
 * Requirements: 5.5, 5.6
 *
 * Endpoints:
 *   POST  /api/v1/shops/:shopId/orders            — place an order (customer)
 *   GET   /api/v1/shops/:shopId/orders            — list shop orders (tenant_admin)
 *   PATCH /api/v1/shops/:shopId/orders/:id/status — update order status (tenant_admin)
 *   GET   /api/v1/customers/me/orders             — customer order list (customer)
 *   GET   /api/v1/customers/me/orders/:id         — customer order detail (customer)
 *
 * All routes require authentication.
 * tenantMiddleware is applied to enforce shop ownership for tenant_admin routes.
 * Customer routes use the authenticated customer's userId to scope queries.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import {
  placeOrder,
  updateOrderStatus,
  listShopOrders,
  listCustomerOrders,
  getCustomerOrderDetail,
} from './orders.service.js';

const router = Router({ mergeParams: true });

// ─── POST /shops/:shopId/orders ───────────────────────────────────────────────

/**
 * Place a new order in a shop.
 *
 * The customer selects a product, specifies a quantity (1–99), and submits
 * the order. The platform creates the order with status = 'received', inserts
 * the initial order_status_history row, and enqueues a confirmation email.
 *
 * The free-tier monthly order limit is checked inside the same transaction as
 * the insert to prevent race conditions.
 *
 * Authentication: required (customer role)
 * Tenant middleware: skipped for customers (they access any shop's products)
 *
 * Body (application/json):
 *   { productId: string, quantity: number }
 *
 * Success: 201 { order: { id, tenant_id, shop_id, customer_id, product_id,
 *                          reference, quantity, unit_price, status,
 *                          created_at, updated_at } }
 * Errors:
 *   400 VALIDATION_ERROR     — invalid quantity
 *   401 UNAUTHENTICATED      — missing or invalid JWT
 *   403 FORBIDDEN            — not a customer
 *   404 NOT_FOUND            — shop or product not found
 *   422 LIMIT_EXCEEDED       — free-tier monthly order limit reached
 */
router.post(
  '/',
  authenticate,
  requireRole('customer'),
  async (req, res) => {
    try {
      const { shopId } = req.params;
      const { userId: customerId } = req.user;
      const { productId, quantity } = req.body;

      // For customer order placement, we need the shop's tenant_id to scope
      // the product lookup and limit check. Fetch it from the shop record.
      const { query } = await import('../../db/queries/base.js');
      const shopResult = await query(
        'SELECT tenant_id FROM shops WHERE id = $1',
        [shopId],
      );

      if (shopResult.rows.length === 0) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Shop not found.',
            details: [],
          },
        });
      }

      const tenantId = shopResult.rows[0].tenant_id;

      const result = await placeOrder({
        tenantId,
        shopId,
        customerId,
        productId,
        quantity,
      });

      return res.status(201).json(result);
    } catch (err) {
      return res.status(err.status || 500).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message || 'An unexpected error occurred.',
          details: err.details || [],
        },
      });
    }
  },
);

// ─── Tenant_Admin: list shop orders (task 7.7) ────────────────────────────────

/**
 * GET /shops/:shopId/orders — list all orders for a shop.
 *
 * Returns all orders for the shop with product name and customer name.
 * Scoped to the authenticated tenant via tenantMiddleware.
 *
 * Authentication: required (tenant_admin role)
 * Tenant middleware: enforces shop ownership
 *
 * Success: 200 { orders: [ { id, reference, quantity, unit_price, status,
 *                             created_at, updated_at, product_name,
 *                             customer_name } ] }
 * Errors:
 *   401 UNAUTHENTICATED    — missing or invalid JWT
 *   403 FORBIDDEN          — not a tenant_admin
 *   403 CROSS_TENANT_ACCESS — shop belongs to a different tenant
 */
router.get(
  '/',
  authenticate,
  requireRole('tenant_admin'),
  tenantMiddleware,
  async (req, res) => {
    try {
      const { shopId } = req.params;
      const { tenantId } = req.user;

      const result = await listShopOrders(tenantId, shopId);

      return res.status(200).json(result);
    } catch (err) {
      return res.status(err.status || 500).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message || 'An unexpected error occurred.',
          details: err.details || [],
        },
      });
    }
  },
);

// ─── Tenant_Admin: update order status (task 7.4) ────────────────────────────

/**
 * PATCH /shops/:shopId/orders/:id/status — update order status.
 *
 * Validates the requested status transition against the order lifecycle:
 *   received → in-progress → ready-for-pickup → completed
 *   cancelled is reachable from any non-terminal status.
 *
 * Rejects with TERMINAL_ORDER_STATE if the order is already completed or
 * cancelled (Requirement 5.8).
 *
 * Persists the new status and a UTC timestamp to order_status_history inside
 * a transaction (Requirement 5.4). Enqueues a customer notification email
 * (fire-and-forget). Triggers receipt generation if status = 'completed'
 * (Requirement 5.7 / 6.1).
 *
 * Authentication: required (tenant_admin role)
 * Tenant middleware: enforces shop ownership
 *
 * Body (application/json):
 *   { status: string }
 *
 * Success: 200 { order: { id, tenant_id, shop_id, customer_id, product_id,
 *                          reference, quantity, unit_price, status,
 *                          created_at, updated_at } }
 * Errors:
 *   400 VALIDATION_ERROR      — unrecognised status value
 *   401 UNAUTHENTICATED       — missing or invalid JWT
 *   403 FORBIDDEN             — not a tenant_admin
 *   403 CROSS_TENANT_ACCESS   — shop belongs to a different tenant
 *   404 NOT_FOUND             — order not found in this shop
 *   422 TERMINAL_ORDER_STATE  — order is completed or cancelled
 *   422 VALIDATION_ERROR      — invalid lifecycle transition
 */
router.patch(
  '/:id/status',
  authenticate,
  requireRole('tenant_admin'),
  tenantMiddleware,
  async (req, res) => {
    try {
      const { shopId, id: orderId } = req.params;
      const { tenantId } = req.user;
      const { status: newStatus } = req.body;

      const result = await updateOrderStatus(tenantId, shopId, orderId, newStatus);

      return res.status(200).json(result);
    } catch (err) {
      return res.status(err.status || 500).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message || 'An unexpected error occurred.',
          details: err.details || [],
        },
      });
    }
  },
);

export default router;

// ─── Customer order routes (separate router, mounted at /customers/me/orders) ─

/**
 * Separate router for customer-scoped order endpoints.
 * Mounted at /api/v1/customers/me/orders in index.js.
 *
 * These routes use the authenticated customer's userId to scope all queries.
 * No tenantMiddleware is applied — customers can view orders across all shops.
 */
export const customerOrdersRouter = Router();

/**
 * GET /customers/me/orders — list all orders for the authenticated customer.
 *
 * Returns all orders across all shops for the authenticated customer,
 * including: reference, shop name, product name, quantity, status,
 * last updated timestamp.
 *
 * Authentication: required (customer role)
 *
 * Success: 200 { orders: [ { id, reference, quantity, unit_price, status,
 *                             created_at, updated_at, shop_name,
 *                             product_name } ] }
 * Errors:
 *   401 UNAUTHENTICATED — missing or invalid JWT
 *   403 FORBIDDEN       — not a customer
 *
 * Requirements: 5.5
 */
customerOrdersRouter.get(
  '/',
  authenticate,
  requireRole('customer'),
  async (req, res) => {
    try {
      const { userId: customerId } = req.user;

      const result = await listCustomerOrders(customerId);

      return res.status(200).json(result);
    } catch (err) {
      return res.status(err.status || 500).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message || 'An unexpected error occurred.',
          details: err.details || [],
        },
      });
    }
  },
);

/**
 * GET /customers/me/orders/:id — full detail for a single order.
 *
 * Returns the order detail plus the complete order_status_history for the
 * specified order, provided it belongs to the authenticated customer.
 *
 * Authentication: required (customer role)
 *
 * Success: 200 { order: { id, reference, quantity, unit_price, status,
 *                          created_at, updated_at, shop_name, product_name,
 *                          product_id, shop_id, tenant_id },
 *               statusHistory: [ { id, status, recorded_at } ] }
 * Errors:
 *   401 UNAUTHENTICATED — missing or invalid JWT
 *   403 FORBIDDEN       — not a customer
 *   404 NOT_FOUND       — order not found or does not belong to this customer
 *
 * Requirements: 5.6
 */
customerOrdersRouter.get(
  '/:id',
  authenticate,
  requireRole('customer'),
  async (req, res) => {
    try {
      const { userId: customerId } = req.user;
      const { id: orderId } = req.params;

      const result = await getCustomerOrderDetail(customerId, orderId);

      return res.status(200).json(result);
    } catch (err) {
      return res.status(err.status || 500).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message || 'An unexpected error occurred.',
          details: err.details || [],
        },
      });
    }
  },
);
