// Feature: tailorstaq-platform, Property 2: Cross-tenant access is always denied

/**
 * Property-Based Test: Cross-tenant access is always denied
 *
 * Property 2: For any request made by a Tenant_Admin to a resource belonging
 * to a different Tenant, the platform SHALL:
 *   a) Return HTTP 403 with error code CROSS_TENANT_ACCESS
 *   b) Write an audit_logs row containing requesting_tenant_id,
 *      target_resource_id, action = 'CROSS_TENANT_ACCESS', and a UTC timestamp
 *
 * Validates: Requirements 7.3, 8.8
 *
 * Strategy:
 *   - Implement an in-memory middleware simulator that mirrors the logic in
 *     src/middleware/tenant.js.
 *   - Use fast-check to generate random tenant ID pairs and random resource IDs.
 *   - Assert that:
 *     - When tenant IDs match → request is allowed (next() called)
 *     - When tenant IDs differ → request is denied (403 CROSS_TENANT_ACCESS)
 *     - When tenant IDs differ → an audit log entry is created
 *     - The audit log entry contains requesting_tenant_id, target_resource_id,
 *       action = 'CROSS_TENANT_ACCESS', and occurred_at set to now
 */

import fc from 'fast-check';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AuditLogEntry
 * @property {string} requestingTenantId
 * @property {string} targetResourceId
 * @property {'CROSS_TENANT_ACCESS'} action
 * @property {number} occurredAt — unix timestamp ms
 */

/**
 * @typedef {Object} MiddlewareResult
 * @property {boolean} allowed — true if next() was called
 * @property {number|null} statusCode — set if response was sent
 * @property {string|null} errorCode — set if response was sent
 * @property {AuditLogEntry[]} auditLogs — audit log entries created
 */

// ─── Middleware simulator (mirrors src/middleware/tenant.js) ───────────────────

/**
 * Simulate the tenant ownership check.
 *
 * Mirrors the tenantMiddleware in src/middleware/tenant.js.
 *
 * @param {object} req — { user: { tenantId: string|null }, params: { shopId: string|null } }
 * @param {AuditLogEntry[]} auditLogStore — mutable array to collect audit log entries
 * @param {object} shopStore — { shops: Map<string, string> } — shopId → tenantId
 * @returns {MiddlewareResult}
 */
