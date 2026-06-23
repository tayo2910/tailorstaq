'use strict';

/**
 * Platform_Admin service — approval workflow, tenant management, metrics.
 *
 * Task 4.2
 * Requirements: 1.4, 1.5, 1.6, 1.7, 1.8
 *
 * Task 11.1 — tenant suspend/reactivate
 * Requirements: 9.1, 9.2, 9.3, 9.4
 *
 * Task 11.2 — platform metrics
 * Requirements: 9.5
 */

import { query } from '../../db/queries/base.js';
import { hashPassword } from '../../utils/password.js';
import {
  enqueueTenantApprovalEmail,
  enqueueTenantRejectionEmail,
  enqueueTenantSuspensionEmail,
  enqueueTenantReactivationEmail,
} from '../../queues/email.queue.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Validate rejection reason: 1–500 characters.
 * @param {string} reason
 * @returns {string|null} error message or null
 */
function validateRejectionReason(reason) {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return 'Rejection reason is required.';
  }
  if (reason.trim().length > 500) {
    return 'Rejection reason must be between 1 and 500 characters.';
  }
  return null;
}

// ─── Allowed status filter values ────────────────────────────────────────────

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected']);

// ─── List approval requests ───────────────────────────────────────────────────

/**
 * List all approval requests, optionally filtered by status.
 *
 * Requirement 1.8: Platform_Admin can view all approval requests and filter by status.
 *
 * @param {{ status?: string }} options
 * @returns {Promise<{ approvals: Array }>}
 * @throws {{ status: number, code: string, message: string }} on invalid status filter
 */
