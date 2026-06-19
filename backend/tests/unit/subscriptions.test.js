/**
 * Unit tests for the subscriptions service.
 *
 * Task 10.1 — Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 3.9
 *
 * Covers:
 *  - getCurrentSubscription: returns free tier details when no subscription exists
 *  - getCurrentSubscription: returns paid tier details when active paid subscription exists
 *  - getCurrentSubscription: includes correct usage counters (active products, monthly orders)
 *  - getCurrentSubscription: shows upgrade options only for free-tier tenants
 *  - getCurrentSubscription: sets null limits for paid-tier tenants
 *  - initiateUpgrade: throws 400 when billingPeriod is missing
 *  - initiateUpgrade: throws 400 when billingPeriod is invalid
 *  - initiateUpgrade: throws 409 ALREADY_IN_STATE when tenant is already on paid tier
 *  - initiateUpgrade: creates a pending payment record for monthly billing
 *  - initiateUpgrade: creates a pending payment record for annual billing
 *  - initiateUpgrade: returns paid tier features and pricing in response
 *  - confirmUpgrade: throws 400 when paymentRecordId is missing
 *  - confirmUpgrade: throws 404 when payment record not found
 *  - confirmUpgrade: throws 409 when payment record is already confirmed
 *  - confirmUpgrade: activates the paid subscription and expires existing subscriptions
 *  - confirmUpgrade: stores paymentReference when provided
 */

import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: jest.fn(),
}));

// Mock pg pool used for transactions
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockClientRelease,
});

jest.unstable_mockModule('../../src/config/db.js', () => ({
  pool: { connect: mockConnect },
}));

// Mock email queue
const mockEnqueueSubscriptionConfirmationEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueSubscriptionConfirmationEmail: mockEnqueueSubscriptionConfirmationEmail,
}));

// Import after mocks are registered
const {
  getCurrentSubscription,
  initiateUpgrade,
  confirmUpgrade,
} = await import('../../src/modules/subscriptions/subscriptions.service.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const PAYMENT_RECORD_ID = 'payment-record-uuid-1';

function makeSubscriptionRow(overrides = {}) {
  return {
    id: 'sub-uuid-1',
    tier: 'free',
    status: 'active',
    activated_at: new Date('2024-01-01').toISOString(),
    expires_at: null,
    ...overrides,
  };
}

function makePaymentRow(overrides = {}) {
  return {
    id: PAYMENT_RECORD_ID,
    tenant_id: TENANT_ID,
    tier: 'paid',
    billing_period: 'monthly',
    amount: '29.99',
    currency: 'USD',
    status: 'pending',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── getCurrentSubscription ───────────────────────────────────────────────────

describe('getCurrentSubscription — free tier (no subscription record)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('defaults to free tier when no subscription record exists', async () => {
    // Subscription query — no rows
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Active products count
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    // Monthly orders count
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '12' }] });

    const result = await getCurrentSubscription(TENANT_ID);

    expect(result.subscription.tier).toBe('free');
    expect(result.subscription.id).toBeNull();
  });

  test('returns correct usage counters for free-tier tenant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no subscription
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] }); // 5 active products
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '30' }] }); // 30 monthly orders

    const result = await getCurrentSubscription(TENANT_ID);

    expect(result.usage.activeProducts).toBe(5);
    expect(result.usage.monthlyOrders).toBe(30);
  });

  test('sets product and order limits for free-tier tenant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const result = await getCurrentSubscription(TENANT_ID);

    expect(result.usage.activeProductsLimit).toBe(10);
    expect(result.usage.monthlyOrdersLimit).toBe(50);
  });

  test('includes upgrade options for free-tier tenant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const result = await getCurrentSubscription(TENANT_ID);

    expect(result.upgradeOptions).not.toBeNull();
    expect(Array.isArray(result.upgradeOptions)).toBe(true);
    expect(result.upgradeOptions.length).toBeGreaterThan(0);
    // Each option should have billingPeriod, amount, currency, features
    result.upgradeOptions.forEach((option) => {
      expect(option).toHaveProperty('billingPeriod');
      expect(option).toHaveProperty('amount');
      expect(option).toHaveProperty('currency');
      expect(option).toHaveProperty('features');
      expect(Array.isArray(option.features)).toBe(true);
    });
  });
});

