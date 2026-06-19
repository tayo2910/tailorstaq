/**
 * Unit tests for the orders service — order status update (task 7.4).
 *
 * Requirements: 5.3, 5.4, 5.7, 5.8
 *
 * Covers:
 *  - isValidStatusTransition: all valid forward transitions
 *  - isValidStatusTransition: invalid transitions (skipping steps, backwards)
 *  - isValidStatusTransition: terminal state detection (completed, cancelled)
 *  - isValidStatusTransition: cancelled reachable from all non-terminal statuses
 *  - updateOrderStatus: throws 400 VALIDATION_ERROR for unrecognised status
 *  - updateOrderStatus: throws 404 NOT_FOUND when order not found in shop
 *  - updateOrderStatus: throws 422 TERMINAL_ORDER_STATE when order is completed
 *  - updateOrderStatus: throws 422 TERMINAL_ORDER_STATE when order is cancelled
 *  - updateOrderStatus: throws 422 VALIDATION_ERROR for invalid lifecycle transition
 *  - updateOrderStatus: persists new status and history row inside a transaction
 *  - updateOrderStatus: wraps updates in BEGIN + COMMIT
 *  - updateOrderStatus: rolls back and re-throws on DB error during transaction
 *  - updateOrderStatus: enqueues customer notification email (fire-and-forget)
 *  - updateOrderStatus: still returns order even if email enqueue fails
 *  - updateOrderStatus: enqueues receipt generation job when status = 'completed'
 *  - updateOrderStatus: does NOT enqueue receipt job for non-completed statuses
 */

import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockQueryTenant = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: mockQueryTenant,
}));

// Mock the pool client for transaction-based updates
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolConnect = jest.fn();

jest.unstable_mockModule('../../src/config/db.js', () => ({
  pool: {
    connect: mockPoolConnect,
    query: jest.fn(),
    on: jest.fn(),
  },
}));

// Mock order reference generator (not used in status update but imported by service)
jest.unstable_mockModule('../../src/utils/orderRef.js', () => ({
  generateOrderReference: jest.fn().mockResolvedValue('ABCD1234'),
  generateRawReference: jest.fn(),
}));

// Mock email queue
const mockEnqueueOrderStatusEmail = jest.fn().mockResolvedValue(undefined);
const mockEnqueueOrderConfirmationEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueOrderConfirmationEmail: mockEnqueueOrderConfirmationEmail,
  enqueueOrderStatusEmail: mockEnqueueOrderStatusEmail,
  enqueueVerificationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantApprovalEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantRejectionEmail: jest.fn().mockResolvedValue(undefined),
}));

// Mock PDF queue
const mockEnqueueReceiptGenerationJob = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/queues/pdf.queue.js', () => ({
  enqueueReceiptGenerationJob: mockEnqueueReceiptGenerationJob,
}));

// Import after mocks are registered
const {
  isValidStatusTransition,
  TERMINAL_STATUSES,
  VALID_TRANSITIONS,
  updateOrderStatus,
} = await import('../../src/modules/orders/orders.service.js');

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const SHOP_ID = 'shop-uuid-1';
const CUSTOMER_ID = 'customer-uuid-1';
const ORDER_ID = 'order-uuid-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    tenant_id: TENANT_ID,
    shop_id: SHOP_ID,
    customer_id: CUSTOMER_ID,
    product_id: 'product-uuid-1',
    reference: 'ABCD1234',
    quantity: 2,
    unit_price: '150.00',
    status: 'received',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Set up the mock pool client for the transactional status update.
 * Queries in order:
 *   0: BEGIN
 *   1: set_config (RLS tenant context)
 *   2: UPDATE orders → returns updated order row
 *   3: INSERT order_status_history
 *   4: COMMIT
 */
function setupMockClient(queryResponses = []) {
  let callIndex = 0;
  mockClientQuery.mockImplementation(() => {
    const response = queryResponses[callIndex] ?? { rows: [] };
    callIndex++;
    return Promise.resolve(response);
  });
  mockClientRelease.mockResolvedValue(undefined);
  mockPoolConnect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
}

/**
 * Set up mocks for a successful status update.
 *
 * @param {{ currentStatus?: string, newStatus?: string }} options
 */
