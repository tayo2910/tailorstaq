/**
 * Unit tests for subscription tier entitlement matrix.
 *
 * Task 10.4 — Requirements: 3.1, 3.6
 *
 * Covers:
 *  - Free-tier feature flags (max 10 products, max 50 monthly orders)
 *  - Paid-tier feature flags (unlimited products and orders)
 *  - Upgrade flow abandonment leaves tenant on free tier
 *  - Upgrade initiation returns correct pricing/feature info per billing period
 *  - Confirm upgrade transitions tenant to paid tier
 *  - ALREADY_IN_STATE error when tenant is already paid
 *  - Validation error for invalid billing period
 */

import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockPoolConnect = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockEnqueueSubscriptionConfirmationEmail = jest.fn().mockResolvedValue(undefined);
const mockEnqueueSubscriptionDowngradeEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: jest.fn(),
}));

jest.unstable_mockModule('../../src/config/db.js', () => ({
  pool: { connect: mockPoolConnect },
}));

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueSubscriptionConfirmationEmail: mockEnqueueSubscriptionConfirmationEmail,
  enqueueSubscriptionDowngradeEmail: mockEnqueueSubscriptionDowngradeEmail,
}));

jest.unstable_mockModule('../../src/config/env.js', () => ({
  env: {
    FREE_TIER_MAX_PRODUCTS: 10,
    FREE_TIER_MAX_MONTHLY_ORDERS: 50,
  },
}));

const {
  getCurrentSubscription,
  initiateUpgrade,
  confirmUpgrade,
} = await import('../../src/modules/subscriptions/subscriptions.service.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSubscriptionRow(overrides = {}) {
  return {
    id: 'sub-uuid-1',
    tier: 'free',
    status: 'active',
    activated_at: new Date('2025-01-01').toISOString(),
    expires_at: null,
    ...overrides,
  };
}

