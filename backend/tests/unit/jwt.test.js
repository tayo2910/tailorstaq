/**
 * Unit tests for src/utils/jwt.js
 *
 * Covers:
 *  - signToken produces a valid JWT with the correct payload claims
 *  - verifyToken returns the decoded payload for a valid token
 *  - verifyToken throws TokenExpiredError for an expired token
 *  - verifyToken throws JsonWebTokenError for a tampered/invalid token
 *  - JWT exp is at most iat + 86400 (Requirement 8.2)
 */

import jwt from 'jsonwebtoken';
import { signToken, verifyToken } from '../../src/utils/jwt.js';

const VALID_PAYLOAD = {
  userId: 'user-uuid-1234',
  role: 'tenant_admin',
  tenantId: 'tenant-uuid-5678',
};

describe('signToken', () => {
  test('returns a non-empty string', () => {
    const token = signToken(VALID_PAYLOAD);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  test('payload contains sub equal to userId', () => {
    const token = signToken(VALID_PAYLOAD);
    const decoded = jwt.decode(token);
    expect(decoded.sub).toBe(VALID_PAYLOAD.userId);
  });

  test('payload contains role', () => {
    const token = signToken(VALID_PAYLOAD);
    const decoded = jwt.decode(token);
    expect(decoded.role).toBe(VALID_PAYLOAD.role);
  });

  test('payload contains tenantId', () => {
    const token = signToken(VALID_PAYLOAD);
    const decoded = jwt.decode(token);
    expect(decoded.tenantId).toBe(VALID_PAYLOAD.tenantId);
  });

  test('payload contains iat and exp', () => {
    const token = signToken(VALID_PAYLOAD);
    const decoded = jwt.decode(token);
    expect(typeof decoded.iat).toBe('number');
    expect(typeof decoded.exp).toBe('number');
  });

  test('exp is exactly iat + 86400 (24-hour expiry)', () => {
    const token = signToken(VALID_PAYLOAD);
    const decoded = jwt.decode(token);
    expect(decoded.exp).toBe(decoded.iat + 86400);
  });

  test('tenantId is null when not provided', () => {
    const token = signToken({ userId: 'u1', role: 'customer', tenantId: null });
    const decoded = jwt.decode(token);
    expect(decoded.tenantId).toBeNull();
  });

  test('tenantId defaults to null when undefined', () => {
    const token = signToken({ userId: 'u1', role: 'platform_admin', tenantId: undefined });
    const decoded = jwt.decode(token);
    expect(decoded.tenantId).toBeNull();
  });

  test('throws when userId is missing', () => {
    expect(() => signToken({ role: 'customer', tenantId: null })).toThrow('userId is required');
  });

  test('throws when role is missing', () => {
    expect(() => signToken({ userId: 'u1', tenantId: null })).toThrow('role is required');
  });
});

describe('verifyToken', () => {
  test('returns decoded payload for a valid token', () => {
    const token = signToken(VALID_PAYLOAD);
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe(VALID_PAYLOAD.userId);
    expect(decoded.role).toBe(VALID_PAYLOAD.role);
    expect(decoded.tenantId).toBe(VALID_PAYLOAD.tenantId);
  });

  test('throws TokenExpiredError for an expired token', () => {
    // Sign a token that expired 1 second ago
    const expiredToken = jwt.sign(
      { sub: 'u1', role: 'customer', tenantId: null },
      process.env.JWT_SECRET || 'change_me_to_a_long_random_secret',
      { expiresIn: -1 },
    );
    expect(() => verifyToken(expiredToken)).toThrow(jwt.TokenExpiredError);
  });

  test('throws JsonWebTokenError for a token with an invalid signature', () => {
    const token = signToken(VALID_PAYLOAD);
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => verifyToken(tampered)).toThrow(jwt.JsonWebTokenError);
  });

  test('throws JsonWebTokenError for a completely malformed token', () => {
    expect(() => verifyToken('not.a.jwt')).toThrow(jwt.JsonWebTokenError);
  });

  test('throws JsonWebTokenError for an empty string', () => {
    expect(() => verifyToken('')).toThrow(jwt.JsonWebTokenError);
  });
});
