/**
 * Unit tests for Platform_Admin tenant management and metrics.
 *
 * Task 11.1 — Requirements: 9.1, 9.2, 9.3, 9.4
 * Task 11.2 — Requirements: 9.5
 *
 * Covers:
 *  - listTenants: returns all tenants with subscription tier, registration date, status
 *  - updateTenantStatus: validates action parameter
 *  - updateTenantStatus: returns 404 NOT_FOUND for non-existent tenant
 *  - updateTenantStatus: returns 409 ALREADY_IN_STATE when already in target state
 *  - updateTenantStatus (suspend): sets tenant status to suspended, locks users
 *  - updateTenantStatus (reactivate): sets tenant status to active, restores users
 *  - updateTenantStatus: enqueues notification email after status change
 *  - updateTenantStatus: succeeds even if email enqueue fails
 *  - getPlatformMetrics: returns total tenants, subscriptions by tier, total orders
 *  - getPlatformMetrics: applies date range filter to orders
 */

import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockEnqueueTenantSuspensionEmail = jest.fn().mockResolvedValue(undefined);
const mockEnqueueTenantReactivationEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: jest.fn(),
}));

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueVerificationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantApprovalEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantRejectionEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantSuspensionEmail: mockEnqueueTenantSuspensionEmail,
  enqueueTenantReactivationEmail: mockEnqueueTenantReactivationEmail,
}));

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolConnect = jest.fn();

jest.unstable_mockModule('../../src/config/db.js', () => ({
  pool: { connect: mockPoolConnect },
}));

const {
  listTenants,
  updateTenantStatus,
  getPlatformMetrics,
} = await import('../../src/modules/admin/admin.service.js');

const TENANT_ID = 'tenant-uuid-1';

function makeTenantRow(overrides = {}) {
  return {
    id: TENANT_ID,
    business_name: 'NE Clothiers',
    contact_email: 'owner@neclothiers.com',
    status: 'active',
    registration_date: new Date('2024-01-01').toISOString(),
    subscription_tier: 'free',
    subscription_status: 'active',
    ...overrides,
  };
}

function setupMockClient() {
  mockClientQuery.mockReset();
  mockClientRelease.mockReset();
  mockPoolConnect.mockReset();
  let callIndex = 0;
  mockClientQuery.mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) return Promise.resolve({ rows: [] });
    if (callIndex === 2) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });
  mockClientRelease.mockResolvedValue(undefined);
  mockPoolConnect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
}

function setupMockClientWithResponses(responses = []) {
  let callIndex = 0;
  mockClientQuery.mockImplementation(() => {
    const response = responses[callIndex] ?? { rows: [] };
    callIndex++;
    return Promise.resolve(response);
  });
  mockClientRelease.mockResolvedValue(undefined);
  mockPoolConnect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
}

describe('listTenants (Requirement 9.1)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('returns all tenants with subscription tier, registration date, status', async () => {
    const rows = [
      makeTenantRow({ id: 't1', business_name: 'Alpha Tailors', subscription_tier: 'paid' }),
      makeTenantRow({ id: 't2', business_name: 'Beta Bespoke', subscription_tier: 'free' }),
    ];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listTenants();

    expect(result.tenants).toHaveLength(2);
    expect(result.tenants[0].business_name).toBe('Alpha Tailors');
    expect(result.tenants[0].subscription_tier).toBe('paid');
    expect(result.tenants[1].business_name).toBe('Beta Bespoke');
    expect(result.tenants[1].subscription_tier).toBe('free');
  });

  test('results are ordered by created_at DESC', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listTenants();

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/ORDER BY t\.created_at DESC/i);
  });

  test('returns empty array when no tenants exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await listTenants();

    expect(result.tenants).toEqual([]);
  });

  test('includes all required fields in each tenant row', async () => {
    const rows = [makeTenantRow()];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listTenants();
    const tenant = result.tenants[0];

    expect(tenant).toHaveProperty('id');
    expect(tenant).toHaveProperty('business_name');
    expect(tenant).toHaveProperty('contact_email');
    expect(tenant).toHaveProperty('status');
    expect(tenant).toHaveProperty('registration_date');
    expect(tenant).toHaveProperty('subscription_tier');
    expect(tenant).toHaveProperty('subscription_status');
  });

  test('handles tenant with no subscription (null tier)', async () => {
    const rows = [makeTenantRow({ subscription_tier: null, subscription_status: null })];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listTenants();

    expect(result.tenants[0].subscription_tier).toBeNull();
    expect(result.tenants[0].subscription_status).toBeNull();
  });
});

