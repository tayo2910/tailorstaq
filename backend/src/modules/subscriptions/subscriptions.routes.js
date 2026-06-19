'use strict';

/**
 * Subscriptions routes — tier query and upgrade flow.
 *
 * Task 10.1
 * Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 3.9
 *
 * Endpoints:
 *   GET  /api/v1/subscriptions/me      — current subscription + usage + upgrade options
 *   POST /api/v1/subscriptions/upgrade  — initiate upgrade (creates pending payment record)
 *   POST /api/v1/subscriptions/confirm  — confirm payment, activate paid subscription
 *
 * All routes require authentication with tenant_admin role.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import {
  getCurrentSubscription,
  initiateUpgrade,
  confirmUpgrade,
} from './subscriptions.service.js';

const router = Router();

// All subscription routes require a tenant_admin user
router.use(authenticate, requireRole('tenant_admin'));

// ─── GET /api/v1/subscriptions/me ─────────────────────────────────────────────

/**
 * Return the current subscription tier, usage counters, and upgrade options
 * for the authenticated Tenant_Admin's tenant.
 *
 * Requirements: 3.1, 3.9
 *
 * Success: 200 {
 *   subscription: { id, tier, status, activatedAt, expiresAt },
 *   usage: {
 *     activeProducts, activeProductsLimit,
 *     monthlyOrders, monthlyOrdersLimit,
 *   },
 *   upgradeOptions: [{ billingPeriod, amount, currency, features }] | null,
 * }
 * Errors:
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 FORBIDDEN         — not a tenant_admin
 */
router.get('/me', async (req, res) => {
  try {
    const { tenantId } = req.user;

    const result = await getCurrentSubscription(tenantId);
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
});

// ─── POST /api/v1/subscriptions/upgrade ──────────────────────────────────────

/**
 * Initiate a subscription upgrade.
 *
 * Creates a pending payment record. The subscription is NOT activated until
 * the client calls POST /subscriptions/confirm with the returned paymentRecordId.
 *
 * If the tenant abandons the flow before confirming, their subscription remains
 * on the free tier and the pending payment record is left as 'pending'
 * (Requirement 3.6).
 *
 * Requirements: 3.5, 3.6
 *
 * Body (application/json):
 *   { billingPeriod: 'monthly' | 'annual' }
 *
 * Success: 201 {
 *   paymentRecord: { id, tier, billingPeriod, amount, currency, status, createdAt },
 *   paidTierFeatures: string[],
 *   price: { amount, currency, billingPeriod },
 * }
 * Errors:
 *   400 VALIDATION_ERROR  — invalid or missing billingPeriod
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 FORBIDDEN         — not a tenant_admin
 *   409 ALREADY_IN_STATE  — tenant is already on the paid tier
 */
router.post('/upgrade', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { billingPeriod } = req.body;

    const result = await initiateUpgrade(tenantId, { billingPeriod });
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
});

// ─── POST /api/v1/subscriptions/confirm ──────────────────────────────────────

/**
 * Confirm a pending payment and activate the paid subscription.
 *
 * Activates the subscription, expires any previously active subscriptions,
 * and enqueues a confirmation email to the Tenant_Admin.
 *
 * Requirements: 3.7
 *
 * Body (application/json):
 *   { paymentRecordId: string, [paymentReference]: string }
 *
 * Success: 200 {
 *   subscription: { id, tier, status, activatedAt, expiresAt },
 *   message: string,
 * }
 * Errors:
 *   400 VALIDATION_ERROR  — missing paymentRecordId
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 FORBIDDEN         — not a tenant_admin
 *   404 NOT_FOUND         — payment record not found or does not belong to this tenant
 *   409 ALREADY_IN_STATE  — payment record is not in pending status
 */
router.post('/confirm', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { paymentRecordId, paymentReference } = req.body;

    const result = await confirmUpgrade(tenantId, { paymentRecordId, paymentReference });
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
});

export default router;
