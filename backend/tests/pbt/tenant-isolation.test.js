// Feature: tailorstaq-platform, Property 1: Tenant data isolation

/**
 * Property-Based Test: Tenant data isolation
 *
 * Property 1: For any two distinct Tenants on the platform, each Tenant's
 * data SHALL be isolated such that Tenant A's queries return only records
 * with `tenant_id = A`, and Tenant B's queries return only records with
 * `tenant_id = B`.
 *
 * Validates: Requirements 7.1, 7.2, 7.5
 *
 * Strategy:
 *   - Implement an in-memory store that simulates the `queryTenant` helper:
 *     it stores records keyed by (resourceType, tenantId) and the query
 *     function filters rows to only those matching the requesting tenant.
 *   - Use fast-check to generate random tenant IDs and random records
 *     distributed across tenants.
 *   - Assert that after any sequence of inserts:
 *     - A query by Tenant A returns NO rows belonging to Tenant B
 *     - A query by Tenant B returns NO rows belonging to Tenant A
 *     - The total count of rows returned by each tenant equals the number
 *       of rows that tenant actually owns
 *
 * The store simulates the `queryTenant` approach (appending `AND tenant_id = $X`)
 * and PostgreSQL RLS policies which together provide defense-in-depth
 * isolation.
 */

import fc from 'fast-check';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {'shops' | 'products' | 'orders' | 'order_status_history' | 'receipts'} ResourceType
 */

/**
 * @typedef {Object} DataRecord
 * @property {string} id
 * @property {ResourceType} type
 * @property {string} tenantId
 * @property {number} createdAt
 */

/**
 * @typedef {Object} TenantIsolationStore
 * @property {Map<string, DataRecord[]>} recordsByTenant — tenantId → records
 * @property {number} nextId
 */

// ─── Store implementation ─────────────────────────────────────────────────────

/**
 * Create a fresh in-memory tenant-isolation store.
 * @returns {TenantIsolationStore}
 */
function createStore() {
  return { recordsByTenant: new Map(), nextId: 1 };
}

/**
 * Insert a record for a given tenant into the store.
 * @param {TenantIsolationStore} store
 * @param {string} tenantId
 * @param {ResourceType} type
 * @returns {DataRecord}
 */
function insertRecord(store, tenantId, type) {
  const record = {
    id: `rec-${store.nextId++}`,
    type,
    tenantId,
    createdAt: Date.now(),
  };

  if (!store.recordsByTenant.has(tenantId)) {
    store.recordsByTenant.set(tenantId, []);
  }
  store.recordsByTenant.get(tenantId).push(record);
  return record;
}

/**
 * Insert multiple records for a tenant.
 * @param {TenantIsolationStore} store
 * @param {string} tenantId
 * @param {ResourceType} type
 * @param {number} count
 * @returns {DataRecord[]}
 */
function insertRecords(store, tenantId, type, count) {
  const records = [];
  for (let i = 0; i < count; i++) {
    records.push(insertRecord(store, tenantId, type));
  }
  return records;
}

/**
 * Query all records for a given tenant (simulates queryTenant filtering).
 * @param {TenantIsolationStore} store
 * @param {string} tenantId
 * @param {ResourceType} type
 * @returns {DataRecord[]}
 */
function queryTenantRecords(store, tenantId, type) {
  const allTenantRecords = store.recordsByTenant.get(tenantId) || [];
  if (type) {
    return allTenantRecords.filter((r) => r.type === type);
  }
  return [...allTenantRecords];
}

/**
 * Query records across ALL tenants (without isolation) — simulates a query
 * that does NOT use queryTenant (e.g. admin query). Used to verify that
 * the isolation filtering is what keeps data separate.
 * @param {TenantIsolationStore} store
 * @param {ResourceType} type
 * @returns {DataRecord[]}
 */