describe('updateTenantStatus — validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('throws 400 VALIDATION_ERROR for action=null', async () => {
    await expect(
      updateTenantStatus({ tenantId: TENANT_ID, action: null }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR for action=undefined', async () => {
    await expect(
      updateTenantStatus({ tenantId: TENANT_ID, action: undefined }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR for action=delete (invalid value)', async () => {
    await expect(
      updateTenantStatus({ tenantId: TENANT_ID, action: 'delete' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR for action=SUSPEND (wrong case)', async () => {
    await expect(
      updateTenantStatus({ tenantId: TENANT_ID, action: 'SUSPEND' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});

describe('updateTenantStatus — not found', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('throws 404 NOT_FOUND when tenant does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      updateTenantStatus({ tenantId: 'nonexistent-uuid', action: 'suspend' }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('updateTenantStatus — already in state (Requirement 9.4)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('throws 409 ALREADY_IN_STATE when trying to suspend an already-suspended tenant', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeTenantRow({ status: 'suspended' })],
    });

    await expect(
      updateTenantStatus({ tenantId: TENANT_ID, action: 'suspend' }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_IN_STATE' });
  });

  test('throws 409 ALREADY_IN_STATE when trying to reactivate an already-active tenant', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeTenantRow({ status: 'active' })],
    });

    await expect(
      updateTenantStatus({ tenantId: TENANT_ID, action: 'reactivate' }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_IN_STATE' });
  });
});

describe('updateTenantStatus — suspend flow (Requirement 9.2)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnqueueTenantSuspensionEmail.mockReset();
    mockEnqueueTenantSuspensionEmail.mockResolvedValue(undefined);
  });

  function setupSuccessfulSuspend() {
    mockQuery.mockResolvedValueOnce({
      rows: [makeTenantRow({ status: 'active' })],
    });

    setupMockClientWithResponses([
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);
  }

  test('returns success message on suspend', async () => {
    setupSuccessfulSuspend();

    const result = await updateTenantStatus({ tenantId: TENANT_ID, action: 'suspend' });

    expect(result).toMatchObject({
      message: expect.stringContaining('suspended'),
    });
  });

  test('updates tenant status to suspended inside the transaction', async () => {
    setupSuccessfulSuspend();

    await updateTenantStatus({ tenantId: TENANT_ID, action: 'suspend' });

    const updateTenantCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /UPDATE tenants/i.test(sql),
    );
    expect(updateTenantCall).toBeDefined();
    expect(updateTenantCall[0]).toMatch(/status = 'suspended'/i);
  });

  test('locks tenant_admin users on suspend', async () => {
    setupSuccessfulSuspend();

    await updateTenantStatus({ tenantId: TENANT_ID, action: 'suspend' });

    const lockUsersCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /UPDATE users/i.test(sql) && /account_status = 'locked'/i.test(sql),
    );
    expect(lockUsersCall).toBeDefined();
    expect(lockUsersCall[1]).toContain(TENANT_ID);
    expect(lockUsersCall[0]).toMatch(/role = 'tenant_admin'/i);
  });

  test('wraps operations in a transaction (BEGIN + COMMIT)', async () => {
    setupSuccessfulSuspend();

    await updateTenantStatus({ tenantId: TENANT_ID, action: 'suspend' });

    const beginCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /BEGIN/i.test(sql),
    );
    const commitCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /COMMIT/i.test(sql),
    );
    expect(beginCall).toBeDefined();
    expect(commitCall).toBeDefined();
  });

  test('releases DB client after successful suspend', async () => {
    setupSuccessfulSuspend();

    await updateTenantStatus({ tenantId: TENANT_ID, action: 'suspend' });

    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  test('enqueues suspension email after successful transaction', async () => {
    setupSuccessfulSuspend();

    await updateTenantStatus({ tenantId: TENANT_ID, action: 'suspend' });

    expect(mockEnqueueTenantSuspensionEmail).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTenantSuspensionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        email: 'owner@neclothiers.com',
        businessName: 'NE Clothiers',
      }),
    );
  });

  test('still returns success even if suspension email enqueue fails', async () => {
    setupSuccessfulSuspend();
    mockEnqueueTenantSuspensionEmail.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await updateTenantStatus({ tenantId: TENANT_ID, action: 'suspend' });

    expect(result).toMatchObject({
      message: expect.stringContaining('suspended'),
    });
  });

  test('rolls back and re-throws on DB error during transaction', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeTenantRow({ status: 'active' })],
    });

    let callIndex = 0;
    mockClientQuery.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve({ rows: [] });
      if (callIndex === 2) return Promise.reject(new Error('DB constraint violation'));
      return Promise.resolve({ rows: [] });
    });
    mockClientRelease.mockResolvedValue(undefined);
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });

    await expect(
      updateTenantStatus({ tenantId: TENANT_ID, action: 'suspend' }),
    ).rejects.toThrow('DB constraint violation');

    const rollbackCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /ROLLBACK/i.test(sql),
    );
    expect(rollbackCall).toBeDefined();
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });
});

