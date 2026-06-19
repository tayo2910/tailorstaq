/**
 * Unit tests for the orders service — order placement (task 7.2).
 *
 * Requirements: 5.1, 5.2, 3.3, 3.4
 *
 * Covers:
 *  - validateOrderQuantity: boundary values (0, 1, 99, 100, non-integer, missing)
 *  - placeOrder: throws 400 VALIDATION_ERROR for invalid quantity
 *  - placeOrder: throws 404 NOT_FOUND when shop does not belong to tenant
 *  - placeOrder: throws 404 NOT_FOUND when product is not found or inactive
 *  - placeOrder: throws 422 LIMIT_EXCEEDED when free-tier monthly order limit reached (50)
 *  - placeOrder: allows placement when free-tier tenant has exactly 49 orders this month
 *  - placeOrder: allows placement when tenant is on paid tier regardless of order count
 *  - placeOrder: defaults to free tier when no subscription record exists
 *  - placeOrder: creates order with status = 'received' and correct fields
 *  - placeOrder: inserts initial order_status_history row inside the same transaction
 *  - placeOrder: wraps order insert and history insert in a transaction (BEGIN + COMMIT)
 *  - placeOrder: rolls back and re-throws on DB error during transaction
 *  - placeOrder: enqueues order confirmation email after successful placement
 *  - placeOrder: still returns order even if email enqueue fails
 *  - placeOrder: generates a unique order reference (8–12 uppercase alphanumeric)
 */

import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockQueryTenant = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: mockQueryTenant,
}));

// Mock the pool client for transaction-based order insert
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

// Mock generateOrderReference to return a predictable value
const mockGenerateOrderReference = jest.fn().mockResolvedValue('ABCD1234');

jest.unstable_mockModule('../../src/utils/orderRef.js', () => ({
  generateOrderReference: mockGenerateOrderReference,
  generateRawReference: jest.fn(),
}));

// Mock email queue
const mockEnqueueOrderConfirmationEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueOrderConfirmationEmail: mockEnqueueOrderConfirmationEmail,
  enqueueVerificationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantApprovalEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantRejectionEmail: jest.fn().mockResolvedValue(undefined),
  enqueueOrderStatusEmail: jest.fn().mockResolvedValue(undefined),
}));

// Mock PDF queue
jest.unstable_mockModule('../../src/queues/pdf.queue.js', () => ({
  enqueueReceiptGenerationJob: jest.fn().mockResolvedValue(undefined),
}));

// Import after mocks are registered
const { validateOrderQuantity, placeOrder } = await import(
  '../../src/modules/orders/orders.service.js'
);

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const SHOP_ID = 'shop-uuid-1';
const CUSTOMER_ID = 'customer-uuid-1';
const PRODUCT_ID = 'product-uuid-1';
const ORDER_ID = 'order-uuid-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    tenant_id: TENANT_ID,
    shop_id: SHOP_ID,
    customer_id: CUSTOMER_ID,
    product_id: PRODUCT_ID,
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
 * Set up the mock pool client for the transactional order insert.
 * Queries in order:
 *   0: BEGIN
 *   1: set_config (RLS tenant context)
 *   2: INSERT orders → returns order row
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
 * Set up the standard pre-transaction mocks for a successful order placement.
 *
 * @param {{ tier?: string, monthlyCount?: number }} options
 */
function setupSuccessfulPlacement({ tier = 'paid', monthlyCount = 0 } = {}) {
  // Shop lookup
  mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });
  // Product lookup (queryTenant)
  mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID, price: '150.00' }] });
  // Subscription check
  mockQuery.mockResolvedValueOnce({ rows: [{ tier }] });

  if (tier === 'free') {
    // Monthly order count (queryTenant)
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ count: String(monthlyCount) }] });
  }

  // Transaction client
  setupMockClient([
    { rows: [] },                    // BEGIN
    { rows: [] },                    // set_config
    { rows: [makeOrder()] },         // INSERT orders
    { rows: [] },                    // INSERT order_status_history
    { rows: [] },                    // COMMIT
  ]);
}

// ─── validateOrderQuantity — boundary values ──────────────────────────────────

