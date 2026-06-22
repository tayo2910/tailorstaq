// Feature: tailorstaq-platform, Property 11: Subscription downgrade on payment failure

/**
 * Property-Based Test: Subscription downgrade on payment failure
 *
 * Property 11: For any paid Subscription that has passed its expiry date,
 * the platform SHALL downgrade the tenant to the Free tier regardless of
 * whether the downgrade notification email is successfully delivered.
 *
 * Validates: Requirements 3.8
 *
 * Strategy:
 *   - Implement an in-memory state machine that simulates a tenant's
 *     subscription lifecycle: active paid → query for expired → downgrade.
 *   - Inline the core downgrade logic (find expired subscriptions, expire
 *     the old one, insert a new free-tier row) with a configurable email
 *     notification that can either succeed or fail.
 *   - Use fast-check to generate random future expiry timestamps and
 *     email delivery outcomes.
 *   - Assert that after the downgrade process:
 *     - The old paid subscription is marked as 'expired'
 *     - A new 'free' subscription with status 'active' exists
 *     - The tenant is on the free tier regardless of email success/failure
 */

import fc from 'fast-check';

// ─── Subscription state types ────────────────────────────────────────────────

/**
 * @typedef {Object} SubscriptionRow
 * @property {string}  id
 * @property {'free' | 'paid'} tier
 * @property {'active' | 'expired'} status
 * @property {number}  activatedAt  — unix timestamp ms
 * @property {number|null} expiresAt — unix timestamp ms, null for free tier
 * @property {string}  tenantId
 */

/**
 * @typedef {Object} TenantSubscriptions
 * @property {string} tenantId
 * @property {SubscriptionRow[]} subscriptions — ordered by activatedAt desc
 */

// ─── In-memory subscription store ────────────────────────────────────────────

/**
 * Create an empty subscription store (simulates the DB).
 * @returns {{ tenants: Map<string, TenantSubscriptions> }}
 */
function createStore() {
  return { tenants: new Map() };
}

let subCounter = 0;

/**
 * Add a paid subscription for a tenant (simulates confirmUpgrade).
 * @param {import('./types').SubscriptionStore} store
 * @param {string} tenantId
 * @param {number} expiresAt — unix timestamp ms
 */
function addPaidSubscription(store, tenantId, expiresAt) {
  subCounter++;
  const sub = {
    id: `sub-${subCounter}`,
    tier: 'paid',
    status: 'active',
    activatedAt: Date.now(),
    expiresAt,
    tenantId,
  };

  if (!store.tenants.has(tenantId)) {
    store.tenants.set(tenantId, { tenantId, subscriptions: [] });
  }
  store.tenants.get(tenantId).subscriptions.push(sub);
}

/**
 * Add a free subscription for a tenant.
 * @param {import('./types').SubscriptionStore} store
 * @param {string} tenantId
 */
function addFreeSubscription(store, tenantId) {
  subCounter++;
  const sub = {
    id: `sub-${subCounter}`,
    tier: 'free',
    status: 'active',
    activatedAt: Date.now(),
    expiresAt: null,
    tenantId,
  };

  if (!store.tenants.has(tenantId)) {
    store.tenants.set(tenantId, { tenantId, subscriptions: [] });
  }
  store.tenants.get(tenantId).subscriptions.push(sub);
}

// ─── Core downgrade logic (mirrors downgradeExpiredSubscriptions) ──────────────

/**
 * Find all expired active paid subscriptions in the store.
 *
 * @param {import('./types').SubscriptionStore} store
 * @param {number} now — current time in ms (injected for testability)
 * @returns {SubscriptionRow[]}
 */
function findExpiredSubscriptions(store, now) {
  const expired = [];
  for (const entry of store.tenants.values()) {
    for (const sub of entry.subscriptions) {
      if (sub.tier === 'paid' && sub.status === 'active' && sub.expiresAt !== null && sub.expiresAt <= now) {
        expired.push(sub);
      }
    }
  }
  return expired;
}