describe('updateTenantStatus — reactivate flow (Requirement 9.3)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnqueueTenantReactivationEmail.mockReset();
    mockEnqueueTenantReactivationEmail.mockResolvedValue(undefined);
  });

  function setupSuccessfulReactivate() {
    mockQuery.mockResolvedValueOnce({
      rows: [makeTenantRow({ status: 'suspended' })],
    });

    setupMockClientWithResponses([
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);
  }

  test('returns success message on reactivate', async () => {
    setupSuccessfulReactivate();

    const result = await updateTenantStatus({ tenantId: TENANT_ID, action: 'reactivate' });

    expect(result).toMatchObject({
      message: expect.stringContaining('active'),
    });
  });

  test('updates tenant status to active inside the transaction', async () => {
    setupSuccessfulReactivate();

    await updateTenantStatus({ tenantId: TENANT_ID, action: 'reactivate' });

    const updateTenantCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /UPDATE tenants/i.test(sql),
    );
    expect(updateTenantCall).toBeDefined();
    expect(updateTenantCall[0]).toMatch(/status = 'active'/i);
  });

  test('restores tenant_admin users on reactivate', async () => {
    setupSuccessfulReactivate();

    await updateTenantStatus({ tenantId: TENANT_ID, action: 'reactivate' });

    const restoreUsersCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /UPDATE users/i.test(sql) && /account_status = 'active'/i.test(sql),
    );
    expect(restoreUsersCall).toBeDefined();
    expect(restoreUsersCall[1]).toContain(TENANT_ID);
    expect(restoreUsersCall[0]).toMatch(/role = 'tenant_admin'/i);
  });

  test('enqueues reactivation email after successful transaction', async () => {
    setupSuccessfulReactivate();

    await updateTenantStatus({ tenantId: TENANT_ID, action: 'reactivate' });

    expect(mockEnqueueTenantReactivationEmail).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTenantReactivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        email: 'owner@neclothiers.com',
        businessName: 'NE Clothiers',
      }),
    );
  });

  test('still returns success even if reactivation email enqueue fails', async () => {
    setupSuccessfulReactivate();
    mockEnqueueTenantReactivationEmail.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await updateTenantStatus({ tenantId: TENANT_ID, action: 'reactivate' });

    expect(result).toMatchObject({
      message: expect.stringContaining('active'),
    });
  });
});

describe('getPlatformMetrics (Requirement 9.5)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('returns total tenants, subscriptions by tier, and total orders', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { tier: 'free', count: 8 },
        { tier: 'paid', count: 2 },
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 150 }] });

    const result = await getPlatformMetrics();

    expect(result.totalTenants).toBe(10);
    expect(result.subscriptionsByTier).toEqual({ free: 8, paid: 2 });
    expect(result.totalOrders).toBe(150);
  });

  test('returns zero subscriptionsByTier when no active subscriptions exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 5 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await getPlatformMetrics();

    expect(result.totalTenants).toBe(5);
    expect(result.subscriptionsByTier).toEqual({});
    expect(result.totalOrders).toBe(0);
  });

  test('applies from date filter to orders query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 50 }] });

    await getPlatformMetrics({ from: '2024-06-01' });

    const orderQueryCall = mockQuery.mock.calls[2];
    const [sql, params] = orderQueryCall;
    expect(sql).toMatch(/created_at >= \$1/i);
    expect(params[0]).toBe('2024-06-01');
  });

  test('applies to date filter to orders query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 50 }] });

    await getPlatformMetrics({ to: '2024-06-30' });

    const orderQueryCall = mockQuery.mock.calls[2];
    const [sql, params] = orderQueryCall;
    expect(sql).toMatch(/created_at <= \$1/i);
    expect(params[0]).toBe('2024-06-30');
  });

  test('applies both from and to date filters to orders query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 50 }] });

    await getPlatformMetrics({ from: '2024-06-01', to: '2024-06-30' });

    const orderQueryCall = mockQuery.mock.calls[2];
    const sql = orderQueryCall[0];
    expect(sql).toMatch(/created_at >= \$1/i);
    expect(sql).toMatch(/created_at <= \$2/i);
  });

  test('does not filter orders when no date range is provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 200 }] });

    await getPlatformMetrics();

    const orderQueryCall = mockQuery.mock.calls[2];
    const [sql, params] = orderQueryCall;
    expect(sql).not.toMatch(/WHERE.*AND/i);
    expect(params).toHaveLength(0);
  });

  test('executes all three queries in parallel', async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

    const result = await getPlatformMetrics();

    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(result).toBeDefined();
  });
});