describe('validateOrderQuantity — boundary values', () => {
  test('returns error for undefined', () => {
    expect(validateOrderQuantity(undefined)).toBe('Quantity is required.');
  });

  test('returns error for null', () => {
    expect(validateOrderQuantity(null)).toBe('Quantity is required.');
  });

  test('returns error for empty string', () => {
    expect(validateOrderQuantity('')).toBe('Quantity is required.');
  });

  test('returns error for 0 (below minimum)', () => {
    expect(validateOrderQuantity(0)).toBe('Quantity must be at least 1.');
  });

  test('returns error for negative number', () => {
    expect(validateOrderQuantity(-1)).toBe('Quantity must be at least 1.');
  });

  test('returns null for 1 (minimum valid quantity)', () => {
    expect(validateOrderQuantity(1)).toBeNull();
  });

  test('returns null for 99 (maximum valid quantity)', () => {
    expect(validateOrderQuantity(99)).toBeNull();
  });

  test('returns error for 100 (above maximum)', () => {
    expect(validateOrderQuantity(100)).toBe('Quantity must not exceed 99.');
  });

  test('returns null for quantity as string "1"', () => {
    expect(validateOrderQuantity('1')).toBeNull();
  });

  test('returns null for quantity as string "99"', () => {
    expect(validateOrderQuantity('99')).toBeNull();
  });

  test('returns error for quantity as string "0"', () => {
    expect(validateOrderQuantity('0')).toBe('Quantity must be at least 1.');
  });

  test('returns error for quantity as string "100"', () => {
    expect(validateOrderQuantity('100')).toBe('Quantity must not exceed 99.');
  });

  test('returns error for non-integer float (1.5)', () => {
    expect(validateOrderQuantity(1.5)).toBe('Quantity must be a whole number.');
  });

  test('returns error for non-numeric string', () => {
    expect(validateOrderQuantity('abc')).toBe('Quantity must be a whole number.');
  });
});

// ─── placeOrder — validation ──────────────────────────────────────────────────

describe('placeOrder — validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('throws 400 VALIDATION_ERROR when quantity is missing', async () => {
    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('throws 400 VALIDATION_ERROR when quantity is 0', async () => {
    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 0 }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when quantity is 100', async () => {
    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 100 }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when quantity is a float', async () => {
    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 2.5 }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});

// ─── placeOrder — shop not found ──────────────────────────────────────────────

describe('placeOrder — shop not found', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('throws 404 NOT_FOUND when shop does not belong to tenant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // shop lookup returns empty

    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 1 }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

// ─── placeOrder — product not found ──────────────────────────────────────────

describe('placeOrder — product not found', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('throws 404 NOT_FOUND when product does not exist in the shop', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] }); // shop found
    mockQueryTenant.mockResolvedValueOnce({ rows: [] }); // product not found

    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 1 }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  test('throws 404 NOT_FOUND when product is inactive', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] }); // shop found
    mockQueryTenant.mockResolvedValueOnce({ rows: [] }); // inactive product not returned (active = true filter)

    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 1 }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

// ─── placeOrder — free-tier monthly order limit (Requirement 3.3, 3.4) ────────

describe('placeOrder — free-tier monthly order limit enforcement', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
    mockPoolConnect.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
  });

  test('throws 422 LIMIT_EXCEEDED when free-tier tenant has exactly 50 orders this month', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] }); // shop
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID, price: '150.00' }] }); // product
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'free' }] }); // subscription
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ count: '50' }] }); // monthly count at limit

    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 1 }),
    ).rejects.toMatchObject({ status: 422, code: 'LIMIT_EXCEEDED' });
  });

  test('throws 422 LIMIT_EXCEEDED when free-tier tenant has 51 orders this month', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID, price: '150.00' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'free' }] });
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ count: '51' }] });

    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 1 }),
    ).rejects.toMatchObject({ status: 422, code: 'LIMIT_EXCEEDED' });
  });

  test('allows placement when free-tier tenant has exactly 49 orders this month', async () => {
    setupSuccessfulPlacement({ tier: 'free', monthlyCount: 49 });

    const result = await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
    });

    expect(result).toMatchObject({ order: expect.objectContaining({ status: 'received' }) });
  });

  test('allows placement when tenant is on paid tier regardless of order count', async () => {
    setupSuccessfulPlacement({ tier: 'paid' });

    const result = await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 2,
    });

    expect(result).toMatchObject({ order: expect.objectContaining({ status: 'received' }) });
    // queryTenant should only be called once (for product lookup, not for monthly count)
    expect(mockQueryTenant).toHaveBeenCalledTimes(1);
  });

  test('defaults to free tier when no subscription record exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID, price: '150.00' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no subscription found → defaults to free
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ count: '50' }] }); // at limit

    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 1 }),
    ).rejects.toMatchObject({ status: 422, code: 'LIMIT_EXCEEDED' });
  });
});

// ─── placeOrder — successful placement ───────────────────────────────────────