export async function listApprovals({ status } = {}) {
  // Validate the optional status filter
  if (status !== undefined && status !== null && status !== '') {
    if (!VALID_STATUSES.has(status)) {
      const err = new Error(
        `Invalid status filter. Allowed values: ${[...VALID_STATUSES].join(', ')}.`,
      );
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  let sql;
  let params;

  if (status && VALID_STATUSES.has(status)) {
    sql = `
      SELECT id, business_name, contact_email, phone, business_description,
             status, rejection_reason, created_at, reviewed_at
      FROM approval_requests
      WHERE status = $1
      ORDER BY created_at DESC
    `;
    params = [status];
  } else {
    sql = `
      SELECT id, business_name, contact_email, phone, business_description,
             status, rejection_reason, created_at, reviewed_at
      FROM approval_requests
      ORDER BY created_at DESC
    `;
    params = [];
  }

  const result = await query(sql, params);

  return { approvals: result.rows };
}

// ─── Approve or reject an approval request ───────────────────────────────────

/**
 * Approve or reject a pending approval request.
 *
 * Approve flow (Requirement 1.5):
 *  1. Fetch the approval_request; verify it exists and is 'pending'.
 *  2. Inside a transaction:
 *     a. Create a tenants row.
 *     b. Create a users row (tenant_admin role) with a temporary password.
 *     c. Create a shops row associated with the new tenant.
 *     d. Create a subscriptions row (free tier).
 *     e. Update approval_requests status → 'approved', set reviewed_at.
 *  3. Enqueue approval email (best-effort).
 *
 * Reject flow (Requirement 1.6):
 *  1. Fetch the approval_request; verify it exists and is 'pending'.
 *  2. Validate rejection_reason (1–500 chars).
 *  3. Update approval_requests status → 'rejected', record rejection_reason, set reviewed_at.
 *  4. Enqueue rejection email (best-effort).
 *
 * @param {{
 *   requestId: string,
 *   action: 'approve' | 'reject',
 *   rejection_reason?: string
 * }} data
 * @returns {Promise<{ message: string, tenantId?: string }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function processApproval({ requestId, action, rejection_reason }) {
  // 1. Validate action
  if (action !== 'approve' && action !== 'reject') {
    const err = new Error("Action must be either 'approve' or 'reject'.");
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 2. Fetch the approval request
  const requestResult = await query(
    `SELECT id, business_name, contact_email, phone, business_description, password_hash, status
     FROM approval_requests
     WHERE id = $1`,
    [requestId],
  );

  if (requestResult.rows.length === 0) {
    const err = new Error('Approval request not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const approvalRequest = requestResult.rows[0];

  // 3. Verify the request is still pending (Requirement 1.7: prevent double-approve/reject)
  if (approvalRequest.status !== 'pending') {
    const err = new Error(
      `This approval request has already been ${approvalRequest.status}. Only pending requests can be approved or rejected.`,
    );
    err.status = 409;
    err.code = 'ALREADY_IN_STATE';
    throw err;
  }

  if (action === 'approve') {
    return _approveRequest(approvalRequest);
  } else {
    return _rejectRequest(approvalRequest, rejection_reason);
  }
}

// ─── Private: approve ─────────────────────────────────────────────────────────

/**
 * Execute the approval flow inside a database transaction.
 *
 * Creates: tenant → user (tenant_admin) → shop → subscription (free)
 * Updates: approval_requests.status = 'approved'
 *
 * @param {{ id: string, business_name: string, contact_email: string, phone: string, business_description: string }} approvalRequest
 * @returns {Promise<{ message: string, tenantId: string }>}
 */
async function _approveRequest(approvalRequest) {
  const { pool } = await import('../../config/db.js');
  const client = await pool.connect();

  let tenantId;

  try {
    await client.query('BEGIN');

    // a. Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (business_name, contact_email, phone, business_description, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id`,
      [
        approvalRequest.business_name,
        approvalRequest.contact_email,
        approvalRequest.phone,
        approvalRequest.business_description,
      ],
    );
    tenantId = tenantResult.rows[0].id;

    // b. Create tenant_admin user with the password provided during registration,
    //    or a temporary password if none was stored.
    let passwordHash;
    if (approvalRequest.password_hash) {
      passwordHash = approvalRequest.password_hash;
    } else {
      const crypto = await import('crypto');
      const tempPassword = crypto.randomBytes(16).toString('hex') + 'Aa1!';
      passwordHash = await hashPassword(tempPassword);
    }

    await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, tenant_id, account_status, failed_attempts)
       VALUES ($1, $2, $3, 'tenant_admin', $4, 'active', 0)`,
      [
        approvalRequest.business_name, // use business name as initial full_name
        approvalRequest.contact_email,
        passwordHash,
        tenantId,
      ],
    );

    // c. Create shop associated with the tenant
    await client.query(
      `INSERT INTO shops (tenant_id, name)
       VALUES ($1, $2)`,
      [tenantId, approvalRequest.business_name],
    );

    // d. Create free subscription
    await client.query(
      `INSERT INTO subscriptions (tenant_id, tier, status)
       VALUES ($1, 'free', 'active')`,
      [tenantId],
    );

    // e. Update approval_requests status → 'approved'
    await client.query(
      `UPDATE approval_requests
       SET status = 'approved', reviewed_at = NOW()
       WHERE id = $1`,
      [approvalRequest.id],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 3. Enqueue approval email (best-effort; approval succeeds even if enqueue fails)
  try {
    await enqueueTenantApprovalEmail({
      tenantId,
      email: approvalRequest.contact_email,
      businessName: approvalRequest.business_name,
    });
  } catch (queueErr) {
    console.error('Failed to enqueue tenant approval email:', queueErr.message);
  }

  return {
    message: 'Approval request approved successfully. Tenant account, shop, and free subscription have been created.',
    tenantId,
  };
}

// ─── Private: reject ──────────────────────────────────────────────────────────

/**
 * Execute the rejection flow.
 *
 * Updates: approval_requests.status = 'rejected', records rejection_reason
 *
 * @param {{ id: string, business_name: string, contact_email: string }} approvalRequest
 * @param {string} rejectionReason
 * @returns {Promise<{ message: string }>}
 */
async function _rejectRequest(approvalRequest, rejectionReason) {
  // Validate rejection reason (Requirement 1.6: mandatory, 1–500 chars)
  const reasonError = validateRejectionReason(rejectionReason);
  if (reasonError) {
    const err = new Error(reasonError);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const normalizedReason = rejectionReason.trim();

  // Update approval_requests
  await query(
    `UPDATE approval_requests
     SET status = 'rejected', rejection_reason = $1, reviewed_at = NOW()
     WHERE id = $2`,
    [normalizedReason, approvalRequest.id],
  );

  // Enqueue rejection email (best-effort; rejection succeeds even if enqueue fails)
  try {
    await enqueueTenantRejectionEmail({
      requestId: approvalRequest.id,
      email: approvalRequest.contact_email,
      businessName: approvalRequest.business_name,
      rejectionReason: normalizedReason,
    });
  } catch (queueErr) {
    console.error('Failed to enqueue tenant rejection email:', queueErr.message);
  }

  return {
    message: 'Approval request rejected successfully.',
  };
}

// ─── Task 11.1: Tenant management ─────────────────────────────────────────────

/**
 * List all tenants with business name, subscription tier, registration date, status.
 *
 * Requirement 9.1: Display all tenants with business name, subscription tier,
 * registration date, and account status.
 *
 * @returns {Promise<{ tenants: Array }>}
 */
export async function listTenants() {
  const sql = `
    SELECT
      t.id,
      t.business_name,
      t.contact_email,
      t.status,
      t.created_at AS registration_date,
      s.tier AS subscription_tier,
      s.status AS subscription_status
    FROM tenants t
    LEFT JOIN LATERAL (
      SELECT tier, status
      FROM subscriptions
      WHERE tenant_id = t.id
      ORDER BY activated_at DESC
      LIMIT 1
    ) s ON true
    ORDER BY t.created_at DESC
  `;

  const result = await query(sql);
  return { tenants: result.rows };
}

/**
 * Validate tenant IDs returned by the list endpoint.
 * @returns {Set} Set of valid tenant IDs
 */
async function getValidTenantIds() {
  const result = await query('SELECT id FROM tenants');
  return new Set(result.rows.map(r => r.id));
}

/**
 * Update tenant status: suspend or reactivate.
 *
 * Suspend flow (Requirement 9.2):
 *  - Set tenant status to 'suspended'
 *  - Invalidate active sessions by setting tenant_admin users' account_status
 *  - Enqueue suspension email
 *
 * Reactivate flow (Requirement 9.3):
 *  - Set tenant status to 'active'
 *  - Restore tenant_admin users' account_status
 *  - Enqueue reactivation email
 *
 * @param {{ tenantId: string, action: 'suspend' | 'reactivate' }} options
 * @returns {Promise<{ message: string }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function updateTenantStatus({ tenantId, action }) {
  if (action !== 'suspend' && action !== 'reactivate') {
    const err = new Error("Action must be either 'suspend' or 'reactivate'.");
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const targetStatus = action === 'suspend' ? 'suspended' : 'active';

  const tenantResult = await query(
    'SELECT id, business_name, contact_email, status FROM tenants WHERE id = $1',
    [tenantId],
  );

  if (tenantResult.rows.length === 0) {
    const err = new Error('Tenant not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const tenant = tenantResult.rows[0];

  if (tenant.status === targetStatus) {
    const err = new Error(
      `Tenant account is already ${targetStatus}.`,
    );
    err.status = 409;
    err.code = 'ALREADY_IN_STATE';
    throw err;
  }

  const { pool } = await import('../../config/db.js');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'UPDATE tenants SET status = $1 WHERE id = $2',
      [targetStatus, tenantId],
    );

    if (action === 'suspend') {
      await client.query(
        `UPDATE users SET account_status = 'locked' WHERE tenant_id = $1 AND role = 'tenant_admin' AND account_status = 'active'`,
        [tenantId],
      );
    } else {
      await client.query(
        `UPDATE users SET account_status = 'active', failed_attempts = 0, locked_until = NULL WHERE tenant_id = $1 AND role = 'tenant_admin' AND account_status = 'locked'`,
        [tenantId],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  try {
    if (action === 'suspend') {
      await enqueueTenantSuspensionEmail({
        tenantId,
        email: tenant.contact_email,
        businessName: tenant.business_name,
      });
    } else {
      await enqueueTenantReactivationEmail({
        tenantId,
        email: tenant.contact_email,
        businessName: tenant.business_name,
      });
    }
  } catch (queueErr) {
    console.error(`Failed to enqueue tenant ${action} email:`, queueErr.message);
  }

  return {
    message: `Tenant account has been ${targetStatus} successfully.`,
  };
}

// ─── Task 11.2: Platform metrics ──────────────────────────────────────────────

/**
 * Get platform metrics for a given date range.
 *
 * Requirement 9.5: Display total tenants, active subscriptions by tier,
 * total orders in the specified date range.
 *
 * @param {{ from?: string, to?: string }} options
 * @returns {Promise<{ totalTenants: number, subscriptionsByTier: object, totalOrders: number }>}
 */
export async function getPlatformMetrics({ from, to } = {}) {
  let orderClause = '';
  const orderParams = [];

  if (from) {
    orderParams.push(from);
    orderClause += ` AND created_at >= $${orderParams.length}`;
  }

  if (to) {
    orderParams.push(to);
    orderClause += ` AND created_at <= $${orderParams.length}`;
  }

  const [tenantResult, subResult, orderResult] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM tenants'),
    query(
      `SELECT tier, COUNT(*)::int AS count
       FROM subscriptions
       WHERE status = 'active'
       GROUP BY tier`,
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM orders WHERE 1=1${orderClause}`,
      orderParams,
    ),
  ]);

  const totalTenants = tenantResult.rows[0].count;
  const subscriptionsByTier = {};
  for (const row of subResult.rows) {
    subscriptionsByTier[row.tier] = row.count;
  }
  const totalOrders = orderResult.rows[0].count;

  return { totalTenants, subscriptionsByTier, totalOrders };
}

// Export validators for unit testing
export { validateRejectionReason };