/**
 * Downgrade a single expired subscription: expire the old one, insert free tier.
 *
 * Mirrors the inner loop of downgradeExpiredSubscriptions().
 *
 * @param {import('./types').SubscriptionStore} store
 * @param {SubscriptionRow} expiredSub
 * @param {boolean} emailSucceeds — whether the notification email (simulated) succeeds
 * @returns {{ downgraded: boolean, emailSent: boolean, emailError: string | null }}
 */
function downgradeSubscription(store, expiredSub, emailSucceeds) {
  // Step 1: Expire the paid subscription
  expiredSub.status = 'expired';

  // Step 2: Insert a new free subscription
  subCounter++;
  const freeSub = {
    id: `sub-${subCounter}`,
    tier: 'free',
    status: 'active',
    activatedAt: Date.now(),
    expiresAt: null,
    tenantId: expiredSub.tenantId,
  };
  store.tenants.get(expiredSub.tenantId).subscriptions.push(freeSub);

  // Step 3: Simulate email notification (may fail)
  let emailSent = false;
  let emailError = null;
  if (!emailSucceeds) {
    emailError = 'EMAIL_DELIVERY_FAILED';
  } else {
    emailSent = true;
  }

  return { downgraded: true, emailSent, emailError };
}

/**
 * Run the full downgrade process for all expired subscriptions.
 *
 * Mirrors downgradeExpiredSubscriptions().
 *
 * @param {import('./types').SubscriptionStore} store
 * @param {number} now
 * @param {(sub: SubscriptionRow) => boolean} emailOutcomeFn — determines per-sub email success
 * @returns {{ downgraded: number, results: Array<{ tenantId: string, emailSent: boolean, emailError: string|null }> }}
 */
