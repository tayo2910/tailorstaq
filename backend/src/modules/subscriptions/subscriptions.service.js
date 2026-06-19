'use strict';

/**
 * Subscriptions service — tier management, limit enforcement, upgrade flow.
 *
 * Task 10.1
 * Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 3.9
 *
 * Endpoints handled here:
 *   GET  /api/v1/subscriptions/me      — current subscription details + usage + upgrade options
 *   POST /api/v1/subscriptions/upgrade  — initiate upgrade (creates pending payment record)
 *   POST /api/v1/subscriptions/confirm  — confirm payment, activate paid subscription
 */

import { query } from '../../db/queries/base.js';
import { pool } from '../../config/db.js';
import { env } from '../../config/env.js';
import { enqueueSubscriptionConfirmationEmail, enqueueSubscriptionDowngradeEmail } from '../../queues/email.queue.js';

// ─── Subscription tier configuration ─────────────────────────────────────────

/**
 * Paid tier pricing and feature configuration.
 * In a production system these would come from a database / config service.
 */
const PAID_TIER_OPTIONS = [
  {
    billingPeriod: 'monthly',
    amount: 29.99,
    currency: 'USD',
    features: [
      'Unlimited active products',
      'Unlimited monthly orders',
      'Priority email support',
      'Advanced analytics',
      'Custom receipt branding',
    ],
  },
  {
    billingPeriod: 'annual',
    amount: 299.99,
    currency: 'USD',
    features: [
      'Unlimited active products',
      'Unlimited monthly orders',
      'Priority email support',
      'Advanced analytics',
      'Custom receipt branding',
      '2 months free (vs monthly billing)',
    ],
  },
];

/**
 * Free tier feature summary (used in upgrade options display).
 */
const FREE_TIER_FEATURES = {
  maxActiveProducts: env.FREE_TIER_MAX_PRODUCTS,
  maxMonthlyOrders: env.FREE_TIER_MAX_MONTHLY_ORDERS,
};

// ─── Get current subscription ─────────────────────────────────────────────────

/**
 * Return the current subscription details for a tenant, including usage
 * counters and upgrade options.
 *
 * Requirements: 3.1, 3.9
 *
 * @param {string} tenantId  UUID of the authenticated tenant
 * @returns {Promise<{
 *   subscription: {
 *     id: string,
 *     tier: 'free' | 'paid',
 *     status: 'active' | 'expired',
 *     activatedAt: string,
 *     expiresAt: string | null,
 *   },
 *   usage: {
 *     activeProducts: number,
 *     activeProductsLimit: number | null,
 *     monthlyOrders: number,
 *     monthlyOrdersLimit: number | null,
 *   },
 *   upgradeOptions: Array<{
 *     billingPeriod: string,
 *     amount: number,
 *     currency: string,
 *     features: string[],
 *   }> | null,
 * }>}
 */
export async function getCurrentSubscription(tenantId) {
  // Fetch the active subscription for this tenant
  const subResult = await query(
    `SELECT id, tier, status, activated_at, expires_at
     FROM subscriptions
     WHERE tenant_id = $1 AND status = 'active'
     ORDER BY activated_at DESC
     LIMIT 1`,
    [tenantId],
  );

  // If no active subscription found, default to free tier
  let subscription;
  if (subResult.rows.length === 0) {
    subscription = {
      id: null,
      tier: 'free',
      status: 'active',
      activatedAt: null,
      expiresAt: null,
    };
  } else {
    const row = subResult.rows[0];
    subscription = {
      id: row.id,
      tier: row.tier,
      status: row.status,
      activatedAt: row.activated_at,
      expiresAt: row.expires_at,
    };
  }

  // Count active products for this tenant
  const productCountResult = await query(
    `SELECT COUNT(*) AS count FROM products WHERE tenant_id = $1 AND active = true`,
    [tenantId],
  );
  const activeProducts = parseInt(productCountResult.rows[0].count, 10);

  // Count orders placed this calendar month for this tenant
  const orderCountResult = await query(
    `SELECT COUNT(*) AS count FROM orders WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`,
    [tenantId],
  );
  const monthlyOrders = parseInt(orderCountResult.rows[0].count, 10);

  const isFreeTier = subscription.tier === 'free';

  const usage = {
    activeProducts,
    activeProductsLimit: isFreeTier ? FREE_TIER_FEATURES.maxActiveProducts : null,
    monthlyOrders,
    monthlyOrdersLimit: isFreeTier ? FREE_TIER_FEATURES.maxMonthlyOrders : null,
  };

  // Only show upgrade options when tenant is on the free tier
  const upgradeOptions = isFreeTier ? PAID_TIER_OPTIONS : null;

  return { subscription, usage, upgradeOptions };
}