function makePaymentRecordRow(overrides = {}) {
  return {
    id: 'pay-uuid-1',
    tenant_id: 'tenant-uuid-1',
    tier: 'paid',
    billing_period: 'monthly',
    amount: '29.99',
    currency: 'USD',
    status: 'pending',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Task 10.4 – Subscription tier entitlement matrix', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no active subscription (implies free tier)
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // ── Free-tier features (Requirement 3.1) ───────────────────────────────────

  describe('free-tier features (Requirement 3.1)', () => {
    test('getCurrentSubscription returns free tier with usage limits when no subscription exists', async () => {
      // Mock product count = 3, order count = 10
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no active subscription
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // active products
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }); // monthly orders

      const result = await getCurrentSubscription('tenant-uuid-1');

      expect(result.subscription.tier).toBe('free');
      expect(result.subscription.status).toBe('active');
      expect(result.usage.activeProducts).toBe(3);
      expect(result.usage.activeProductsLimit).toBe(10);
      expect(result.usage.monthlyOrders).toBe(10);
      expect(result.usage.monthlyOrdersLimit).toBe(50);
      expect(result.upgradeOptions).toBeDefined();
      expect(result.upgradeOptions.length).toBe(2); // monthly and annual
    });

    test('free-tier limits match the configured values', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeSubscriptionRow()] }) // active free sub
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await getCurrentSubscription('tenant-uuid-1');

      expect(result.usage.activeProductsLimit).toBe(10);
      expect(result.usage.monthlyOrdersLimit).toBe(50);
    });

    test('free tier shows upgrade options', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeSubscriptionRow()] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await getCurrentSubscription('tenant-uuid-1');

      expect(result.upgradeOptions).toBeDefined();
      expect(result.upgradeOptions.length).toBe(2);
      expect(result.upgradeOptions[0].billingPeriod).toBe('monthly');
      expect(result.upgradeOptions[0].amount).toBe(29.99);
      expect(result.upgradeOptions[1].billingPeriod).toBe('annual');
      expect(result.upgradeOptions[1].amount).toBe(299.99);
    });
  });

  // ── Paid-tier features ────────────────────────────────────────────────────

  describe('paid-tier features', () => {
    test('getCurrentSubscription returns null upgrade options for paid tier', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [makeSubscriptionRow({ tier: 'paid', expires_at: new Date('2026-01-01').toISOString() })],
        })
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // 25 products (no limit)
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }); // 100 orders (no limit)

      const result = await getCurrentSubscription('tenant-uuid-1');

      expect(result.subscription.tier).toBe('paid');
      expect(result.usage.activeProductsLimit).toBeNull();
      expect(result.usage.monthlyOrdersLimit).toBeNull();
      expect(result.upgradeOptions).toBeNull();
    });
  });

  // ── Upgrade initiation (Requirement 3.5, 3.6) ────────────────────────────

  describe('upgrade initiation (Requirements 3.5, 3.6)', () => {
    test('initiateUpgrade creates a pending payment record with correct pricing for monthly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // current tier = free
        .mockResolvedValueOnce({
          rows: [makePaymentRecordRow({ billing_period: 'monthly', amount: '29.99' })],
        });

      const result = await initiateUpgrade('tenant-uuid-1', { billingPeriod: 'monthly' });

      expect(result.paymentRecord.status).toBe('pending');
      expect(result.paymentRecord.billingPeriod).toBe('monthly');
      expect(result.paymentRecord.amount).toBe(29.99);
      expect(result.price.amount).toBe(29.99);
      expect(result.price.billingPeriod).toBe('monthly');
      expect(result.paidTierFeatures).toContain('Unlimited active products');
    });

    test('initiateUpgrade creates a pending payment record for annual billing', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [makePaymentRecordRow({ billing_period: 'annual', amount: '299.99' })],
        });

      const result = await initiateUpgrade('tenant-uuid-1', { billingPeriod: 'annual' });

      expect(result.paymentRecord.billingPeriod).toBe('annual');
      expect(result.paymentRecord.amount).toBe(299.99);
      expect(result.paidTierFeatures).toContain('2 months free');
    });

    test('initiateUpgrade throws ALREADY_IN_STATE when tenant is already paid', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeSubscriptionRow({ tier: 'paid' })],
      });

      await expect(
        initiateUpgrade('tenant-uuid-1', { billingPeriod: 'monthly' }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'ALREADY_IN_STATE',
      });
    });

    test('initiateUpgrade throws VALIDATION_ERROR for invalid billing period', async () => {
      await expect(
        initiateUpgrade('tenant-uuid-1', { billingPeriod: 'quarterly' }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    test('initiateUpgrade throws VALIDATION_ERROR when billing period is missing', async () => {
      await expect(
        initiateUpgrade('tenant-uuid-1', {}),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  // ── Upgrade confirmation (Requirement 3.7) ───────────────────────────────

  describe('upgrade confirmation (Requirement 3.7)', () => {
    beforeEach(() => {
      const mockClient = {
        query: mockClientQuery,
        release: mockClientRelease,
      };
      mockPoolConnect.mockResolvedValue(mockClient);
    });

    test('confirmUpgrade transitions tenant from free to paid', async () => {
      // Step 1: Look up pending payment record
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'pay-uuid-1',
          tenant_id: 'tenant-uuid-1',
          tier: 'paid',
          billing_period: 'monthly',
          amount: '29.99',
          currency: 'USD',
          status: 'pending',
          created_at: new Date().toISOString(),
        }],
      });

      // Step 2: Inside transaction — update payment, expire old, insert new
      mockClientQuery
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce() // UPDATE payment_records
        .mockResolvedValueOnce() // UPDATE subscriptions SET status = 'expired'
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-new-uuid',
            tier: 'paid',
            status: 'active',
            activated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }],
        })
        .mockResolvedValueOnce(); // COMMIT

      // Step 3: Fetch tenant admin for email (fire-and-forget)
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ email: 'admin@shop.com', full_name: 'Shop Admin' }],
        });

      const result = await confirmUpgrade('tenant-uuid-1', {
        paymentRecordId: 'pay-uuid-1',
      });

      expect(result.subscription.tier).toBe('paid');
      expect(result.subscription.status).toBe('active');
      expect(result.message).toContain('Subscription upgraded successfully');
    });

    test('confirmUpgrade throws NOT_FOUND when payment record does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        confirmUpgrade('tenant-uuid-1', { paymentRecordId: 'nonexistent' }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    test('confirmUpgrade throws ALREADY_IN_STATE when payment already confirmed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makePaymentRecordRow({ status: 'confirmed' })],
      });

      await expect(
        confirmUpgrade('tenant-uuid-1', { paymentRecordId: 'pay-uuid-1' }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'ALREADY_IN_STATE',
      });
    });

    test('confirmUpgrade throws VALIDATION_ERROR when paymentRecordId is missing', async () => {
      await expect(
        confirmUpgrade('tenant-uuid-1', {}),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    test('confirmUpgrade enqueues confirmation email after success', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'pay-uuid-1',
            tenant_id: 'tenant-uuid-1',
            tier: 'paid',
            billing_period: 'monthly',
            amount: '29.99',
            currency: 'USD',
            status: 'pending',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ email: 'admin@shop.com', full_name: 'Shop Admin' }],
        });

      mockClientQuery
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce() // UPDATE payment_records
        .mockResolvedValueOnce() // UPDATE subscriptions
        .mockResolvedValueOnce({
          rows: [{
            id: 'sub-new-uuid',
            tier: 'paid',
            status: 'active',
            activated_at: new Date().toISOString(),
            expires_at: new Date().toISOString(),
          }],
        })
        .mockResolvedValueOnce(); // COMMIT

      await confirmUpgrade('tenant-uuid-1', { paymentRecordId: 'pay-uuid-1' });

      expect(mockEnqueueSubscriptionConfirmationEmail).toHaveBeenCalledTimes(1);
    });
  });

  // ── Upgrade abandonment (Requirement 3.6) ─────────────────────────────────

  describe('upgrade abandonment (Requirement 3.6)', () => {
    test('tenant stays on free tier if upgrade is initiated but not confirmed', async () => {
      // Initiate upgrade (creates pending payment record)
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // current = free
        .mockResolvedValueOnce({
          rows: [makePaymentRecordRow()],
        });

      const initResult = await initiateUpgrade('tenant-uuid-1', { billingPeriod: 'monthly' });
      expect(initResult.paymentRecord.status).toBe('pending');

      // Clear mocks — simulate the tenant never calling confirmUpgrade
      jest.clearAllMocks();

      // Later, getCurrentSubscription still shows free tier
      mockQuery
        .mockResolvedValueOnce({ rows: [makeSubscriptionRow()] }) // active free sub
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const subResult = await getCurrentSubscription('tenant-uuid-1');

      expect(subResult.subscription.tier).toBe('free');
      expect(subResult.upgradeOptions).toBeDefined(); // still shows upgrade options
    });
  });

  // ── Free tier edge cases ─────────────────────────────────────────────────

  describe('free tier edge cases', () => {
    test('getCurrentSubscription handles zero product and order counts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeSubscriptionRow()] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await getCurrentSubscription('tenant-uuid-1');

      expect(result.usage.activeProducts).toBe(0);
      expect(result.usage.monthlyOrders).toBe(0);
    });

    test('getCurrentSubscription handles large product and order counts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeSubscriptionRow()] })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ count: '50' }] });

      const result = await getCurrentSubscription('tenant-uuid-1');

      // At exactly the limit — still free tier
      expect(result.subscription.tier).toBe('free');
      expect(result.usage.activeProducts).toBe(10);
      expect(result.usage.monthlyOrders).toBe(50);
    });

    test('paid tier shows null limits regardless of usage', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [makeSubscriptionRow({ tier: 'paid', expires_at: new Date('2026-01-01').toISOString() })],
        })
        .mockResolvedValueOnce({ rows: [{ count: '999' }] })
        .mockResolvedValueOnce({ rows: [{ count: '9999' }] });

      const result = await getCurrentSubscription('tenant-uuid-1');

      expect(result.usage.activeProductsLimit).toBeNull();
      expect(result.usage.monthlyOrdersLimit).toBeNull();
      expect(result.upgradeOptions).toBeNull();
    });
  });
});