function setupSuccessfulUpdate({ currentStatus = 'received', newStatus = 'in-progress' } = {}) {
  const currentOrder = makeOrder({ status: currentStatus });
  const updatedOrder = makeOrder({ status: newStatus });

  // queryTenant for order lookup
  mockQueryTenant.mockResolvedValueOnce({ rows: [currentOrder] });

  // Transaction client
  setupMockClient([
    { rows: [] },                    // BEGIN
    { rows: [] },                    // set_config
    { rows: [updatedOrder] },        // UPDATE orders
    { rows: [] },                    // INSERT order_status_history
    { rows: [] },                    // COMMIT
  ]);
}

// ─── isValidStatusTransition — valid forward transitions ─────────────────────

describe('isValidStatusTransition — valid forward transitions', () => {
  test('received → in-progress is valid', () => {
    expect(isValidStatusTransition('received', 'in-progress')).toEqual({ valid: true, terminalError: false });
  });

  test('in-progress → ready-for-pickup is valid', () => {
    expect(isValidStatusTransition('in-progress', 'ready-for-pickup')).toEqual({ valid: true, terminalError: false });
  });

  test('ready-for-pickup → completed is valid', () => {
    expect(isValidStatusTransition('ready-for-pickup', 'completed')).toEqual({ valid: true, terminalError: false });
  });
});

// ─── isValidStatusTransition — cancelled from non-terminal statuses ───────────

describe('isValidStatusTransition — cancelled from any non-terminal status', () => {
  test('received → cancelled is valid', () => {
    expect(isValidStatusTransition('received', 'cancelled')).toEqual({ valid: true, terminalError: false });
  });

  test('in-progress → cancelled is valid', () => {
    expect(isValidStatusTransition('in-progress', 'cancelled')).toEqual({ valid: true, terminalError: false });
  });

  test('ready-for-pickup → cancelled is valid', () => {
    expect(isValidStatusTransition('ready-for-pickup', 'cancelled')).toEqual({ valid: true, terminalError: false });
  });
});

// ─── isValidStatusTransition — terminal state detection ──────────────────────

describe('isValidStatusTransition — terminal states block all transitions', () => {
  test('completed → anything returns terminalError: true', () => {
    expect(isValidStatusTransition('completed', 'cancelled')).toEqual({ valid: false, terminalError: true });
    expect(isValidStatusTransition('completed', 'received')).toEqual({ valid: false, terminalError: true });
    expect(isValidStatusTransition('completed', 'in-progress')).toEqual({ valid: false, terminalError: true });
  });

  test('cancelled → anything returns terminalError: true', () => {
    expect(isValidStatusTransition('cancelled', 'received')).toEqual({ valid: false, terminalError: true });
    expect(isValidStatusTransition('cancelled', 'in-progress')).toEqual({ valid: false, terminalError: true });
    expect(isValidStatusTransition('cancelled', 'completed')).toEqual({ valid: false, terminalError: true });
  });
});

// ─── isValidStatusTransition — invalid transitions ───────────────────────────

describe('isValidStatusTransition — invalid transitions', () => {
  test('received → ready-for-pickup (skipping step) is invalid', () => {
    expect(isValidStatusTransition('received', 'ready-for-pickup')).toEqual({ valid: false, terminalError: false });
  });

  test('received → completed (skipping steps) is invalid', () => {
    expect(isValidStatusTransition('received', 'completed')).toEqual({ valid: false, terminalError: false });
  });

  test('in-progress → received (backwards) is invalid', () => {
    expect(isValidStatusTransition('in-progress', 'received')).toEqual({ valid: false, terminalError: false });
  });

  test('ready-for-pickup → received (backwards) is invalid', () => {
    expect(isValidStatusTransition('ready-for-pickup', 'received')).toEqual({ valid: false, terminalError: false });
  });

  test('ready-for-pickup → in-progress (backwards) is invalid', () => {
    expect(isValidStatusTransition('ready-for-pickup', 'in-progress')).toEqual({ valid: false, terminalError: false });
  });
});

// ─── updateOrderStatus — validation ──────────────────────────────────────────