// ─── Initiate upgrade ─────────────────────────────────────────────────────────

/**
 * Initiate a subscription upgrade by creating a pending payment record.
 *
 * The subscription is NOT activated until payment is confirmed via
 * `confirmUpgrade`. If the tenant abandons the flow, the pending record
 * remains as 'pending' and the tenant stays on the free tier (Requirement 3.6).
 *
 * Requirements: 3.5, 3.6
 *
 * @param {string} tenantId      UUID of the authenticated tenant
 * @param {{ billingPeriod: 'monthly' | 'annual' }} options
 * @returns {Promise<{
 *   paymentRecord: {
 *     id: string,
 *     tier: 'paid',
 *     billingPeriod: string,
 *     amount: number,
 *     currency: string,
 *     status: 'pending',
 *     createdAt: string,
 *   },
 *   paidTierFeatures: string[],
 *   price: { amount: number, currency: string, billingPeriod: string },
 * }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function initiateUpgrade(tenantId, { billingPeriod } = {}) {
  // Validate billing period
  const validPeriods = ['monthly', 'annual'];
  if (!billingPeriod || !validPeriods.includes(billingPeriod)) {
    const err = new Error(
      `Invalid billing period "${billingPeriod}". Allowed values: monthly, annual.`,
    );
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Check if tenant is already on paid tier
  const currentSubResult = await query(
    `SELECT tier FROM subscriptions WHERE tenant_id = $1 AND status = 'active' ORDER BY activated_at DESC LIMIT 1`,
    [tenantId],
  );
  const currentTier =
    currentSubResult.rows.length > 0 ? currentSubResult.rows[0].tier : 'free';

  if (currentTier === 'paid') {
    const err = new Error('Your subscription is already on the paid tier.');
    err.status = 409;
    err.code = 'ALREADY_IN_STATE';
    throw err;
  }

  // Find the pricing for the requested billing period
  const tierOption = PAID_TIER_OPTIONS.find((opt) => opt.billingPeriod === billingPeriod);
  // tierOption will always be found because we validated billingPeriod above

  // Create a pending payment record (Requirement 3.5 — do NOT activate until confirmed)
  const insertResult = await query(
    `INSERT INTO payment_records (tenant_id, tier, billing_period, amount, currency, status)
     VALUES ($1, 'paid', $2, $3, $4, 'pending')
     RETURNING id, tier, billing_period, amount, currency, status, created_at`,
    [tenantId, billingPeriod, tierOption.amount, tierOption.currency],
  );

  const record = insertResult.rows[0];

  return {
    paymentRecord: {
      id: record.id,
      tier: record.tier,
      billingPeriod: record.billing_period,
      amount: parseFloat(record.amount),
      currency: record.currency,
      status: record.status,
      createdAt: record.created_at,
    },
    paidTierFeatures: tierOption.features,
    price: {
      amount: parseFloat(record.amount),
      currency: record.currency,
      billingPeriod: record.billing_period,
    },
  };
}

// ─── Confirm upgrade ──────────────────────────────────────────────────────────

/**
 * Confirm a pending payment and activate the paid subscription.
 *
 * Flow:
 *  1. Look up the pending payment record by ID and verify it belongs to the tenant.
 *  2. Mark the payment record as 'confirmed' and set confirmed_at.
 *  3. Inside a transaction:
 *     a. Expire any existing active subscriptions.
 *     b. Insert a new 'paid' subscription row.
 *  4. Enqueue a subscription confirmation email (fire-and-forget).
 *
 * Requirements: 3.7
 *
 * @param {string} tenantId       UUID of the authenticated tenant
 * @param {{ paymentRecordId: string, paymentReference?: string }} data
 * @returns {Promise<{
 *   subscription: {
 *     id: string,
 *     tier: 'paid',
 *     status: 'active',
 *     activatedAt: string,
 *     expiresAt: string | null,
 *   },
 *   message: string,
 * }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function confirmUpgrade(tenantId, { paymentRecordId, paymentReference } = {}) {
  // Validate paymentRecordId
  if (!paymentRecordId) {
    const err = new Error('Payment record ID is required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 1. Look up the pending payment record
  const recordResult = await query(
    `SELECT id, tenant_id, tier, billing_period, amount, currency, status
     FROM payment_records
     WHERE id = $1 AND tenant_id = $2`,
    [paymentRecordId, tenantId],
  );

  if (recordResult.rows.length === 0) {
    const err = new Error('Payment record not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const paymentRecord = recordResult.rows[0];

  if (paymentRecord.status !== 'pending') {
    const err = new Error(
      `Payment record is already in "${paymentRecord.status}" status and cannot be confirmed again.`,
    );
    err.status = 409;
    err.code = 'ALREADY_IN_STATE';
    throw err;
  }

  // 2 & 3. Confirm payment and activate subscription inside a transaction
  const client = await pool.connect();
  let newSubscription;

  try {
    await client.query('BEGIN');

    // Mark payment record as confirmed
    await client.query(
      `UPDATE payment_records
       SET status = 'confirmed', confirmed_at = NOW(), payment_reference = $1
       WHERE id = $2`,
      [paymentReference ?? null, paymentRecordId],
    );

    // 3a. Expire any existing active subscriptions for this tenant
    await client.query(
      `UPDATE subscriptions
       SET status = 'expired'
       WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId],
    );

    // 3b. Calculate expiry date based on billing period
    const billingPeriod = paymentRecord.billing_period;
    const expiresAtInterval = billingPeriod === 'annual' ? '1 year' : '1 month';

    // Insert the new paid subscription row
    const subInsert = await client.query(
      `INSERT INTO subscriptions (tenant_id, tier, status, activated_at, expires_at)
       VALUES ($1, 'paid', 'active', NOW(), NOW() + INTERVAL '${expiresAtInterval}')
       RETURNING id, tier, status, activated_at, expires_at`,
      [tenantId],
    );

    newSubscription = subInsert.rows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 4. Fetch tenant email for notification and enqueue confirmation email (fire-and-forget)
  query(
    `SELECT u.email, u.full_name FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE u.tenant_id = $1 AND u.role = 'tenant_admin' LIMIT 1`,
    [tenantId],
  )
    .then(({ rows }) => {
      if (rows.length > 0) {
        return enqueueSubscriptionConfirmationEmail({
          tenantId,
          email: rows[0].email,
          fullName: rows[0].full_name,
          tier: 'paid',
          billingPeriod: paymentRecord.billing_period,
          amount: parseFloat(paymentRecord.amount),
          currency: paymentRecord.currency,
          activatedAt: newSubscription.activated_at,
          expiresAt: newSubscription.expires_at,
        });
      }
    })
    .catch((err) => {
      console.error('[subscriptionsService] Failed to enqueue subscription confirmation email:', err);
    });

  return {
    subscription: {
      id: newSubscription.id,
      tier: newSubscription.tier,
      status: newSubscription.status,
      activatedAt: newSubscription.activated_at,
      expiresAt: newSubscription.expires_at,
    },
    message: 'Subscription upgraded successfully. A confirmation email has been sent.',
  };
}

// ─── Task 10.2: Subscription expiry / downgrade ───────────────────────────────

/**
 * Find all expired paid subscriptions and downgrade them to free tier.
 *
 * Requirement 3.8:
 * - Downgrade to free tier
 * - Enqueue downgrade notification email
 * - Downgrade commits to DB before enqueuing email
 *
 * This function is intended to be called by a scheduled BullMQ job
 * (e.g., once per hour via repeatable job).
 *
 * @returns {Promise<{ downgraded: number }>}
 */
