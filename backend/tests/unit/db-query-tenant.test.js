/**
 * Unit tests for the queryTenant helper and its internal SQL rewriting logic.
 *
 * These tests mock the pg Pool so no real database connection is required.
 */

import { jest } from '@jest/globals';

// ─── Mock the pool before importing the module under test ────────────────────

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();

jest.unstable_mockModule('../../src/config/db.js', () => ({
  pool: {
    connect: mockConnect,
    query: mockQuery,
  },
}));

// Import AFTER mocking
const { queryTenant, query } = await import('../../src/db/queries/base.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClient(queryResults = []) {
  let callCount = 0;
  const clientQuery = jest.fn(async () => {
    const result = queryResults[callCount] ?? { rows: [], rowCount: 0 };
    callCount++;
    return result;
  });
  return { query: clientQuery, release: mockRelease };
}

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('queryTenant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws when tenantId is missing', async () => {
    await expect(queryTenant('SELECT 1', [], null)).rejects.toThrow(
      'tenantId is required',
    );
    await expect(queryTenant('SELECT 1', [], undefined)).rejects.toThrow(
      'tenantId is required',
    );
    await expect(queryTenant('SELECT 1', [], '')).rejects.toThrow(
      'tenantId is required',
    );
  });

  test('checks out a client, begins a transaction, and commits on success', async () => {
    const dataResult = { rows: [{ id: 1 }], rowCount: 1 };
    // Calls: BEGIN, set_config, actual query, COMMIT
    const client = makeClient([{}, {}, dataResult, {}]);
    mockConnect.mockResolvedValue(client);

    const result = await queryTenant('SELECT * FROM orders', [], TENANT_ID);

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(result).toBe(dataResult);
  });

  test('sets app.current_tenant_id via set_config', async () => {
    const client = makeClient([{}, {}, { rows: [] }, {}]);
    mockConnect.mockResolvedValue(client);

    await queryTenant('SELECT * FROM orders', [], TENANT_ID);

    expect(client.query).toHaveBeenNthCalledWith(
      2,
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant_id', TENANT_ID],
    );
  });

  test('appends tenant_id filter to a SELECT with no WHERE clause', async () => {
    const client = makeClient([{}, {}, { rows: [] }, {}]);
    mockConnect.mockResolvedValue(client);

    await queryTenant('SELECT * FROM orders', [], TENANT_ID);

    const [actualSql, actualParams] = client.query.mock.calls[2];
    expect(actualSql).toMatch(/WHERE tenant_id = \$1/i);
    expect(actualParams).toEqual([TENANT_ID]);
  });

  test('appends AND tenant_id filter to a SELECT with an existing WHERE clause', async () => {
    const client = makeClient([{}, {}, { rows: [] }, {}]);
    mockConnect.mockResolvedValue(client);

    await queryTenant(
      'SELECT * FROM orders WHERE status = $1',
      ['received'],
      TENANT_ID,
    );

    const [actualSql, actualParams] = client.query.mock.calls[2];
    expect(actualSql).toMatch(/WHERE status = \$1 AND tenant_id = \$2/i);
    expect(actualParams).toEqual(['received', TENANT_ID]);
  });

  test('inserts WHERE clause before ORDER BY when no WHERE exists', async () => {
    const client = makeClient([{}, {}, { rows: [] }, {}]);
    mockConnect.mockResolvedValue(client);

    await queryTenant(
      'SELECT * FROM orders ORDER BY created_at DESC',
      [],
      TENANT_ID,
    );

    const [actualSql] = client.query.mock.calls[2];
    expect(actualSql).toMatch(/WHERE tenant_id = \$1 ORDER BY created_at DESC/i);
  });

  test('inserts WHERE clause before LIMIT when no WHERE exists', async () => {
    const client = makeClient([{}, {}, { rows: [] }, {}]);
    mockConnect.mockResolvedValue(client);

    await queryTenant('SELECT * FROM products LIMIT 10', [], TENANT_ID);

    const [actualSql] = client.query.mock.calls[2];
    expect(actualSql).toMatch(/WHERE tenant_id = \$1 LIMIT 10/i);
  });

  test('does NOT modify INSERT statements (caller supplies tenant_id in VALUES)', async () => {
    const client = makeClient([{}, {}, { rows: [] }, {}]);
    mockConnect.mockResolvedValue(client);

    const insertSql =
      'INSERT INTO products (name, tenant_id) VALUES ($1, $2) RETURNING id';
    await queryTenant(insertSql, ['T-shirt', TENANT_ID], TENANT_ID);

    const [actualSql, actualParams] = client.query.mock.calls[2];
    // SQL should be unchanged
    expect(actualSql).toBe(insertSql);
    // tenantId is still appended to params (harmless extra param for INSERT)
    expect(actualParams).toEqual(['T-shirt', TENANT_ID, TENANT_ID]);
  });

  test('rolls back and releases client on query error', async () => {
    const dbError = new Error('DB failure');
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // set_config
        .mockRejectedValueOnce(dbError) // actual query
        .mockResolvedValueOnce({}), // ROLLBACK
      release: mockRelease,
    };
    mockConnect.mockResolvedValue(client);

    await expect(
      queryTenant('SELECT * FROM orders', [], TENANT_ID),
    ).rejects.toThrow('DB failure');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test('releases client even when ROLLBACK itself throws', async () => {
    const dbError = new Error('DB failure');
    const rollbackError = new Error('ROLLBACK failed');
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // set_config
        .mockRejectedValueOnce(dbError) // actual query
        .mockRejectedValueOnce(rollbackError), // ROLLBACK
      release: mockRelease,
    };
    mockConnect.mockResolvedValue(client);

    await expect(
      queryTenant('SELECT * FROM orders', [], TENANT_ID),
    ).rejects.toThrow();

    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe('query (non-tenant helper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('delegates directly to pool.query with provided sql and params', async () => {
    const expected = { rows: [{ count: 5 }], rowCount: 1 };
    mockQuery.mockResolvedValue(expected);

    const result = await query('SELECT COUNT(*) FROM users WHERE email = $1', [
      'test@example.com',
    ]);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) FROM users WHERE email = $1',
      ['test@example.com'],
    );
    expect(result).toBe(expected);
  });

  test('defaults params to empty array when not provided', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await query('SELECT 1');

    expect(mockQuery).toHaveBeenCalledWith('SELECT 1', []);
  });
});