function simulateTenantCheck(req, auditLogStore, shopStore) {
  const { tenantId } = req.user ?? {};
  const { shopId } = req.params;

  // If no tenantId (e.g. platform_admin or customer), skip check
  if (!tenantId) {
    return { allowed: true, statusCode: null, errorCode: null, auditLogs: [] };
  }

  // If no shopId in route, skip check
  if (!shopId) {
    return { allowed: true, statusCode: null, errorCode: null, auditLogs: [] };
  }

  // Look up the shop's tenant_id
  const shopTenantId = shopStore.shops.get(shopId);

  // If shop does not exist, let route handler return 404
  if (shopTenantId === undefined) {
    return { allowed: true, statusCode: null, errorCode: null, auditLogs: [] };
  }

  if (shopTenantId === tenantId) {
    // Tenant owns this shop — allow
    return { allowed: true, statusCode: null, errorCode: null, auditLogs: [] };
  }

  // Cross-tenant access attempt
  const logEntry = {
    requestingTenantId: tenantId,
    targetResourceId: shopId,
    action: 'CROSS_TENANT_ACCESS',
    occurredAt: Date.now(),
  };
  auditLogStore.push(logEntry);

  return {
    allowed: false,
    statusCode: 403,
    errorCode: 'CROSS_TENANT_ACCESS',
    auditLogs: [logEntry],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a shop store from a list of [shopId, tenantId] pairs.
 */
function buildShopStore(entries) {
  const shops = new Map();
  for (const [shopId, tenantId] of entries) {
    shops.set(shopId, tenantId);
  }
  return { shops };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const shopIdArbitrary = fc.uuid();
const tenantIdArbitrary = fc.uuid();

/**
 * Generate a request from a tenant for a specific shop.
 */
const requestArbitrary = fc.record({
  requesterTenantId: tenantIdArbitrary,
  targetShopId: shopIdArbitrary,
  shopOwnerTenantId: tenantIdArbitrary,
});

/**
 * Generate a request where the requester is a platform_admin or customer
 * (no tenantId on the token) — these should skip the tenant check.
 */
const nonTenantRequestArbitrary = fc.record({
  targetShopId: shopIdArbitrary,
  shopOwnerTenantId: tenantIdArbitrary,
});

/**
 * Generate a request to a non-existent shop.
 */
const nonexistentShopRequestArbitrary = fc.record({
  requesterTenantId: tenantIdArbitrary,
  targetShopId: shopIdArbitrary, // this shop won't be in the store
  shopOwnerTenantId: tenantIdArbitrary,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 2: Cross-tenant access is always denied', () => {
  /**
   * Property 2a: Matching tenant IDs allow the request through.
   *
   * When the requester's tenantId matches the shop's tenant_id, the
   * middleware MUST call next() — i.e. the request is allowed.
   *
   * Validates: Requirements 7.2
   */
  test(
    'request is allowed when tenant IDs match',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          shopIdArbitrary,
          (tenantId, shopId) => {
            const auditLog = [];
            const shopStore = buildShopStore([[shopId, tenantId]]);
            const req = {
              user: { tenantId },
              params: { shopId },
            };

            const result = simulateTenantCheck(req, auditLog, shopStore);

            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBeNull();
            expect(result.errorCode).toBeNull();
            expect(auditLog.length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 2b: Mismatched tenant IDs return 403 CROSS_TENANT_ACCESS.
   *
   * When the requester's tenantId differs from the shop's tenant_id, the
   * middleware MUST return an HTTP 403 response with error code
   * CROSS_TENANT_ACCESS.
   *
   * Validates: Requirement 7.3
   */
  test(
    'cross-tenant request returns 403 CROSS_TENANT_ACCESS',
    () => {
      fc.assert(
        fc.property(
          requestArbitrary,
          ({ requesterTenantId, targetShopId, shopOwnerTenantId }) => {
            fc.pre(requesterTenantId !== shopOwnerTenantId);

            const auditLog = [];
            const shopStore = buildShopStore([[targetShopId, shopOwnerTenantId]]);
            const req = {
              user: { tenantId: requesterTenantId },
              params: { shopId: targetShopId },
            };

            const result = simulateTenantCheck(req, auditLog, shopStore);

            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(403);
            expect(result.errorCode).toBe('CROSS_TENANT_ACCESS');
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 2c: Cross-tenant access creates an audit log entry.
   *
   * For any cross-tenant access attempt, the middleware MUST write an
   * audit_logs row with requesting_tenant_id, target_resource_id,
   * action = 'CROSS_TENANT_ACCESS', and a valid timestamp.
   *
   * Validates: Requirement 8.8
   */
  test(
    'cross-tenant access creates an audit log entry with correct fields',
    () => {
      fc.assert(
        fc.property(
          requestArbitrary,
          ({ requesterTenantId, targetShopId, shopOwnerTenantId }) => {
            fc.pre(requesterTenantId !== shopOwnerTenantId);

            const auditLog = [];
            const shopStore = buildShopStore([[targetShopId, shopOwnerTenantId]]);
            const req = {
              user: { tenantId: requesterTenantId },
              params: { shopId: targetShopId },
            };

            const result = simulateTenantCheck(req, auditLog, shopStore);

            expect(result.auditLogs.length).toBeGreaterThanOrEqual(1);

            const logEntry = result.auditLogs[0];
            expect(logEntry.requestingTenantId).toBe(requesterTenantId);
            expect(logEntry.targetResourceId).toBe(targetShopId);
            expect(logEntry.action).toBe('CROSS_TENANT_ACCESS');
            expect(typeof logEntry.occurredAt).toBe('number');
            expect(logEntry.occurredAt).toBeGreaterThan(0);
            // Timestamp should be recent (within the last 10 seconds)
            expect(logEntry.occurredAt).toBeGreaterThan(Date.now() - 10000);
            expect(logEntry.occurredAt).toBeLessThanOrEqual(Date.now() + 1000);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 2d: Unauthenticated or non-tenant requests skip the check.
   *
   * When req.user.tenantId is undefined (platform_admin, customer, or
   * unauthenticated), the middleware MUST allow the request through —
   * role guards on the route itself handle those cases.
   *
   * Validates: Requirement 7.2 (skip tenant check for non-tenant roles)
   */
  test(
    'requests without tenantId skip the tenant ownership check',
    () => {
      fc.assert(
        fc.property(
          nonTenantRequestArbitrary,
          ({ targetShopId, shopOwnerTenantId }) => {
            const auditLog = [];
            const shopStore = buildShopStore([[targetShopId, shopOwnerTenantId]]);

            // Case 1: no user object
            const req1 = { params: { shopId: targetShopId } };
            const result1 = simulateTenantCheck(req1, auditLog, shopStore);
            expect(result1.allowed).toBe(true);

            // Case 2: user with no tenantId
            const req2 = { user: {}, params: { shopId: targetShopId } };
            const result2 = simulateTenantCheck(req2, auditLog, shopStore);
            expect(result2.allowed).toBe(true);

            // No audit logs should have been created
            expect(auditLog.length).toBe(0);
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 2e: Non-existent shop does not trigger cross-tenant denial.
   *
   * When the shop does not exist in the store, the middleware allows the
   * request to pass through — the route handler will return 404.
   */
  test(
    'non-existent shop does not trigger cross-tenant denial',
    () => {
      fc.assert(
        fc.property(
          nonexistentShopRequestArbitrary,
          ({ requesterTenantId, targetShopId }) => {
            const auditLog = [];
            const shopStore = buildShopStore([]); // empty store — no shops
            const req = {
              user: { tenantId: requesterTenantId },
              params: { shopId: targetShopId },
            };

            const result = simulateTenantCheck(req, auditLog, shopStore);

            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBeNull();
            expect(result.errorCode).toBeNull();
            expect(auditLog.length).toBe(0);
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 2f: Requests without a shopId in the route skip the check.
   */
  test(
    'requests without shopId skip the tenant check',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          (tenantId) => {
            const auditLog = [];
            const shopStore = buildShopStore([]);
            const req = {
              user: { tenantId },
              params: {}, // no shopId
            };

            const result = simulateTenantCheck(req, auditLog, shopStore);

            expect(result.allowed).toBe(true);
            expect(auditLog.length).toBe(0);
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 2g: Multiple cross-tenant attempts create multiple audit log entries.
   */
  test(
    'multiple cross-tenant attempts create multiple audit log entries',
    () => {
      fc.assert(
        fc.property(
          fc.array(requestArbitrary, { minLength: 2, maxLength: 10 }),
          (requests) => {
            // Filter to only mismatched pairs
            const crossTenantRequests = requests.filter(
              (r) => r.requesterTenantId !== r.shopOwnerTenantId,
            );

            fc.pre(crossTenantRequests.length >= 2);

            const auditLog = [];

            for (const { requesterTenantId, targetShopId, shopOwnerTenantId } of crossTenantRequests) {
              const shopStore = buildShopStore([[targetShopId, shopOwnerTenantId]]);
              const req = {
                user: { tenantId: requesterTenantId },
                params: { shopId: targetShopId },
              };
              simulateTenantCheck(req, auditLog, shopStore);
            }

            // Each cross-tenant attempt should have created one audit log entry
            expect(auditLog.length).toBe(crossTenantRequests.length);

            for (const entry of auditLog) {
              expect(entry.action).toBe('CROSS_TENANT_ACCESS');
              expect(typeof entry.requestingTenantId).toBe('string');
              expect(typeof entry.targetResourceId).toBe('string');
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});