describe('getCurrentSubscription — paid tier', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('returns paid tier details from active subscription', async () => {
    const subRow = makeSubscriptionRow({
      tier: 'paid',
      expires_at: new Date('2025-01-01').toISOString(),
    });
    mockQuery.mockResolvedValueOnce({ rows: [subRow] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '15' }] }); // active products
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '60' }] }); // monthly orders

    const result = await getCurrentSubscription(TENANT_ID);

    expect(result.subscription.tier).toBe('paid');
    expect(result.subscription.id).toBe('sub-uuid-1');
    expect(result.subscription.expiresAt).toBe(new Date('2025-01-01').toISOString());
  });

  test('sets null limits for paid-tier tenant (no limits)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeSubscriptionRow({ tier: 'paid' })] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '20' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '100' }] });

    const result = await getCurrentSubscription(TENANT_ID);

    expect(result.usage.activeProductsLimit).toBeNull();
    expect(result.usage.monthlyOrdersLimit).toBeNull();
  });

  test('returns null upgradeOptions for paid-tier tenant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeSubscriptionRow({ tier: 'paid' })] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const result = await getCurrentSubscription(TENANT_ID);

    expect(result.upgradeOptions).toBeNull();
  });
});

// ─── initiateUpgrade ──────────────────────────────────────────────────────────

describe('initiateUpgrade — validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('throws 400 VALIDATION_ERROR when billingPeriod is missing', async () => {
    await expect(
      initiateUpgrade(TENANT_ID, {}),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when billingPeriod is undefined', async () => {
    await expect(
      initiateUpgrade(TENANT_ID, { billingPeriod: undefined }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when billingPeriod is an invalid value', async () => {
    await expect(
      initiateUpgrade(TENANT_ID, { billingPeriod: 'weekly' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});

describe('initiateUpgrade — already on paid tier', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('throws 409 ALREADY_IN_STATE when tenant is already on paid tier', async () => {
    // Subscription check returns paid tier
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'paid' }] });

    await expect(
      initiateUpgrade(TENANT_ID, { billingPeriod: 'monthly' }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_IN_STATE' });
  });
});

describe('initiateUpgrade — successful initiation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('creates a pending payment record for monthly billing', async () => {
    // Subscription check — free tier
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'free' }] });
    // INSERT payment_records
    mockQuery.mockResolvedValueOnce({
      rows: [makePaymentRow({ billing_period: 'monthly', amount: '29.99' })],
    });

    const result = await initiateUpgrade(TENANT_ID, { billingPeriod: 'monthly' });

    expect(result.paymentRecord.status).toBe('pending');
    expect(result.paymentRecord.billingPeriod).toBe('monthly');
    expect(result.paymentRecord.amount).toBe(29.99);
    expect(result.paymentRecord.currency).toBe('USD');

    // Verify INSERT was called with correct values
    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO payment_records/i);
    expect(params).toContain(TENANT_ID);
    expect(params).toContain('monthly');
  });

  test('creates a pending payment record for annual billing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'free' }] });
    mockQuery.mockResolvedValueOnce({
      rows: [makePaymentRow({ billing_period: 'annual', amount: '299.99' })],
    });

    const result = await initiateUpgrade(TENANT_ID, { billingPeriod: 'annual' });

    expect(result.paymentRecord.billingPeriod).toBe('annual');
    expect(result.paymentRecord.amount).toBe(299.99);

    const [sql, params] = mockQuery.mock.calls[1];
    expect(params).toContain('annual');
  });

  test('returns paid tier features in response', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no active subscription (defaults to free)
    mockQuery.mockResolvedValueOnce({
      rows: [makePaymentRow()],
    });

    const result = await initiateUpgrade(TENANT_ID, { billingPeriod: 'monthly' });

    expect(Array.isArray(result.paidTierFeatures)).toBe(true);
    expect(result.paidTierFeatures.length).toBeGreaterThan(0);
  });

  test('returns price details in response', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [makePaymentRow()] });

    const result = await initiateUpgrade(TENANT_ID, { billingPeriod: 'monthly' });

    expect(result.price).toMatchObject({
      amount: 29.99,
      currency: 'USD',
      billingPeriod: 'monthly',
    });
  });
});

// ─── confirmUpgrade ───────────────────────────────────────────────────────────

describe('confirmUpgrade — validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
  });

  test('throws 400 VALIDATION_ERROR when paymentRecordId is missing', async () => {
    await expect(
      confirmUpgrade(TENANT_ID, {}),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when paymentRecordId is null', async () => {
    await expect(
      confirmUpgrade(TENANT_ID, { paymentRecordId: null }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 404 NOT_FOUND when payment record does not exist', async () => {
    // Payment record lookup — no rows
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      confirmUpgrade(TENANT_ID, { paymentRecordId: PAYMENT_RECORD_ID }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  test('throws 409 ALREADY_IN_STATE when payment record is already confirmed', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makePaymentRow({ status: 'confirmed' })],
    });

    await expect(
      confirmUpgrade(TENANT_ID, { paymentRecordId: PAYMENT_RECORD_ID }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_IN_STATE' });
  });

  test('throws 409 ALREADY_IN_STATE when payment record is abandoned', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makePaymentRow({ status: 'abandoned' })],
    });

    await expect(
      confirmUpgrade(TENANT_ID, { paymentRecordId: PAYMENT_RECORD_ID }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_IN_STATE' });
  });
});

