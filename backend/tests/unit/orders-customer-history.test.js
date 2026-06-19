/**
 * Unit tests for the orders service — customer order list and detail (task 7.7).
 *
 * Requirements: 5.5, 5.6
 *
 * Covers:
 *  listCustomerOrders:
 *   - returns orders array with expected fields (reference, shop name, product name,
 *     quantity, status, last updated)
 *   - returns empty array when customer has no orders
 *   - uses the authenticated customer's id to scope the query
 *   - orders are sorted by updated_at DESC (most recent first)
 *   - does NOT apply tenant scoping (customers can view orders across all shops)
 *
 *  getCustomerOrderDetail:
 *   - returns order with full fields plus status history
 *   - status history is returned in chronological order (recorded_at ASC)
 *   - throws 404 NOT_FOUND when order does not exist
 *   - throws 404 NOT_FOUND when order belongs to a different customer
 *   - returns order with multiple history entries
 *   - status history contains id, status, recorded_at fields
 */

import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockQueryTenant = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: mockQueryTenant,
}));

// Mock the pool (not used directly by customer order functions, but imported by service)
jest.unstable_mockModule('../../src/config/db.js', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
    on: jest.fn(),
  },
}));

// Mock order reference generator (imported by service but not used in these functions)
jest.unstable_mockModule('../../src/utils/orderRef.js', () => ({
  generateOrderReference: jest.fn().mockResolvedValue('ABCD1234'),
  generateRawReference: jest.fn(),
}));

// Mock email queue (imported by service)
jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueOrderConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueOrderStatusEmail: jest.fn().mockResolvedValue(undefined),
  enqueueVerificationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantApprovalEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantRejectionEmail: jest.fn().mockResolvedValue(undefined),
}));

// Mock PDF queue (imported by service)
jest.unstable_mockModule('../../src/queues/pdf.queue.js', () => ({
  enqueueReceiptGenerationJob: jest.fn().mockResolvedValue(undefined),
}));

// Import service after mocks are registered
const { listCustomerOrders, getCustomerOrderDetail } = await import(
  '../../src/modules/orders/orders.service.js'
);

// ─── Constants ────────────────────────────────────────────────────────────────

const CUSTOMER_ID = 'customer-uuid-1';
const OTHER_CUSTOMER_ID = 'customer-uuid-2';
const ORDER_ID = 'order-uuid-1';
const ORDER_ID_2 = 'order-uuid-2';
const SHOP_ID = 'shop-uuid-1';
const SHOP_ID_2 = 'shop-uuid-2';
const PRODUCT_ID = 'product-uuid-1';
const TENANT_ID = 'tenant-uuid-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOrderRow(overrides = {}) {
  return {
    id: ORDER_ID,
    reference: 'ABCD1234',
    quantity: 2,
    unit_price: '150.00',
    status: 'received',
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T10:00:00.000Z',
    shop_name: 'NE Clothiers',
    product_name: 'Classic Suit',
    ...overrides,
  };
}

function makeOrderDetailRow(overrides = {}) {
  return {
    id: ORDER_ID,
    reference: 'ABCD1234',
    quantity: 2,
    unit_price: '150.00',
    status: 'in-progress',
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T12:00:00.000Z',
    shop_name: 'NE Clothiers',
    product_name: 'Classic Suit',
    product_id: PRODUCT_ID,
    shop_id: SHOP_ID,
    tenant_id: TENANT_ID,
    ...overrides,
  };
}

function makeHistoryRow(overrides = {}) {
  return {
    id: 'history-uuid-1',
    status: 'received',
    recorded_at: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

// ─── listCustomerOrders ───────────────────────────────────────────────────────

describe('listCustomerOrders — returns customer orders across all shops', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('returns orders array with expected fields', async () => {
    const orderRow = makeOrderRow();
    mockQuery.mockResolvedValueOnce({ rows: [orderRow] });

    const result = await listCustomerOrders(CUSTOMER_ID);

    expect(result).toEqual({ orders: [orderRow] });
    expect(result.orders[0]).toMatchObject({
      id: ORDER_ID,
      reference: 'ABCD1234',
      quantity: 2,
      status: 'received',
      updated_at: expect.any(String),
      shop_name: 'NE Clothiers',
      product_name: 'Classic Suit',
    });
  });

  test('returns empty array when customer has no orders', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await listCustomerOrders(CUSTOMER_ID);

    expect(result).toEqual({ orders: [] });
  });

  test('queries with the authenticated customer id as the scope', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listCustomerOrders(CUSTOMER_ID);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE\s+o\.customer_id\s*=\s*\$1/i);
    expect(params).toContain(CUSTOMER_ID);
  });

  test('does NOT use queryTenant (customer orders cross all shops)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listCustomerOrders(CUSTOMER_ID);

    expect(mockQueryTenant).not.toHaveBeenCalled();
  });

  test('returns orders sorted by updated_at DESC in the query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listCustomerOrders(CUSTOMER_ID);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY\s+o\.updated_at\s+DESC/i);
  });

  test('returns multiple orders for a customer', async () => {
    const order1 = makeOrderRow({
      id: ORDER_ID,
      reference: 'ABCD1234',
      shop_name: 'NE Clothiers',
      updated_at: '2024-01-16T10:00:00.000Z',
    });
    const order2 = makeOrderRow({
      id: ORDER_ID_2,
      reference: 'EFGH5678',
      shop_name: 'Lagos Tailors',
      updated_at: '2024-01-15T10:00:00.000Z',
    });
    mockQuery.mockResolvedValueOnce({ rows: [order1, order2] });

    const result = await listCustomerOrders(CUSTOMER_ID);

    expect(result.orders).toHaveLength(2);
    expect(result.orders[0].reference).toBe('ABCD1234');
    expect(result.orders[1].reference).toBe('EFGH5678');
  });

  test('includes shop name and product name in each order row', async () => {
    const orderRow = makeOrderRow({ shop_name: 'Lagos Tailors', product_name: 'Agbada' });
    mockQuery.mockResolvedValueOnce({ rows: [orderRow] });

    const result = await listCustomerOrders(CUSTOMER_ID);

    expect(result.orders[0].shop_name).toBe('Lagos Tailors');
    expect(result.orders[0].product_name).toBe('Agbada');
  });
});

