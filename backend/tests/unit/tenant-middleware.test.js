/**
 * Unit tests for the tenant ownership middleware.
 *
 * Requirements: 7.2, 7.3, 8.8
 *
 * The pg pool is mocked so no real database connection is required.
 */

import { jest } from '@jest/globals';

// ─── Mock the pool before importing the module under test ────────────────────

const mockPoolQuery = jest.fn();

jest.unstable_mockModule('../../src/config/db.js', () => ({
  pool: {
    query: mockPoolQuery,
    connect: jest.fn(),
  },
}));

// Import AFTER mocking
const { tenantMiddleware } = await import(
  '../../src/middleware/tenant.js'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SHOP_ID  = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeReq({ tenantId = TENANT_A, shopId = SHOP_ID } = {}) {
  return {
    user: { userId: 'user-1', role: 'tenant_admin', tenantId },
    params: { shopId },
  };
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res); // allow chaining: res.status(403).json(...)
  return res;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('tenantMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Matching tenant ────────────────────────────────────────────────────────

  test('calls next() when req.user.tenantId matches the shop tenant_id', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ tenant_id: TENANT_A }],
      rowCount: 1,
    });

    const req = makeReq({ tenantId: TENANT_A, shopId: SHOP_ID });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  // ── Mismatching tenant ─────────────────────────────────────────────────────

  test('returns 403 CROSS_TENANT_ACCESS when tenantId does not match shop tenant_id', async () => {
    // First call: shop lookup returns TENANT_B as owner
    // Second call: audit log insert (fire-and-forget)
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ tenant_id: TENANT_B }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit log insert

    const req = makeReq({ tenantId: TENANT_A, shopId: SHOP_ID });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'CROSS_TENANT_ACCESS' }),
      }),
    );
  });

  test('writes an audit_logs row on cross-tenant mismatch', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ tenant_id: TENANT_B }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const req = makeReq({ tenantId: TENANT_A, shopId: SHOP_ID });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    // Wait for the fire-and-forget audit log promise to settle
    await new Promise((r) => setImmediate(r));

    // The second pool.query call should be the audit log INSERT
    const auditCall = mockPoolQuery.mock.calls[1];
    expect(auditCall[0]).toMatch(/INSERT INTO audit_logs/i);
    expect(auditCall[1]).toEqual(
      expect.arrayContaining([TENANT_A, SHOP_ID, 'CROSS_TENANT_ACCESS']),
    );
  });

  test('audit log INSERT includes requesting_tenant_id, target_resource_id, and action', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ tenant_id: TENANT_B }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const req = makeReq({ tenantId: TENANT_A, shopId: SHOP_ID });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);
    await new Promise((r) => setImmediate(r));

    const [auditSql, auditParams] = mockPoolQuery.mock.calls[1];
    expect(auditSql).toMatch(/requesting_tenant_id/i);
    expect(auditSql).toMatch(/target_resource_id/i);
    expect(auditSql).toMatch(/action/i);
    expect(auditParams[0]).toBe(TENANT_A);   // requesting_tenant_id
    expect(auditParams[1]).toBe(SHOP_ID);    // target_resource_id
    expect(auditParams[2]).toBe('CROSS_TENANT_ACCESS'); // action
  });

  // ── Missing / null tenantId (platform_admin or customer) ──────────────────

  test('calls next() when req.user.tenantId is null (e.g. platform_admin)', async () => {
    const req = makeReq({ tenantId: null, shopId: SHOP_ID });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  test('calls next() when req.user is undefined', async () => {
    const req = { user: undefined, params: { shopId: SHOP_ID } };
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  // ── Missing shopId ─────────────────────────────────────────────────────────

  test('calls next() when req.params.shopId is absent', async () => {
    const req = {
      user: { userId: 'user-1', role: 'tenant_admin', tenantId: TENANT_A },
      params: {},
    };
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  // ── Shop not found ─────────────────────────────────────────────────────────

  test('calls next() when the shop does not exist (lets route handler return 404)', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const req = makeReq({ tenantId: TENANT_A, shopId: SHOP_ID });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  // ── Database error ─────────────────────────────────────────────────────────

  test('returns 500 INTERNAL_ERROR when the shop lookup query throws', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeReq({ tenantId: TENANT_A, shopId: SHOP_ID });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      }),
    );
  });

  // ── Audit log failure does not affect 403 response ────────────────────────

  test('still returns 403 even when the audit log INSERT fails', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ tenant_id: TENANT_B }], rowCount: 1 })
      .mockRejectedValueOnce(new Error('Audit log DB error'));

    const req = makeReq({ tenantId: TENANT_A, shopId: SHOP_ID });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);
    await new Promise((r) => setImmediate(r));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'CROSS_TENANT_ACCESS' }),
      }),
    );
  });

  // ── Shop lookup uses raw query (not tenant-scoped) ─────────────────────────

  test('shop lookup queries by id only (no tenant_id filter) to allow cross-tenant comparison', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ tenant_id: TENANT_A }],
      rowCount: 1,
    });

    const req = makeReq({ tenantId: TENANT_A, shopId: SHOP_ID });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    const [shopSql, shopParams] = mockPoolQuery.mock.calls[0];
    expect(shopSql).toMatch(/SELECT.*tenant_id.*FROM shops WHERE id = \$1/i);
    expect(shopParams).toEqual([SHOP_ID]);
  });
});
