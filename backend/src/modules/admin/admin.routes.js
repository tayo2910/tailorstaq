'use strict';

/**
 * Platform_Admin routes — approvals, tenant management, metrics.
 *
 * Task 4.2
 * Requirements: 1.4, 1.5, 1.6, 1.7, 1.8
 *
 * Task 11.1
 * Requirements: 9.1, 9.2, 9.3, 9.4
 *
 * Task 11.2
 * Requirements: 9.5
 *
 * Endpoints:
 *   GET  /approvals                 — list approval requests (optional ?status= filter)
 *   PATCH /approvals/:id            — approve or reject an approval request
 *   GET  /tenants                   — list all tenants
 *   PATCH /tenants/:id/status       — suspend or reactivate a tenant
 *   GET  /metrics                   — platform metrics
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { listApprovals, processApproval, listTenants, updateTenantStatus, getPlatformMetrics } from './admin.service.js';

const router = Router();

// All admin routes require authentication and platform_admin role
router.use(authenticate, requireRole('platform_admin'));

// ─── GET /approvals ───────────────────────────────────────────────────────────

/**
 * List all approval requests, optionally filtered by status.
 *
 * Query params:
 *   ?status=pending|approved|rejected  (optional)
 *
 * Success: 200 { approvals: [...] }
 * Errors:
 *   400 VALIDATION_ERROR  — invalid status filter value
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 FORBIDDEN         — authenticated but not platform_admin
 */
router.get('/approvals', async (req, res) => {
  try {
    const { status } = req.query;
    const result = await listApprovals({ status });
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

// ─── PATCH /approvals/:id ─────────────────────────────────────────────────────

/**
 * Approve or reject a pending approval request.
 *
 * Body:
 *   { action: 'approve' }
 *   { action: 'reject', rejection_reason: string (1–500 chars) }
 *
 * Success (approve): 200 { message, tenantId }
 * Success (reject):  200 { message }
 * Errors:
 *   400 VALIDATION_ERROR  — invalid action or missing/invalid rejection_reason
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 FORBIDDEN         — authenticated but not platform_admin
 *   404 NOT_FOUND         — approval request not found
 *   409 ALREADY_IN_STATE  — request is not in 'pending' status
 */
router.patch('/approvals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejection_reason } = req.body;

    const result = await processApproval({
      requestId: id,
      action,
      rejection_reason,
    });

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

// ─── GET /tenants ──────────────────────────────────────────────────────────────

/**
 * List all tenants with subscription tier, registration date, status.
 *
 * Task 11.1
 * Requirement 9.1
 *
 * Success: 200 { tenants: [...] }
 * Errors:
 *   401 UNAUTHENTICATED — missing or invalid JWT
 *   403 FORBIDDEN       — not platform_admin
 */
router.get('/tenants', async (req, res) => {
  try {
    const result = await listTenants();
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

// ─── PATCH /tenants/:id/status ─────────────────────────────────────────────────

/**
 * Suspend or reactivate a tenant account.
 *
 * Task 11.1
 * Requirements: 9.2, 9.3, 9.4
 *
 * Body:
 *   { action: 'suspend' | 'reactivate' }
 *
 * Success: 200 { message }
 * Errors:
 *   400 VALIDATION_ERROR  — invalid action
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 FORBIDDEN         — not platform_admin
 *   404 NOT_FOUND         — tenant not found
 *   409 ALREADY_IN_STATE  — tenant already in requested state
 */
router.patch('/tenants/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    const result = await updateTenantStatus({ tenantId: id, action });

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

// ─── GET /metrics ──────────────────────────────────────────────────────────────

/**
 * Get platform metrics for a date range.
 *
 * Task 11.2
 * Requirement 9.5
 *
 * Query params:
 *   ?from=ISO_DATE&to=ISO_DATE  (optional date range)
 *
 * Success: 200 { totalTenants, subscriptionsByTier, totalOrders }
 * Errors:
 *   401 UNAUTHENTICATED — missing or invalid JWT
 *   403 FORBIDDEN       — not platform_admin
 */
router.get('/metrics', async (req, res) => {
  try {
    const { from, to } = req.query;
    const result = await getPlatformMetrics({ from, to });
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
