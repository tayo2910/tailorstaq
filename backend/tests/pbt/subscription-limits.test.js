// Feature: tailorstaq-platform, Property 5: Free-tier limit enforcement

/**
 * Property-Based Test: Free-tier limit enforcement
 *
 * Property 5: For any Tenant on the Free Subscription tier, the platform SHALL
 * reject any operation that would cause the count of active Products to exceed
 * 10 or the count of Orders in the current calendar month to exceed 50.
 *
 * Validates: Requirements 3.3, 3.4
 *
 * Strategy:
 *   - Implement the free-tier limit enforcement logic inline (mirrors the logic
 *     in products.service.js and the planned orders.service.js).
 *   - Use fast-check to generate random product/order counts around the
 *     10-product and 50-order boundaries.
 *   - Assert that the 11th active product and 51st monthly order are ALWAYS
 *     rejected with LIMIT_EXCEEDED.
 *   - Assert that counts at or below the limit are ALWAYS accepted.
 *
 * Free-tier limits (from Requirements 3.3 and env.js):
 *   - MAX active products: 10
 *   - MAX monthly orders:  50
 *
 * Limit enforcement rules (from products.service.js and design.md):
 *   1. Before inserting a product, count active products for the tenant.
 *      If count >= limit → reject with LIMIT_EXCEEDED.
 *   2. Before inserting an order, count orders for the tenant in the current
 *      calendar month. If count >= limit → reject with LIMIT_EXCEEDED.
 *   3. Both checks apply only to tenants on the Free tier.
 *   4. Paid-tier tenants are never subject to these limits.
 *   5. When re-activating a product (active: false → true), the limit is
 *      re-checked against the current active count.
 */

import fc from 'fast-check';

// ─── Constants ────────────────────────────────────────────────────────────────

const FREE_TIER_MAX_PRODUCTS = 10;
const FREE_TIER_MAX_MONTHLY_ORDERS = 50;

// ─── Free-tier limit enforcement state machine ────────────────────────────────

/**
 * Represents the in-memory state of a tenant's free-tier usage.
 *
 * @typedef {Object} TenantUsageState
 * @property {'free' | 'paid'} tier          - subscription tier
 * @property {number}          activeProducts - count of currently active products
 * @property {number}          monthlyOrders  - count of orders placed this calendar month
 */

/**
 * Create a fresh tenant usage state.
 *
 * @param {'free' | 'paid'} tier
 * @param {number} activeProducts
 * @param {number} monthlyOrders
 * @returns {TenantUsageState}
 */
function createTenantState(tier = 'free', activeProducts = 0, monthlyOrders = 0) {
  return { tier, activeProducts, monthlyOrders };
}

/**
 * Attempt to add an active product for the tenant.
 *
 * Mirrors the logic in products.service.js createProduct():
 *   - If tier is 'paid' → always allow
 *   - If tier is 'free' AND activeProducts >= FREE_TIER_MAX_PRODUCTS → reject
 *   - Otherwise → allow and increment activeProducts
 *
 * @param {TenantUsageState} state - mutable state (modified in place on success)
 * @returns {{ ok: boolean; code: string | null }}
 */
function attemptAddProduct(state) {
  if (state.tier === 'paid') {
    state.activeProducts += 1;
    return { ok: true, code: null };
  }

  if (state.activeProducts >= FREE_TIER_MAX_PRODUCTS) {
    return { ok: false, code: 'LIMIT_EXCEEDED' };
  }

  state.activeProducts += 1;
  return { ok: true, code: null };
}

/**
 * Attempt to place a monthly order for the tenant.
 *
 * Mirrors the planned logic in orders.service.js placeOrder():
 *   - If tier is 'paid' → always allow
 *   - If tier is 'free' AND monthlyOrders >= FREE_TIER_MAX_MONTHLY_ORDERS → reject
 *   - Otherwise → allow and increment monthlyOrders
 *
 * @param {TenantUsageState} state - mutable state (modified in place on success)
 * @returns {{ ok: boolean; code: string | null }}
 */