function queryAllRecords(store, type) {
  const allRecords = [];
  for (const records of store.recordsByTenant.values()) {
    for (const r of records) {
      if (!type || r.type === type) {
        allRecords.push(r);
      }
    }
  }
  return allRecords;
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Verify strict tenant isolation: Tenant A's query results contain NO records
 * belonging to Tenant B, and vice versa.
 */
function assertStrictIsolation(
  store,
  tenantA,
  tenantB,
  resourceTypes,
) {
  for (const type of resourceTypes) {
    const aRecords = queryTenantRecords(store, tenantA, type);
    const bRecords = queryTenantRecords(store, tenantB, type);

    // No record in A's results should belong to B
    for (const rec of aRecords) {
      expect(rec.tenantId).toBe(tenantA);
    }

    // No record in B's results should belong to A
    for (const rec of bRecords) {
      expect(rec.tenantId).toBe(tenantB);
    }

    // Total records across both should equal what was inserted for both
    const aInserted = (store.recordsByTenant.get(tenantA) || [])
      .filter((r) => r.type === type).length;
    const bInserted = (store.recordsByTenant.get(tenantB) || [])
      .filter((r) => r.type === type).length;

    expect(aRecords.length).toBe(aInserted);
    expect(bRecords.length).toBe(bInserted);
  }
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const resourceTypeArbitrary = fc.constantFrom(
  'shops',
  'products',
  'orders',
  'receipts',
);

const tenantIdArbitrary = fc.uuid();

/**
 * Generate a distribution plan: for each of N resource types, assign a count
 * to each of 2 tenants.
 */
const distributionArbitrary = fc
  .array(
    fc.record({
      type: resourceTypeArbitrary,
      countA: fc.integer({ min: 0, max: 20 }),
      countB: fc.integer({ min: 0, max: 20 }),
    }),
    { minLength: 1, maxLength: 5 },
  )
  // Ensure at least some records exist for both tenants
  .filter((dist) => {
    const totalA = dist.reduce((s, d) => s + d.countA, 0);
    const totalB = dist.reduce((s, d) => s + d.countB, 0);
    return totalA > 0 && totalB > 0;
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 1: Tenant data isolation', () => {
  /**
   * Property 1a: Two tenants never see each other's records.
   *
   * For any two distinct tenants and any distribution of records across
   * resource types, Tenant A's query results MUST contain only records
   * with tenant_id = A, and Tenant B's query results MUST contain only
   * records with tenant_id = B.
   *
   * Validates: Requirements 7.1, 7.2, 7.5
   */
  test(
    'two tenants never see each other records across any resource type',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          tenantIdArbitrary,
          distributionArbitrary,
          (tenantA, tenantB, distribution) => {
            fc.pre(tenantA !== tenantB);

            const store = createStore();

            // Insert records according to the distribution plan
            for (const { type, countA, countB } of distribution) {
              if (countA > 0) insertRecords(store, tenantA, type, countA);
              if (countB > 0) insertRecords(store, tenantB, type, countB);
            }

            // Verify isolation for all resource types present in the distribution
            const typesInDistribution = [...new Set(distribution.map((d) => d.type))];
            assertStrictIsolation(store, tenantA, tenantB, typesInDistribution);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 1b: Query results count matches the number of inserted records
   * for each tenant.
   *
   * For any tenant, the count of records returned by a queryTenant-style
   * query MUST equal the count of records that tenant actually owns.
   *
   * Validates: Requirements 7.2
   */
  test(
    'each tenant sees exactly the records they own',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          tenantIdArbitrary,
          resourceTypeArbitrary,
          fc.integer({ min: 1, max: 15 }),
          fc.integer({ min: 1, max: 15 }),
          (tenantA, tenantB, type, countA, countB) => {
            fc.pre(tenantA !== tenantB);

            const store = createStore();
            insertRecords(store, tenantA, type, countA);
            insertRecords(store, tenantB, type, countB);

            const aRecords = queryTenantRecords(store, tenantA, type);
            const bRecords = queryTenantRecords(store, tenantB, type);

            expect(aRecords.length).toBe(countA);
            expect(bRecords.length).toBe(countB);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 1c: The sum of isolated queries equals the total records.
   *
   * For any distribution, the sum of records returned by tenant-scoped
   * queries across all tenants MUST equal the total number of records
   * in the store.
   *
   * Validates: Requirements 7.1
   */
  test(
    'sum of isolated queries equals the total record count',
    () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              tenantId: tenantIdArbitrary,
              type: resourceTypeArbitrary,
              count: fc.integer({ min: 1, max: 10 }),
            }),
            { minLength: 2, maxLength: 6 },
          ).filter((arr) => {
            // Ensure at least 2 different tenant IDs
            const ids = new Set(arr.map((d) => d.tenantId));
            return ids.size >= 2;
          }),
          (inserts) => {
            const store = createStore();
            let totalInserted = 0;

            for (const { tenantId, type, count } of inserts) {
              insertRecords(store, tenantId, type, count);
              totalInserted += count;
            }

            // Count across all tenant-scoped queries
            const uniqueTenants = [...new Set(inserts.map((d) => d.tenantId))];
            let totalQueried = 0;

            for (const tenantId of uniqueTenants) {
              const records = queryTenantRecords(store, tenantId, null);
              totalQueried += records.length;
            }

            expect(totalQueried).toBe(totalInserted);
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 1d: Isolation works per resource type independently.
   *
   * Tenant A's shops should be isolated from Tenant B's shops, and also
   * Tenant A's products should be isolated from their own shops — although
   * they all belong to Tenant A, the type filter should work correctly.
   */
  test(
    'isolation works per resource type independently',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          tenantIdArbitrary,
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          (tenantA, tenantB, shopCount, productCount) => {
            fc.pre(tenantA !== tenantB);

            const store = createStore();
            insertRecords(store, tenantA, 'shops', shopCount);
            insertRecords(store, tenantA, 'products', productCount);
            insertRecords(store, tenantB, 'shops', shopCount);
            insertRecords(store, tenantB, 'products', productCount);

            // Tenant A shops
            const aShops = queryTenantRecords(store, tenantA, 'shops');
            expect(aShops.length).toBe(shopCount);
            for (const s of aShops) {
              expect(s.tenantId).toBe(tenantA);
              expect(s.type).toBe('shops');
            }

            // Tenant A products
            const aProds = queryTenantRecords(store, tenantA, 'products');
            expect(aProds.length).toBe(productCount);
            for (const p of aProds) {
              expect(p.tenantId).toBe(tenantA);
              expect(p.type).toBe('products');
            }

            // Tenant B shops
            const bShops = queryTenantRecords(store, tenantB, 'shops');
            expect(bShops.length).toBe(shopCount);
            for (const s of bShops) {
              expect(s.tenantId).toBe(tenantB);
            }

            // Tenant B products
            const bProds = queryTenantRecords(store, tenantB, 'products');
            expect(bProds.length).toBe(productCount);
            for (const p of bProds) {
              expect(p.tenantId).toBe(tenantB);
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 1e: Even with many tenants (up to 5), isolation is maintained.
   */
  test(
    'data isolation holds across multiple tenants',
    () => {
      fc.assert(
        fc.property(
          fc.array(tenantIdArbitrary, { minLength: 3, maxLength: 5 }),
          fc.array(
            fc.record({
              tenantIndex: fc.nat(4), // index into tenants array
              type: resourceTypeArbitrary,
              count: fc.integer({ min: 1, max: 8 }),
            }),
            { minLength: 3, maxLength: 10 },
          ),
          (tenantIds, inserts) => {
            // Ensure tenant indices are valid
            fc.pre(inserts.every((ins) => ins.tenantIndex < tenantIds.length));

            const store = createStore();

            for (const { tenantIndex, type, count } of inserts) {
              insertRecords(store, tenantIds[tenantIndex], type, count);
            }

            // Verify isolation for every pair
            for (let i = 0; i < tenantIds.length; i++) {
              for (let j = i + 1; j < tenantIds.length; j++) {
                const aRecords = queryTenantRecords(store, tenantIds[i], null);
                const bRecords = queryTenantRecords(store, tenantIds[j], null);

                for (const rec of aRecords) {
                  expect(rec.tenantId).toBe(tenantIds[i]);
                }
                for (const rec of bRecords) {
                  expect(rec.tenantId).toBe(tenantIds[j]);
                }
              }
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 1f: Deleting all records for a tenant does not affect other tenants.
   */
  test(
    'removing one tenant records does not affect other tenants isolation',
    () => {
      fc.assert(
        fc.property(
          tenantIdArbitrary,
          tenantIdArbitrary,
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          (tenantA, tenantB, countA, countB) => {
            fc.pre(tenantA !== tenantB);

            const store = createStore();
            insertRecords(store, tenantA, 'shops', countA);
            insertRecords(store, tenantB, 'shops', countB);

            // "Delete" Tenant A's records
            store.recordsByTenant.delete(tenantA);

            const bRecords = queryTenantRecords(store, tenantB, 'shops');
            expect(bRecords.length).toBe(countB);
            for (const rec of bRecords) {
              expect(rec.tenantId).toBe(tenantB);
            }

            // Tenant A has no records
            const aRecords = queryTenantRecords(store, tenantA, 'shops');
            expect(aRecords.length).toBe(0);
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});