function runDowngradeProcess(store, now, emailOutcomeFn) {
  const expired = findExpiredSubscriptions(store, now);
  const results = [];

  for (const sub of expired) {
    const emailSucceeds = emailOutcomeFn(sub);
    const result = downgradeSubscription(store, sub, emailSucceeds);
    results.push({
      tenantId: sub.tenantId,
      emailSent: result.emailSent,
      emailError: result.emailError,
    });
  }

  return { downgraded: results.length, results };
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Verify the post-downgrade state of a tenant:
 * - The old paid subscription is marked as 'expired'
 * - The most recent subscription is 'free' and 'active'
 * - Tenant is effectively on free tier regardless of email outcome
 *
 * @param {import('./types').SubscriptionStore} store
 * @param {string} tenantId
 * @param {string} oldSubId
 */
function assertTenantOnFreeTier(store, tenantId, oldSubId) {
  const entry = store.tenants.get(tenantId);
  expect(entry).toBeDefined();

  // Find the old subscription — must be expired
  const oldSub = entry.subscriptions.find((s) => s.id === oldSubId);
  expect(oldSub).toBeDefined();
  expect(oldSub.status).toBe('expired');

  // The most recently added subscription must be free and active
  const sorted = [...entry.subscriptions].sort(
    (a, b) => b.activatedAt - a.activatedAt,
  );
  const latest = sorted[0];
  expect(latest.tier).toBe('free');
  expect(latest.status).toBe('active');
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * Generate future expiry timestamps (already past -> should trigger downgrade).
 * We use timestamps at least 1ms in the past from the reference "now".
 */
const expiredTimestampArbitrary = fc.integer({
  min: 1,
  max: 1_000_000_000, // well in the past (ms relative to epoch)
});

/**
 * Generate an email outcome function that may succeed or fail randomly.
 * Returns a function that returns true/false per subscription.
 */
const emailOutcomeArbitrary = fc.boolean();

/**
 * Generate the number of expired subscriptions to simulate (1–10).
 */
const expiredCountArbitrary = fc.integer({ min: 1, max: 10 });

/**
 * Generate individual tenant ID strings.
 */
const tenantIdArbitrary = fc.uuid();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 11: Subscription downgrade on payment failure', () => {
  /**
   * Property 11a: Expired paid subscriptions are always downgraded to free tier.
   *
   * For any tenant with an expired paid subscription, the downgrade process
   * MUST transition the tenant to the free tier.
   *
   * Validates: Requirement 3.8
   */
  test(
    'expired paid subscriptions are always downgraded to free tier',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          expiredTimestampArbitrary,
          (tenantId, expiredAt) => {
            const store = createStore();
            addPaidSubscription(store, tenantId, expiredAt);
            const now = Date.now();

            // All should be expired (expiredAt <= now)
            const result = runDowngradeProcess(store, now, () => true);

            expect(result.downgraded).toBe(1);
            const entry = store.tenants.get(tenantId);
            const subscriptions = entry.subscriptions;
            const oldPaid = subscriptions.find((s) => s.tier === 'paid');
            const latestFree = subscriptions.find((s) => s.tier === 'free');

            expect(oldPaid.status).toBe('expired');
            expect(latestFree).toBeDefined();
            expect(latestFree.status).toBe('active');
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 11b: Downgrade persists even when the notification email fails.
   *
   * For any expired subscription with any email delivery outcome (success or
   * failure), the DB state MUST reflect the downgrade (paid→expired,
   * free→active).
   *
   * Validates: Requirement 3.8 — "downgrade commits to DB before enqueuing email"
   */
  test(
    'downgrade persists even when the notification email fails',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          expiredTimestampArbitrary,
          emailOutcomeArbitrary,
          (tenantId, expiredAt, emailSucceeds) => {
            const store = createStore();
            addPaidSubscription(store, tenantId, expiredAt);
            const now = Date.now();

            const result = runDowngradeProcess(store, now, () => emailSucceeds);

            expect(result.downgraded).toBe(1);
            expect(result.results[0].emailSent).toBe(emailSucceeds);
            if (!emailSucceeds) {
              expect(result.results[0].emailError).toBe('EMAIL_DELIVERY_FAILED');
            } else {
              expect(result.results[0].emailError).toBeNull();
            }

            // Verify DB state regardless of email outcome
            const entry = store.tenants.get(tenantId);
            const subscriptions = entry.subscriptions;
            const oldPaid = subscriptions.find((s) => s.tier === 'paid');
            const freeSub = subscriptions.find((s) => s.tier === 'free');

            expect(oldPaid.status).toBe('expired');
            expect(freeSub.status).toBe('active');
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 11c: Multiple expired subscriptions across tenants are all downgraded.
   *
   * For N tenants each with an expired paid subscription, the downgrade process
   * MUST downgrade all N of them, regardless of individual email outcomes.
   *
   * Validates: Requirement 3.8
   */
  test(
    'multiple expired subscriptions across tenants are all downgraded',
    () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(tenantIdArbitrary, expiredTimestampArbitrary), { minLength: 1, maxLength: 10 }),
          (tenants) => {
            const store = createStore();
            for (const [tenantId, expiredAt] of tenants) {
              addPaidSubscription(store, tenantId, expiredAt);
            }
            const now = Date.now();

            // Alternate email outcomes per tenant
            let emailToggle = false;
            const result = runDowngradeProcess(store, now, () => {
              emailToggle = !emailToggle;
              return emailToggle;
            });

            expect(result.downgraded).toBe(tenants.length);

            // Verify every tenant is on free tier
            for (const [tenantId] of tenants) {
              const entry = store.tenants.get(tenantId);
              const subscriptions = entry.subscriptions;
              const freeSubs = subscriptions.filter((s) => s.tier === 'free' && s.status === 'active');
              expect(freeSubs.length).toBeGreaterThanOrEqual(1);
              const paidActiveSubs = subscriptions.filter(
                (s) => s.tier === 'paid' && s.status === 'active',
              );
              expect(paidActiveSubs.length).toBe(0);
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 11d: Active (non-expired) paid subscriptions are NEVER downgraded.
   *
   * For a paid subscription whose expires_at is in the future, the downgrade
   * process MUST NOT change its status.
   *
   * Validates: Requirement 3.8 (only expired subs are downgraded)
   */
  test(
    'active paid subscriptions with future expiry are never downgraded',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          // Generate a timestamp far in the future (+1 year from reference now)
          fc.integer({ min: Date.now() + 31_536_000_000, max: Date.now() + 63_072_000_000 }),
          (tenantId, futureExpiry) => {
            const store = createStore();
            addPaidSubscription(store, tenantId, futureExpiry);
            const now = Date.now();

            const result = runDowngradeProcess(store, now, () => true);

            // The subscription should NOT have been downgraded
            expect(result.downgraded).toBe(0);

            // The paid subscription should still be active
            const entry = store.tenants.get(tenantId);
            const paidSub = entry.subscriptions.find((s) => s.tier === 'paid');
            expect(paidSub.status).toBe('active');
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 11e: A tenant downgraded then re-upgraded will be downgraded again
   * when the new paid subscription expires.
   *
   * Tests the full lifecycle: free → paid → expired → free → paid → expired → free.
   *
   * Validates: Requirement 3.8 (downgrade works across multiple cycles)
   */
  test(
    'downgrade works correctly across multiple paid→free cycles',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          expiredTimestampArbitrary,
          (tenantId, expiredAt) => {
            const store = createStore();
            const now = Date.now();

            // Start with a free subscription
            addFreeSubscription(store, tenantId);

            // Upgrade to paid (simulate confirmUpgrade)
            addPaidSubscription(store, tenantId, expiredAt);

            // First downgrade cycle
            const result1 = runDowngradeProcess(store, now, () => true);
            expect(result1.downgraded).toBe(1);

            // Verify free tier
            let entry = store.tenants.get(tenantId);
            let latestSubs = [...entry.subscriptions].sort(
              (a, b) => b.activatedAt - a.activatedAt,
            );
            expect(latestSubs[0].tier).toBe('free');
            expect(latestSubs[0].status).toBe('active');

            // Upgrade again
            addPaidSubscription(store, tenantId, expiredAt);

            // Second downgrade
            const result2 = runDowngradeProcess(store, now, () => false);
            expect(result2.downgraded).toBe(1);

            // Verify free tier again, even though email failed
            entry = store.tenants.get(tenantId);
            latestSubs = [...entry.subscriptions].sort(
              (a, b) => b.activatedAt - a.activatedAt,
            );
            expect(latestSubs[0].tier).toBe('free');
            expect(latestSubs[0].status).toBe('active');
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 11f: Downgrade only affects the specific expired subscription,
   * not other active subscriptions from different tenants.
   */
  test(
    'downgrade does not affect other tenants with active subscriptions',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          tenantIdArbitrary,
          expiredTimestampArbitrary,
          (expiredTenant, activeTenant, expiredAt) => {
            // Ensure tenant IDs differ
            fc.pre(expiredTenant !== activeTenant);

            const store = createStore();
            const now = Date.now();

            // One tenant with expired subscription
            addPaidSubscription(store, expiredTenant, expiredAt);

            // Another tenant with a future-expiry subscription
            addPaidSubscription(store, activeTenant, now + 86_400_000 + expiredAt % 86_400_000);

            const result = runDowngradeProcess(store, now, () => true);

            // Only the expired tenant should be downgraded
            expect(result.downgraded).toBe(1);

            // Expired tenant is now on free tier
            const expiredEntry = store.tenants.get(expiredTenant);
            const expiredLatest = [...expiredEntry.subscriptions].sort(
              (a, b) => b.activatedAt - a.activatedAt,
            )[0];
            expect(expiredLatest.tier).toBe('free');

            // Active tenant should still be on paid
            const activeEntry = store.tenants.get(activeTenant);
            const activePaid = activeEntry.subscriptions.find(
              (s) => s.tier === 'paid',
            );
            expect(activePaid.status).toBe('active');
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});
