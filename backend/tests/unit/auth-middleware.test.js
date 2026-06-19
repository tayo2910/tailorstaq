/**
 * Unit tests for src/middleware/auth.js
 *
 * Tests cover:
 *  - authenticate: missing token, invalid token, expired token, valid token
 *  - requireRole: missing req.user, wrong role, correct role, multiple allowed roles
 */

import { jest } from '@jest/globals';

// ─── Mock jwt.js utils before importing the module under test ────────────────

const mockVerifyToken = jest.fn();

jest.unstable_mockModule('../../src/utils/jwt.js', () => ({
  verifyToken: mockVerifyToken,
}));

// Import AFTER mocking
const { authenticate, requireRole } = await import(
  '../../src/middleware/auth.js'
);

// We also need the real jsonwebtoken error classes for instanceof checks
import jwt from 'jsonwebtoken';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal Express-like req object */
function makeReq(authHeader) {
  return {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  };
}

/** Build a minimal Express-like res object that captures the response */
function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

const VALID_PAYLOAD = {
  sub: 'user-uuid-123',
  role: 'tenant_admin',
  tenantId: 'tenant-uuid-456',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 86400,
};

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('authenticate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 UNAUTHENTICATED when Authorization header is absent', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body.error.code).toBe('UNAUTHENTICATED');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 UNAUTHENTICATED when Authorization header does not start with Bearer', () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body.error.code).toBe('UNAUTHENTICATED');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 UNAUTHENTICATED when Bearer token is empty string', () => {
    const req = makeReq('Bearer ');
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body.error.code).toBe('UNAUTHENTICATED');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 UNAUTHENTICATED when verifyToken throws JsonWebTokenError', () => {
    mockVerifyToken.mockImplementation(() => {
      throw new jwt.JsonWebTokenError('invalid signature');
    });

    const req = makeReq('Bearer bad.token.here');
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body.error.code).toBe('UNAUTHENTICATED');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 TOKEN_EXPIRED when verifyToken throws TokenExpiredError', () => {
    mockVerifyToken.mockImplementation(() => {
      throw new jwt.TokenExpiredError('jwt expired', new Date());
    });

    const req = makeReq('Bearer expired.token.here');
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body.error.code).toBe('TOKEN_EXPIRED');
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches req.user and calls next() on a valid token', () => {
    mockVerifyToken.mockReturnValue(VALID_PAYLOAD);

    const req = makeReq('Bearer valid.token.here');
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({
      userId: VALID_PAYLOAD.sub,
      role: VALID_PAYLOAD.role,
      tenantId: VALID_PAYLOAD.tenantId,
    });
    expect(res._status).toBeNull();
  });

  test('sets tenantId to null when payload.tenantId is absent', () => {
    mockVerifyToken.mockReturnValue({
      sub: 'admin-uuid',
      role: 'platform_admin',
      // tenantId intentionally omitted
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    });

    const req = makeReq('Bearer valid.admin.token');
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.tenantId).toBeNull();
  });

  test('maps JWT sub claim to userId on req.user', () => {
    mockVerifyToken.mockReturnValue(VALID_PAYLOAD);

    const req = makeReq('Bearer valid.token.here');
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(req.user.userId).toBe(VALID_PAYLOAD.sub);
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe('requireRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 UNAUTHENTICATED when req.user is not set', () => {
    const guard = requireRole('tenant_admin');
    const req = {}; // no user
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body.error.code).toBe('UNAUTHENTICATED');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 FORBIDDEN when user role is not in the allowed list', () => {
    const guard = requireRole('platform_admin');
    const req = { user: { userId: 'u1', role: 'customer', tenantId: null } };
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(res._status).toBe(403);
    expect(res._body.error.code).toBe('FORBIDDEN');
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() when user role matches the single allowed role', () => {
    const guard = requireRole('tenant_admin');
    const req = {
      user: { userId: 'u1', role: 'tenant_admin', tenantId: 'tid' },
    };
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  test('calls next() when user role is one of multiple allowed roles', () => {
    const guard = requireRole('tenant_admin', 'platform_admin');
    const req = {
      user: { userId: 'u1', role: 'platform_admin', tenantId: null },
    };
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('returns 403 FORBIDDEN when user role is not in a multi-role allowed list', () => {
    const guard = requireRole('tenant_admin', 'platform_admin');
    const req = { user: { userId: 'u1', role: 'customer', tenantId: null } };
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(res._status).toBe(403);
    expect(res._body.error.code).toBe('FORBIDDEN');
  });

  test('each call to requireRole returns an independent middleware function', () => {
    const guardAdmin = requireRole('platform_admin');
    const guardTenant = requireRole('tenant_admin');

    expect(guardAdmin).not.toBe(guardTenant);
    expect(typeof guardAdmin).toBe('function');
    expect(typeof guardTenant).toBe('function');
  });
});