export async function downgradeExpiredSubscriptions() {
  const expiredResult = await pool.query(
    `SELECT s.id AS subscription_id, s.tenant_id
     FROM subscriptions s
     WHERE s.tier = 'paid'
       AND s.status = 'active'
       AND s.expires_at <= NOW()`,
  );

  const expired = expiredResult.rows;
  const results = [];

  for (const row of expired) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE subscriptions SET status = 'expired' WHERE id = $1`,
        [row.subscription_id],
      );

      await client.query(
        `INSERT INTO subscriptions (tenant_id, tier, status) VALUES ($1, 'free', 'active')`,
        [row.tenant_id],
      );

      await client.query('COMMIT');

      results.push(row.tenant_id);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[subscriptionExpiry] Failed to downgrade tenant ${row.tenant_id}:`, err.message);
    } finally {
      client.release();
    }
  }

  // Enqueue downgrade emails after all DB commits (fire-and-forget)
  for (const tenantId of results) {
    try {
      const userResult = await query(
        `SELECT email, full_name FROM users
         WHERE tenant_id = $1 AND role = 'tenant_admin'
         LIMIT 1`,
        [tenantId],
      );

      if (userResult.rows.length > 0) {
        await enqueueSubscriptionDowngradeEmail({
          tenantId,
          email: userResult.rows[0].email,
          fullName: userResult.rows[0].full_name,
          reason: 'subscription expiry',
        });
      }
    } catch (notifErr) {
      console.error(`[subscriptionExpiry] Failed to enqueue downgrade email for tenant ${tenantId}:`, notifErr.message);
    }
  }

  return { downgraded: results.length };
}