describe('updateOrderStatus — validation', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
    mockPoolConnect.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
  });

  test('throws 400 VALIDATION_ERROR for unrecognised status value', async () => {
    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'shipped'),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(mockQueryTenant).not.toHaveBeenCalled();
  });

  test('throws 400 VALIDATION_ERROR for empty status', async () => {
    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, ''),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR for null status', async () => {
    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, null),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR for undefined status', async () => {
    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, undefined),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});

// ─── updateOrderStatus — order not found ─────────────────────────────────────

describe('updateOrderStatus — order not found', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
    mockPoolConnect.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
  });

  test('throws 404 NOT_FOUND when order does not exist in the shop', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [] });

    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress'),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

// ─── updateOrderStatus — terminal state rejection (Requirement 5.8) ──────────

describe('updateOrderStatus — terminal state rejection', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
    mockPoolConnect.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
  });

  test('throws 422 TERMINAL_ORDER_STATE when order is completed', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [makeOrder({ status: 'completed' })] });

    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'cancelled'),
    ).rejects.toMatchObject({ status: 422, code: 'TERMINAL_ORDER_STATE' });
  });

  test('throws 422 TERMINAL_ORDER_STATE when order is cancelled', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [makeOrder({ status: 'cancelled' })] });

    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress'),
    ).rejects.toMatchObject({ status: 422, code: 'TERMINAL_ORDER_STATE' });
  });

  test('error message mentions the terminal state', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [makeOrder({ status: 'completed' })] });

    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'cancelled'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('terminal'),
    });
  });
});

// ─── updateOrderStatus — invalid lifecycle transition ─────────────────────────

describe('updateOrderStatus — invalid lifecycle transition', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
    mockPoolConnect.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
  });

  test('throws 422 VALIDATION_ERROR for received → completed (skipping steps)', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [makeOrder({ status: 'received' })] });

    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'completed'),
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
  });

  test('throws 422 VALIDATION_ERROR for in-progress → received (backwards)', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [makeOrder({ status: 'in-progress' })] });

    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'received'),
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
  });

  test('throws 422 VALIDATION_ERROR for ready-for-pickup → in-progress (backwards)', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [makeOrder({ status: 'ready-for-pickup' })] });

    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress'),
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
  });
});

// ─── updateOrderStatus — successful update ────────────────────────────────────