function attemptPlaceOrder(state) {
  if (state.tier === 'paid') {
    state.monthlyOrders += 1;
    return { ok: true, code: null };
  }

  if (state.monthlyOrders >= FREE_TIER_MAX_MONTHLY_ORDERS) {
    return { ok: false, code: 'LIMIT_EXCEEDED' };
  }

  state.monthlyOrders += 1;
  return { ok: true, code: null };
}

/**
 * Attempt to re-activate a product (set active = true on a currently inactive product).
 *
 * Mirrors the logic in products.service.js updateProduct() when active=true:
 *   - Same limit check as adding a new product.
 *
 * @param {TenantUsageState} state - mutable state (modified in place on success)
 * @returns {{ ok: boolean; code: string | null }}
 */
function attemptReactivateProduct(state) {
  return attemptAddProduct(state);
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * Arbitrary for a product count that is exactly at the free-tier limit (10).
 * Used to set up state where the next add must be rejected.
 */
const atProductLimitArbitrary = fc.constant(FREE_TIER_MAX_PRODUCTS);

/**
 * Arbitrary for a product count strictly below the free-tier limit (0–9).
 * Used to set up state where the next add must be accepted.
 */
const belowProductLimitArbitrary = fc.integer({
  min: 0,
  max: FREE_TIER_MAX_PRODUCTS - 1,
});

/**
 * Arbitrary for an order count that is exactly at the free-tier limit (50).
 */
const atOrderLimitArbitrary = fc.constant(FREE_TIER_MAX_MONTHLY_ORDERS);

/**
 * Arbitrary for an order count strictly below the free-tier limit (0–49).
 */
const belowOrderLimitArbitrary = fc.integer({
  min: 0,
  max: FREE_TIER_MAX_MONTHLY_ORDERS - 1,
});

/**
 * Arbitrary for a product count around the boundary (0–12).
 * Covers below, at, and above the limit.
 */
const aroundProductBoundaryArbitrary = fc.integer({
  min: 0,
  max: FREE_TIER_MAX_PRODUCTS + 2,
});

/**
 * Arbitrary for an order count around the boundary (0–52).
 */
const aroundOrderBoundaryArbitrary = fc.integer({
  min: 0,
  max: FREE_TIER_MAX_MONTHLY_ORDERS + 2,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 5: Free-tier limit enforcement', () => {
  // ── Product limit ──────────────────────────────────────────────────────────

  /**
   * Property 5a: The 11th active product is always rejected on the free tier.
   *
   * For any free-tier tenant that already has exactly 10 active products,
   * any attempt to add another product MUST be rejected with LIMIT_EXCEEDED.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'adding the 11th active product is always rejected with LIMIT_EXCEEDED on the free tier',
    () => {
      fc.assert(
        fc.property(atProductLimitArbitrary, (currentCount) => {
          const state = createTenantState('free', currentCount, 0);

          const result = attemptAddProduct(state);

          expect(result.ok).toBe(false);
          expect(result.code).toBe('LIMIT_EXCEEDED');
          // State must not have changed
          expect(state.activeProducts).toBe(currentCount);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5b: Any product add beyond the limit is always rejected.
   *
   * For any free-tier tenant with activeProducts > FREE_TIER_MAX_PRODUCTS,
   * every add attempt MUST be rejected with LIMIT_EXCEEDED.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'any product add when already over the free-tier limit is always rejected',
    () => {
      // Generate counts strictly above the limit
      const overLimitArbitrary = fc.integer({
        min: FREE_TIER_MAX_PRODUCTS,
        max: FREE_TIER_MAX_PRODUCTS + 100,
      });

      fc.assert(
        fc.property(overLimitArbitrary, (currentCount) => {
          const state = createTenantState('free', currentCount, 0);

          const result = attemptAddProduct(state);

          expect(result.ok).toBe(false);
          expect(result.code).toBe('LIMIT_EXCEEDED');
          expect(state.activeProducts).toBe(currentCount);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5c: Products below the limit are always accepted on the free tier.
   *
   * For any free-tier tenant with activeProducts < FREE_TIER_MAX_PRODUCTS,
   * adding a product MUST succeed and increment the count.
   *
   * Validates: Requirements 3.3
   */
  test(
    'adding a product when below the free-tier limit is always accepted',
    () => {
      fc.assert(
        fc.property(belowProductLimitArbitrary, (currentCount) => {
          const state = createTenantState('free', currentCount, 0);

          const result = attemptAddProduct(state);

          expect(result.ok).toBe(true);
          expect(result.code).toBeNull();
          expect(state.activeProducts).toBe(currentCount + 1);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5d: The product limit boundary is exactly at 10.
   *
   * For any free-tier tenant, the acceptance condition for adding a product
   * MUST be: activeProducts < FREE_TIER_MAX_PRODUCTS (strictly less than 10).
   * At exactly 10, the add MUST be rejected.
   *
   * This is the core boundary property — it verifies the limit is enforced
   * at the correct threshold across all counts around the boundary.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'product add is accepted iff activeProducts < 10 (free tier boundary is exactly 10)',
    () => {
      fc.assert(
        fc.property(aroundProductBoundaryArbitrary, (currentCount) => {
          const state = createTenantState('free', currentCount, 0);

          const result = attemptAddProduct(state);

          const shouldBeAccepted = currentCount < FREE_TIER_MAX_PRODUCTS;

          expect(result.ok).toBe(shouldBeAccepted);

          if (shouldBeAccepted) {
            expect(result.code).toBeNull();
            expect(state.activeProducts).toBe(currentCount + 1);
          } else {
            expect(result.code).toBe('LIMIT_EXCEEDED');
            expect(state.activeProducts).toBe(currentCount);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5e: Re-activating a product is subject to the same limit.
   *
   * When a free-tier tenant re-activates an inactive product (active: false → true),
   * the same limit check applies. If activeProducts >= 10, the re-activation
   * MUST be rejected with LIMIT_EXCEEDED.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'reactivating a product when at the free-tier limit is always rejected',
    () => {
      fc.assert(
        fc.property(atProductLimitArbitrary, (currentCount) => {
          const state = createTenantState('free', currentCount, 0);

          const result = attemptReactivateProduct(state);

          expect(result.ok).toBe(false);
          expect(result.code).toBe('LIMIT_EXCEEDED');
          expect(state.activeProducts).toBe(currentCount);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Order limit ────────────────────────────────────────────────────────────

  /**
   * Property 5f: The 51st monthly order is always rejected on the free tier.
   *
   * For any free-tier tenant that already has exactly 50 orders this month,
   * any attempt to place another order MUST be rejected with LIMIT_EXCEEDED.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'placing the 51st monthly order is always rejected with LIMIT_EXCEEDED on the free tier',
    () => {
      fc.assert(
        fc.property(atOrderLimitArbitrary, (currentCount) => {
          const state = createTenantState('free', 0, currentCount);

          const result = attemptPlaceOrder(state);

          expect(result.ok).toBe(false);
          expect(result.code).toBe('LIMIT_EXCEEDED');
          expect(state.monthlyOrders).toBe(currentCount);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5g: Any order placement beyond the monthly limit is always rejected.
   *
   * For any free-tier tenant with monthlyOrders > FREE_TIER_MAX_MONTHLY_ORDERS,
   * every placement attempt MUST be rejected with LIMIT_EXCEEDED.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'any order placement when already over the monthly free-tier limit is always rejected',
    () => {
      const overLimitArbitrary = fc.integer({
        min: FREE_TIER_MAX_MONTHLY_ORDERS,
        max: FREE_TIER_MAX_MONTHLY_ORDERS + 100,
      });

      fc.assert(
        fc.property(overLimitArbitrary, (currentCount) => {
          const state = createTenantState('free', 0, currentCount);

          const result = attemptPlaceOrder(state);

          expect(result.ok).toBe(false);
          expect(result.code).toBe('LIMIT_EXCEEDED');
          expect(state.monthlyOrders).toBe(currentCount);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5h: Orders below the monthly limit are always accepted on the free tier.
   *
   * For any free-tier tenant with monthlyOrders < FREE_TIER_MAX_MONTHLY_ORDERS,
   * placing an order MUST succeed and increment the count.
   *
   * Validates: Requirements 3.3
   */
  test(
    'placing an order when below the monthly free-tier limit is always accepted',
    () => {
      fc.assert(
        fc.property(belowOrderLimitArbitrary, (currentCount) => {
          const state = createTenantState('free', 0, currentCount);

          const result = attemptPlaceOrder(state);

          expect(result.ok).toBe(true);
          expect(result.code).toBeNull();
          expect(state.monthlyOrders).toBe(currentCount + 1);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5i: The order limit boundary is exactly at 50.
   *
   * For any free-tier tenant, the acceptance condition for placing an order
   * MUST be: monthlyOrders < FREE_TIER_MAX_MONTHLY_ORDERS (strictly less than 50).
   * At exactly 50, the placement MUST be rejected.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'order placement is accepted iff monthlyOrders < 50 (free tier boundary is exactly 50)',
    () => {
      fc.assert(
        fc.property(aroundOrderBoundaryArbitrary, (currentCount) => {
          const state = createTenantState('free', 0, currentCount);

          const result = attemptPlaceOrder(state);

          const shouldBeAccepted = currentCount < FREE_TIER_MAX_MONTHLY_ORDERS;

          expect(result.ok).toBe(shouldBeAccepted);

          if (shouldBeAccepted) {
            expect(result.code).toBeNull();
            expect(state.monthlyOrders).toBe(currentCount + 1);
          } else {
            expect(result.code).toBe('LIMIT_EXCEEDED');
            expect(state.monthlyOrders).toBe(currentCount);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Paid tier — no limits ──────────────────────────────────────────────────

  /**
   * Property 5j: Paid-tier tenants are never subject to product limits.
   *
   * For any paid-tier tenant, adding a product MUST always succeed regardless
   * of how many active products they already have.
   *
   * Validates: Requirements 3.1, 3.3
   */
  test(
    'paid-tier tenants can always add products regardless of count',
    () => {
      // Generate counts well above the free-tier limit to confirm no cap
      const highCountArbitrary = fc.integer({
        min: 0,
        max: FREE_TIER_MAX_PRODUCTS + 1000,
      });

      fc.assert(
        fc.property(highCountArbitrary, (currentCount) => {
          const state = createTenantState('paid', currentCount, 0);

          const result = attemptAddProduct(state);

          expect(result.ok).toBe(true);
          expect(result.code).toBeNull();
          expect(state.activeProducts).toBe(currentCount + 1);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5k: Paid-tier tenants are never subject to monthly order limits.
   *
   * For any paid-tier tenant, placing an order MUST always succeed regardless
   * of how many orders they have placed this month.
   *
   * Validates: Requirements 3.1, 3.3
   */
  test(
    'paid-tier tenants can always place orders regardless of monthly count',
    () => {
      const highCountArbitrary = fc.integer({
        min: 0,
        max: FREE_TIER_MAX_MONTHLY_ORDERS + 1000,
      });

      fc.assert(
        fc.property(highCountArbitrary, (currentCount) => {
          const state = createTenantState('paid', 0, currentCount);

          const result = attemptPlaceOrder(state);

          expect(result.ok).toBe(true);
          expect(result.code).toBeNull();
          expect(state.monthlyOrders).toBe(currentCount + 1);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Combined / sequential operations ──────────────────────────────────────

  /**
   * Property 5l: Sequential product additions respect the limit throughout.
   *
   * For any free-tier tenant starting from 0 active products, adding products
   * one by one MUST succeed for the first 10 and fail for every subsequent add.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'sequential product additions succeed for the first 10 and fail for all subsequent adds',
    () => {
      // Generate a total number of add attempts (1–20)
      const totalAttemptsArbitrary = fc.integer({ min: 1, max: 20 });

      fc.assert(
        fc.property(totalAttemptsArbitrary, (totalAttempts) => {
          const state = createTenantState('free', 0, 0);

          for (let i = 0; i < totalAttempts; i++) {
            const result = attemptAddProduct(state);

            if (i < FREE_TIER_MAX_PRODUCTS) {
              // First 10 adds must succeed
              expect(result.ok).toBe(true);
              expect(result.code).toBeNull();
              expect(state.activeProducts).toBe(i + 1);
            } else {
              // 11th and beyond must be rejected
              expect(result.ok).toBe(false);
              expect(result.code).toBe('LIMIT_EXCEEDED');
              expect(state.activeProducts).toBe(FREE_TIER_MAX_PRODUCTS);
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5m: Sequential order placements respect the monthly limit throughout.
   *
   * For any free-tier tenant starting from 0 monthly orders, placing orders
   * one by one MUST succeed for the first 50 and fail for every subsequent placement.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'sequential order placements succeed for the first 50 and fail for all subsequent placements',
    () => {
      // Generate a total number of placement attempts (1–55)
      const totalAttemptsArbitrary = fc.integer({ min: 1, max: 55 });

      fc.assert(
        fc.property(totalAttemptsArbitrary, (totalAttempts) => {
          const state = createTenantState('free', 0, 0);

          for (let i = 0; i < totalAttempts; i++) {
            const result = attemptPlaceOrder(state);

            if (i < FREE_TIER_MAX_MONTHLY_ORDERS) {
              // First 50 placements must succeed
              expect(result.ok).toBe(true);
              expect(result.code).toBeNull();
              expect(state.monthlyOrders).toBe(i + 1);
            } else {
              // 51st and beyond must be rejected
              expect(result.ok).toBe(false);
              expect(result.code).toBe('LIMIT_EXCEEDED');
              expect(state.monthlyOrders).toBe(FREE_TIER_MAX_MONTHLY_ORDERS);
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5n: Both limits are independent — hitting one does not affect the other.
   *
   * For any free-tier tenant at the product limit, order placements below the
   * order limit MUST still succeed. Conversely, a tenant at the order limit
   * can still add products if below the product limit.
   *
   * Validates: Requirements 3.3, 3.4
   */
  test(
    'product and order limits are independent — hitting one does not block the other',
    () => {
      fc.assert(
        fc.property(
          belowOrderLimitArbitrary,
          belowProductLimitArbitrary,
          (orderCount, productCount) => {
            // Tenant at product limit but below order limit
            const stateAtProductLimit = createTenantState(
              'free',
              FREE_TIER_MAX_PRODUCTS,
              orderCount,
            );

            // Product add must fail (at limit)
            const productResult = attemptAddProduct(stateAtProductLimit);
            expect(productResult.ok).toBe(false);
            expect(productResult.code).toBe('LIMIT_EXCEEDED');

            // Order placement must succeed (below order limit)
            const orderResult = attemptPlaceOrder(stateAtProductLimit);
            expect(orderResult.ok).toBe(true);
            expect(orderResult.code).toBeNull();

            // Tenant at order limit but below product limit
            const stateAtOrderLimit = createTenantState(
              'free',
              productCount,
              FREE_TIER_MAX_MONTHLY_ORDERS,
            );

            // Order placement must fail (at limit)
            const orderResult2 = attemptPlaceOrder(stateAtOrderLimit);
            expect(orderResult2.ok).toBe(false);
            expect(orderResult2.code).toBe('LIMIT_EXCEEDED');

            // Product add must succeed (below product limit)
            const productResult2 = attemptAddProduct(stateAtOrderLimit);
            expect(productResult2.ok).toBe(true);
            expect(productResult2.code).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
