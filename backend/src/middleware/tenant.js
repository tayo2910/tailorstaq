'use strict';

/**
 * Tenant ownership validation middleware.
 *
 * Compares `req.user.tenantId` against the `tenant_id` of the shop identified
 * by `req.params.shopId`.  On a mismatch the middleware:
 *   1. Inserts an `audit_logs` row (requesting_tenant_id, target_resource_id,
 *      action = 'CROSS_TENANT_ACCESS', occurred_at = NOW()).
 *   2. Returns HTTP 403 with error code `CROSS_TENANT_ACCESS`.
 *
 * On a match it calls `next()` so the route handler can proceed.
 *
 * Requirements: 7.2, 7.3, 8.8
 */

import { query } from '../db/queries/base.js';

/**
 * Express middleware that enforces tenant ownership for shop-scoped routes.
 *
 * Expects:
 *   - `req.user`          — set by authMiddleware; must contain `tenantId`.
 *   - `req.params.shopId` — the UUID of the shop being accessed.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function tenantMiddleware(req, res, next) {
  try {
    const { tenantId } = req.user ?? {};
    const { shopId } = req.params;

    // If there is no tenantId on the token (e.g. platform_admin or customer
    // calling a shop-scoped route), skip tenant ownership check — role guards
    // on the route itself are responsible for blocking those roles.
    if (!tenantId) {
      return next();
    }

    if (!shopId) {
      // No shopId in the route — nothing to check.
      return next();
    }

    // Look up the shop's tenant_id using the raw query helper (not
    // queryTenant) because we are performing a cross-tenant lookup here —
    // we deliberately want to find the shop regardless of which tenant owns it
    // so we can compare ownership.
    const shopResult = await query(
      'SELECT tenant_id FROM shops WHERE id = $1',
      [shopId],
    );

    if (shopResult.rows.length === 0) {
      // Shop does not exist — let the route handler return 404.
      return next();
    }

    const shopTenantId = shopResult.rows[0].tenant_id;

    if (shopTenantId === tenantId) {
      // Tenant owns this shop — allow the request through.
      return next();
    }

    // ── Mismatch: cross-tenant access attempt ────────────────────────────────

    // Write audit log row (fire-and-forget; do not block the 403 response on
    // a logging failure, but do log any error to stderr).
    query(
      `INSERT INTO audit_logs
         (requesting_tenant_id, target_resource_id, action, occurred_at)
       VALUES ($1, $2, $3, NOW())`,
      [tenantId, shopId, 'CROSS_TENANT_ACCESS'],
    ).catch((err) => {
      console.error('[tenantMiddleware] Failed to write audit log:', err);
    });

    return res.status(403).json({
      error: {
        code: 'CROSS_TENANT_ACCESS',
        message:
          'You do not have permission to access resources belonging to another tenant.',
      },
    });
  } catch (err) {
    console.error('[tenantMiddleware] Unexpected error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
  }
}