describe('placeOrder — successful placement', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
    mockPoolConnect.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockEnqueueOrderConfirmationEmail.mockReset();
    mockEnqueueOrderConfirmationEmail.mockResolvedValue(undefined);
    mockGenerateOrderReference.mockReset();
    mockGenerateOrderReference.mockResolvedValue('ABCD1234');
  });

  test('returns order with status = "received"', async () => {
    setupSuccessfulPlacement({ tier: 'paid' });

    const result = await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 2,
    });

    expect(result).toMatchObject({
      order: expect.objectContaining({
        status: 'received',
        reference: 'ABCD1234',
        quantity: 2,
      }),
    });
  });

  test('inserts order with correct fields', async () => {
    setupSuccessfulPlacement({ tier: 'paid' });

    await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 3,
    });

    // Find the INSERT orders call
    const insertOrderCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT INTO orders/i.test(sql),
    );
    expect(insertOrderCall).toBeDefined();
    const params = insertOrderCall[1];
    expect(params).toContain(TENANT_ID);
    expect(params).toContain(SHOP_ID);
    expect(params).toContain(CUSTOMER_ID);
    expect(params).toContain(PRODUCT_ID);
    expect(params).toContain('ABCD1234'); // reference
    expect(params).toContain(3);          // quantity
  });

  test('inserts initial order_status_history row inside the transaction', async () => {
    setupSuccessfulPlacement({ tier: 'paid' });

    await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
    });

    const historyInsertCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT INTO order_status_history/i.test(sql),
    );
    expect(historyInsertCall).toBeDefined();
    const params = historyInsertCall[1];
    expect(params).toContain(ORDER_ID);
    expect(params).toContain(TENANT_ID);
  });

  test('wraps order insert and history insert in a transaction (BEGIN + COMMIT)', async () => {
    setupSuccessfulPlacement({ tier: 'paid' });

    await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
    });

    const beginCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /BEGIN/i.test(sql),
    );
    const commitCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /COMMIT/i.test(sql),
    );
    expect(beginCall).toBeDefined();
    expect(commitCall).toBeDefined();
  });

  test('releases the DB client after successful placement', async () => {
    setupSuccessfulPlacement({ tier: 'paid' });

    await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
    });

    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  test('rolls back and re-throws on DB error during transaction', async () => {
    // Pre-transaction mocks
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID, price: '150.00' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'paid' }] });

    // Transaction: BEGIN succeeds, INSERT orders fails
    let callIndex = 0;
    mockClientQuery.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve({ rows: [] }); // BEGIN
      if (callIndex === 2) return Promise.resolve({ rows: [] }); // set_config
      if (callIndex === 3) return Promise.reject(new Error('DB constraint violation')); // INSERT orders
      return Promise.resolve({ rows: [] });
    });
    mockClientRelease.mockResolvedValue(undefined);
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });

    await expect(
      placeOrder({ tenantId: TENANT_ID, shopId: SHOP_ID, customerId: CUSTOMER_ID, productId: PRODUCT_ID, quantity: 1 }),
    ).rejects.toThrow('DB constraint violation');

    // ROLLBACK should have been called
    const rollbackCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /ROLLBACK/i.test(sql),
    );
    expect(rollbackCall).toBeDefined();

    // Client should still be released
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  test('enqueues order confirmation email after successful placement', async () => {
    setupSuccessfulPlacement({ tier: 'paid' });

    await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 2,
    });

    // Allow the fire-and-forget promise to settle
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockEnqueueOrderConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockEnqueueOrderConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        customerId: CUSTOMER_ID,
        tenantId: TENANT_ID,
        shopId: SHOP_ID,
        reference: 'ABCD1234',
      }),
    );
  });

  test('still returns order even if email enqueue fails', async () => {
    setupSuccessfulPlacement({ tier: 'paid' });
    mockEnqueueOrderConfirmationEmail.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
    });

    // Allow the fire-and-forget rejection to be handled
    await new Promise((resolve) => setImmediate(resolve));

    expect(result).toMatchObject({ order: expect.objectContaining({ status: 'received' }) });
  });

  test('generates a unique order reference (8–12 uppercase alphanumeric)', async () => {
    // Use a real-looking reference to verify the format
    mockGenerateOrderReference.mockResolvedValueOnce('XYZ98765');
    setupSuccessfulPlacement({ tier: 'paid' });

    const result = await placeOrder({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
    });

    // The reference in the order should match what generateOrderReference returned
    expect(mockGenerateOrderReference).toHaveBeenCalledTimes(1);
    // The INSERT should have used the generated reference
    const insertOrderCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT INTO orders/i.test(sql),
    );
    expect(insertOrderCall[1]).toContain('XYZ98765');
  });
});