describe('confirmUpgrade — successful activation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  function setupSuccessfulTransaction() {
    // Payment record lookup
    mockQuery.mockResolvedValueOnce({ rows: [makePaymentRow()] });

    // Transaction steps:
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({});
    // UPDATE payment_records (mark confirmed)
    mockClientQuery.mockResolvedValueOnce({});
    // UPDATE subscriptions (expire existing)
    mockClientQuery.mockResolvedValueOnce({});
    // INSERT subscriptions (new paid subscription)
    mockClientQuery.mockResolvedValueOnce({
      rows: [{
        id: 'new-sub-uuid',
        tier: 'paid',
        status: 'active',
        activated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }],
    });
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({});

    // Email notification query (fire-and-forget)
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'admin@example.com', full_name: 'Admin' }] });
  }

  test('activates paid subscription and returns it', async () => {
    setupSuccessfulTransaction();

    const result = await confirmUpgrade(TENANT_ID, { paymentRecordId: PAYMENT_RECORD_ID });

    expect(result.subscription.tier).toBe('paid');
    expect(result.subscription.status).toBe('active');
    expect(result.subscription.id).toBe('new-sub-uuid');
    expect(result.message).toBeTruthy();
  });

  test('expires existing active subscriptions before inserting new one', async () => {
    setupSuccessfulTransaction();

    await confirmUpgrade(TENANT_ID, { paymentRecordId: PAYMENT_RECORD_ID });

    // Check that UPDATE subscriptions (expire) was called
    const updateExpireCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("status = 'expired'"),
    );
    expect(updateExpireCall).toBeDefined();
  });

  test('stores paymentReference when provided', async () => {
    setupSuccessfulTransaction();

    await confirmUpgrade(TENANT_ID, {
      paymentRecordId: PAYMENT_RECORD_ID,
      paymentReference: 'PAY-12345',
    });

    // Verify UPDATE payment_records was called with payment reference
    const updatePaymentCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE payment_records'),
    );
    expect(updatePaymentCall).toBeDefined();
    const [, params] = updatePaymentCall;
    expect(params).toContain('PAY-12345');
  });

  test('returns an expiry date on the new subscription', async () => {
    setupSuccessfulTransaction();

    const result = await confirmUpgrade(TENANT_ID, { paymentRecordId: PAYMENT_RECORD_ID });

    expect(result.subscription.expiresAt).not.toBeNull();
  });

  test('rolls back transaction and rethrows on error', async () => {
    // Payment record lookup
    mockQuery.mockResolvedValueOnce({ rows: [makePaymentRow()] });

    // BEGIN succeeds
    mockClientQuery.mockResolvedValueOnce({});
    // UPDATE payment_records fails
    const dbError = new Error('DB connection lost');
    mockClientQuery.mockRejectedValueOnce(dbError);
    // ROLLBACK
    mockClientQuery.mockResolvedValueOnce({});

    await expect(
      confirmUpgrade(TENANT_ID, { paymentRecordId: PAYMENT_RECORD_ID }),
    ).rejects.toThrow('DB connection lost');

    // Verify ROLLBACK was called
    const rollbackCall = mockClientQuery.mock.calls.find(
      ([sql]) => sql === 'ROLLBACK',
    );
    expect(rollbackCall).toBeDefined();
    // Verify client was released even on error
    expect(mockClientRelease).toHaveBeenCalled();
  });
});

// ─── Upgrade flow abandonment (Requirement 3.6) ───────────────────────────────

describe('upgrade flow abandonment — tenant remains on free tier', () => {
  test('tenant remains on free tier if confirm is never called after initiate', async () => {
    // After initiating an upgrade, the tenant should still be on free tier
    // (no subscription activation happens during initiateUpgrade)
    mockQuery.mockReset();

    // Subscription check — free tier
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT payment_records
    mockQuery.mockResolvedValueOnce({ rows: [makePaymentRow()] });

    const upgradeResult = await initiateUpgrade(TENANT_ID, { billingPeriod: 'monthly' });

    // Payment record is pending (not confirmed)
    expect(upgradeResult.paymentRecord.status).toBe('pending');

    // Now check subscription — should still be on free tier
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no active paid subscription
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });

    const subResult = await getCurrentSubscription(TENANT_ID);
    expect(subResult.subscription.tier).toBe('free');
  });
});