describe('updateOrderStatus — successful update', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
    mockPoolConnect.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockEnqueueOrderStatusEmail.mockReset();
    mockEnqueueOrderStatusEmail.mockResolvedValue(undefined);
    mockEnqueueReceiptGenerationJob.mockReset();
    mockEnqueueReceiptGenerationJob.mockResolvedValue(undefined);
  });

  test('returns updated order with new status', async () => {
    setupSuccessfulUpdate({ currentStatus: 'received', newStatus: 'in-progress' });

    const result = await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress');

    expect(result).toMatchObject({
      order: expect.objectContaining({ status: 'in-progress' }),
    });
  });

  test('persists new status in UPDATE orders query', async () => {
    setupSuccessfulUpdate({ currentStatus: 'received', newStatus: 'in-progress' });

    await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress');

    const updateCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /UPDATE orders/i.test(sql),
    );
    expect(updateCall).toBeDefined();
    const params = updateCall[1];
    expect(params).toContain('in-progress');
    expect(params).toContain(ORDER_ID);
    expect(params).toContain(TENANT_ID);
  });

  test('inserts order_status_history row with new status inside the transaction', async () => {
    setupSuccessfulUpdate({ currentStatus: 'received', newStatus: 'in-progress' });

    await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress');

    const historyInsertCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT INTO order_status_history/i.test(sql),
    );
    expect(historyInsertCall).toBeDefined();
    const params = historyInsertCall[1];
    expect(params).toContain(ORDER_ID);
    expect(params).toContain(TENANT_ID);
    expect(params).toContain('in-progress');
  });

  test('wraps updates in a transaction (BEGIN + COMMIT)', async () => {
    setupSuccessfulUpdate({ currentStatus: 'received', newStatus: 'in-progress' });

    await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress');

    const beginCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /BEGIN/i.test(sql),
    );
    const commitCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /COMMIT/i.test(sql),
    );
    expect(beginCall).toBeDefined();
    expect(commitCall).toBeDefined();
  });

  test('releases the DB client after successful update', async () => {
    setupSuccessfulUpdate({ currentStatus: 'received', newStatus: 'in-progress' });

    await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress');

    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  test('rolls back and re-throws on DB error during transaction', async () => {
    const currentOrder = makeOrder({ status: 'received' });
    mockQueryTenant.mockResolvedValueOnce({ rows: [currentOrder] });

    // Transaction: BEGIN succeeds, UPDATE orders fails
    let callIndex = 0;
    mockClientQuery.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve({ rows: [] }); // BEGIN
      if (callIndex === 2) return Promise.resolve({ rows: [] }); // set_config
      if (callIndex === 3) return Promise.reject(new Error('DB constraint violation')); // UPDATE
      return Promise.resolve({ rows: [] });
    });
    mockClientRelease.mockResolvedValue(undefined);
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });

    await expect(
      updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress'),
    ).rejects.toThrow('DB constraint violation');

    const rollbackCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /ROLLBACK/i.test(sql),
    );
    expect(rollbackCall).toBeDefined();
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  test('enqueues customer notification email after successful update', async () => {
    setupSuccessfulUpdate({ currentStatus: 'received', newStatus: 'in-progress' });

    await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress');

    // Allow the fire-and-forget promise to settle
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockEnqueueOrderStatusEmail).toHaveBeenCalledTimes(1);
    expect(mockEnqueueOrderStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        customerId: CUSTOMER_ID,
        tenantId: TENANT_ID,
        shopId: SHOP_ID,
        reference: 'ABCD1234',
        newStatus: 'in-progress',
      }),
    );
  });

  test('still returns order even if email enqueue fails', async () => {
    setupSuccessfulUpdate({ currentStatus: 'received', newStatus: 'in-progress' });
    mockEnqueueOrderStatusEmail.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress');

    // Allow the fire-and-forget rejection to be handled
    await new Promise((resolve) => setImmediate(resolve));

    expect(result).toMatchObject({ order: expect.objectContaining({ status: 'in-progress' }) });
  });

  test('enqueues receipt generation job when status = "completed"', async () => {
    setupSuccessfulUpdate({ currentStatus: 'ready-for-pickup', newStatus: 'completed' });

    await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'completed');

    // Allow the fire-and-forget promise to settle
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockEnqueueReceiptGenerationJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueReceiptGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        shopId: SHOP_ID,
        customerId: CUSTOMER_ID,
        reference: 'ABCD1234',
      }),
    );
  });

  test('does NOT enqueue receipt generation job for non-completed statuses', async () => {
    setupSuccessfulUpdate({ currentStatus: 'received', newStatus: 'in-progress' });

    await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'in-progress');

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockEnqueueReceiptGenerationJob).not.toHaveBeenCalled();
  });

  test('does NOT enqueue receipt generation job when status = "cancelled"', async () => {
    setupSuccessfulUpdate({ currentStatus: 'received', newStatus: 'cancelled' });

    await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'cancelled');

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockEnqueueReceiptGenerationJob).not.toHaveBeenCalled();
  });

  test('still returns order even if receipt job enqueue fails', async () => {
    setupSuccessfulUpdate({ currentStatus: 'ready-for-pickup', newStatus: 'completed' });
    mockEnqueueReceiptGenerationJob.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'completed');

    await new Promise((resolve) => setImmediate(resolve));

    expect(result).toMatchObject({ order: expect.objectContaining({ status: 'completed' }) });
  });

  test('valid transition: in-progress → ready-for-pickup succeeds', async () => {
    setupSuccessfulUpdate({ currentStatus: 'in-progress', newStatus: 'ready-for-pickup' });

    const result = await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'ready-for-pickup');

    expect(result).toMatchObject({
      order: expect.objectContaining({ status: 'ready-for-pickup' }),
    });
  });

  test('valid transition: in-progress → cancelled succeeds', async () => {
    setupSuccessfulUpdate({ currentStatus: 'in-progress', newStatus: 'cancelled' });

    const result = await updateOrderStatus(TENANT_ID, SHOP_ID, ORDER_ID, 'cancelled');

    expect(result).toMatchObject({
      order: expect.objectContaining({ status: 'cancelled' }),
    });
  });
});