// ─── getCustomerOrderDetail ───────────────────────────────────────────────────

describe('getCustomerOrderDetail — returns full order detail with status history', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('returns order and statusHistory when order belongs to customer', async () => {
    const orderRow = makeOrderDetailRow();
    const historyRow = makeHistoryRow();

    mockQuery
      .mockResolvedValueOnce({ rows: [orderRow] })    // order lookup
      .mockResolvedValueOnce({ rows: [historyRow] }); // history lookup

    const result = await getCustomerOrderDetail(CUSTOMER_ID, ORDER_ID);

    expect(result).toMatchObject({
      order: expect.objectContaining({
        id: ORDER_ID,
        reference: 'ABCD1234',
        shop_name: 'NE Clothiers',
        product_name: 'Classic Suit',
        product_id: PRODUCT_ID,
        shop_id: SHOP_ID,
        tenant_id: TENANT_ID,
      }),
      statusHistory: [historyRow],
    });
  });

  test('throws 404 NOT_FOUND when order does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // order not found

    await expect(
      getCustomerOrderDetail(CUSTOMER_ID, ORDER_ID),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  test('throws 404 NOT_FOUND when order belongs to a different customer', async () => {
    // The query filters on customer_id so a different customer's order returns no rows
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      getCustomerOrderDetail(OTHER_CUSTOMER_ID, ORDER_ID),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  test('order query filters by both order id and customer id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(getCustomerOrderDetail(CUSTOMER_ID, ORDER_ID)).rejects.toThrow();

    const [sql, params] = mockQuery.mock.calls[0];
    expect(params).toContain(ORDER_ID);
    expect(params).toContain(CUSTOMER_ID);
  });

  test('returns multiple status history entries in chronological order', async () => {
    const orderRow = makeOrderDetailRow({ status: 'in-progress' });
    const history1 = makeHistoryRow({
      id: 'history-uuid-1',
      status: 'received',
      recorded_at: '2024-01-15T10:00:00.000Z',
    });
    const history2 = makeHistoryRow({
      id: 'history-uuid-2',
      status: 'in-progress',
      recorded_at: '2024-01-15T12:00:00.000Z',
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [orderRow] })
      .mockResolvedValueOnce({ rows: [history1, history2] });

    const result = await getCustomerOrderDetail(CUSTOMER_ID, ORDER_ID);

    expect(result.statusHistory).toHaveLength(2);
    expect(result.statusHistory[0].status).toBe('received');
    expect(result.statusHistory[1].status).toBe('in-progress');
  });

  test('status history query orders by recorded_at ASC', async () => {
    const orderRow = makeOrderDetailRow();
    mockQuery
      .mockResolvedValueOnce({ rows: [orderRow] })
      .mockResolvedValueOnce({ rows: [] });

    await getCustomerOrderDetail(CUSTOMER_ID, ORDER_ID);

    const [historySql] = mockQuery.mock.calls[1];
    expect(historySql).toMatch(/ORDER BY\s+recorded_at\s+ASC/i);
  });

  test('status history query filters by the correct order id', async () => {
    const orderRow = makeOrderDetailRow();
    mockQuery
      .mockResolvedValueOnce({ rows: [orderRow] })
      .mockResolvedValueOnce({ rows: [] });

    await getCustomerOrderDetail(CUSTOMER_ID, ORDER_ID);

    const [, historyParams] = mockQuery.mock.calls[1];
    expect(historyParams).toContain(ORDER_ID);
  });

  test('each status history entry contains id, status, and recorded_at fields', async () => {
    const orderRow = makeOrderDetailRow();
    const historyRow = makeHistoryRow({
      id: 'history-uuid-1',
      status: 'received',
      recorded_at: '2024-01-15T10:00:00.000Z',
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [orderRow] })
      .mockResolvedValueOnce({ rows: [historyRow] });

    const result = await getCustomerOrderDetail(CUSTOMER_ID, ORDER_ID);

    expect(result.statusHistory[0]).toMatchObject({
      id: expect.any(String),
      status: expect.any(String),
      recorded_at: expect.any(String),
    });
  });

  test('returns empty status history array when no history rows exist', async () => {
    const orderRow = makeOrderDetailRow();
    mockQuery
      .mockResolvedValueOnce({ rows: [orderRow] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getCustomerOrderDetail(CUSTOMER_ID, ORDER_ID);

    expect(result.statusHistory).toEqual([]);
  });

  test('does NOT use queryTenant (customer views own orders regardless of tenant)', async () => {
    const orderRow = makeOrderDetailRow();
    mockQuery
      .mockResolvedValueOnce({ rows: [orderRow] })
      .mockResolvedValueOnce({ rows: [] });

    await getCustomerOrderDetail(CUSTOMER_ID, ORDER_ID);

    expect(mockQueryTenant).not.toHaveBeenCalled();
  });
});
