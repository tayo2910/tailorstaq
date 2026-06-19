/**
 * Unit tests for auth module — login, lockout counter, and password strength.
 *
 * Task 3.4 — Requirements: 8.2, 8.4, 8.5
 *
 * Covers:
 *  - Password strength validation boundary values (Requirement 4.1)
 *  - JWT claim structure: sub, role, tenantId, exp ≤ iat + 86400 (Requirement 8.2)
 *  - Lockout counter increment on failed login (Requirement 8.4)
 *  - Lockout counter reset on successful login (Requirement 8.4)
 *  - Account lock after 5 consecutive failures (Requirement 8.5)
 *  - Locked account rejection (Requirement 8.5)
 */

import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: jest.fn(),
}));

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueVerificationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
}));

// Import after mocks are registered
const { validatePasswordStrength, login } = await import(
  '../../src/modules/auth/auth.service.js'
);

// ─── validatePasswordStrength — boundary values ───────────────────────────────

describe('validatePasswordStrength — boundary values', () => {
  // Length boundaries
  test('returns error for password of length 7 (one below minimum)', () => {
    // 7 chars, meets all other rules
    expect(validatePasswordStrength('Abc1!xy')).toBe(
      'Password must be at least 8 characters long.',
    );
  });

  test('returns null for password of exactly 8 characters meeting all rules', () => {
    expect(validatePasswordStrength('Abcde1!x')).toBeNull();
  });

  test('returns null for a long password (100+ characters) meeting all rules', () => {
    const longPassword = 'Aa1!' + 'x'.repeat(100);
    expect(validatePasswordStrength(longPassword)).toBeNull();
  });

  // Missing character class boundaries
  test('returns error when password is exactly 8 chars but missing uppercase', () => {
    expect(validatePasswordStrength('abcde1!x')).toBe(
      'Password must contain at least one uppercase letter.',
    );
  });

  test('returns error when password is exactly 8 chars but missing lowercase', () => {
    expect(validatePasswordStrength('ABCDE1!X')).toBe(
      'Password must contain at least one lowercase letter.',
    );
  });

  test('returns error when password is exactly 8 chars but missing digit', () => {
    expect(validatePasswordStrength('Abcdef!x')).toBe(
      'Password must contain at least one digit.',
    );
  });

  test('returns error when password is exactly 8 chars but missing special character', () => {
    expect(validatePasswordStrength('Abcde12x')).toBe(
      'Password must contain at least one special character.',
    );
  });

  // Null / empty / non-string inputs
  test('returns error for empty string', () => {
    expect(validatePasswordStrength('')).toBe('Password is required.');
  });

  test('returns error for null', () => {
    expect(validatePasswordStrength(null)).toBe('Password is required.');
  });

  test('returns error for undefined', () => {
    expect(validatePasswordStrength(undefined)).toBe('Password is required.');
  });

  // Passes with all four character classes present
  test('returns null when password has uppercase, lowercase, digit, and special char', () => {
    expect(validatePasswordStrength('Secure@1')).toBeNull();
  });

  // Special characters that should be accepted
  test('accepts various special characters', () => {
    const specials = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '+', '='];
    for (const ch of specials) {
      const pw = `Abcde1${ch}x`;
      expect(validatePasswordStrength(pw)).toBeNull();
    }
  });
});

// ─── JWT claim structure ──────────────────────────────────────────────────────

describe('JWT claim structure (via login)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  /**
   * Helper: set up mockQuery to simulate a successful login for a given user.
   */
  function mockSuccessfulLogin({
    id = 'user-uuid-1',
    full_name = 'Test User',
    email = 'test@example.com',
    password_hash,
    role = 'tenant_admin',
    tenant_id = 'tenant-uuid-1',
    account_status = 'active',
    failed_attempts = 0,
    locked_until = null,
  } = {}) {
    // 1st query: SELECT user by email
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id,
          full_name,
          email,
          password_hash,
          role,
          tenant_id,
          account_status,
          failed_attempts,
          locked_until,
        },
      ],
    });
    // 2nd query: UPDATE users (reset failed_attempts)
    mockQuery.mockResolvedValueOnce({ rows: [] });
  }

  test('issued JWT contains sub equal to userId', async () => {
    // Use a real bcrypt hash for 'Secure@1!' so verifyPassword passes
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Secure@1!', 4); // low cost for speed in tests

    mockSuccessfulLogin({ id: 'user-uuid-abc', password_hash: hash });

    const { token } = await login({ email: 'test@example.com', password: 'Secure@1!' });
    const decoded = jwt.decode(token);

    expect(decoded.sub).toBe('user-uuid-abc');
  });

  test('issued JWT contains role claim', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Secure@1!', 4);

    mockSuccessfulLogin({ role: 'customer', tenant_id: null, password_hash: hash });

    const { token } = await login({ email: 'test@example.com', password: 'Secure@1!' });
    const decoded = jwt.decode(token);

    expect(decoded.role).toBe('customer');
  });

  test('issued JWT contains tenantId claim', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Secure@1!', 4);

    mockSuccessfulLogin({ tenant_id: 'tenant-uuid-xyz', password_hash: hash });

    const { token } = await login({ email: 'test@example.com', password: 'Secure@1!' });
    const decoded = jwt.decode(token);

    expect(decoded.tenantId).toBe('tenant-uuid-xyz');
  });

  test('issued JWT has tenantId = null for customer role', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Secure@1!', 4);

    mockSuccessfulLogin({ role: 'customer', tenant_id: null, password_hash: hash });

    const { token } = await login({ email: 'test@example.com', password: 'Secure@1!' });
    const decoded = jwt.decode(token);

    expect(decoded.tenantId).toBeNull();
  });

  test('issued JWT exp is at most iat + 86400 (24-hour expiry)', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Secure@1!', 4);

    mockSuccessfulLogin({ password_hash: hash });

    const { token } = await login({ email: 'test@example.com', password: 'Secure@1!' });
    const decoded = jwt.decode(token);

    expect(decoded.exp).toBeLessThanOrEqual(decoded.iat + 86400);
    // Also verify it's not zero or negative
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  test('issued JWT exp equals iat + 86400 exactly', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Secure@1!', 4);

    mockSuccessfulLogin({ password_hash: hash });

    const { token } = await login({ email: 'test@example.com', password: 'Secure@1!' });
    const decoded = jwt.decode(token);

    expect(decoded.exp).toBe(decoded.iat + 86400);
  });
});

// ─── Lockout counter increment and reset ─────────────────────────────────────

describe('login — lockout counter increment and reset', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  /**
   * Helper: build a user row with a wrong password hash so verifyPassword fails.
   * We use a known hash for 'WrongPassword' and submit 'Secure@1!' to trigger failure.
   */
  async function makeUserRow(overrides = {}) {
    const bcrypt = await import('bcrypt');
    const correctHash = await bcrypt.hash('CorrectPassword@1', 4);
    return {
      id: 'user-uuid-1',
      full_name: 'Test User',
      email: 'test@example.com',
      password_hash: correctHash,
      role: 'tenant_admin',
      tenant_id: 'tenant-uuid-1',
      account_status: 'active',
      failed_attempts: 0,
      locked_until: null,
      ...overrides,
    };
  }

  test('increments failed_attempts by 1 on a single wrong password', async () => {
    const user = await makeUserRow({ failed_attempts: 0 });

    // SELECT user
    mockQuery.mockResolvedValueOnce({ rows: [user] });
    // UPDATE failed_attempts
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      login({ email: 'test@example.com', password: 'WrongPassword@1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    // The UPDATE query should set failed_attempts = 1
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE users/i);
    expect(updateCall[0]).toMatch(/failed_attempts/i);
    expect(updateCall[1][0]).toBe(1); // new failed_attempts value
  });

  test('increments failed_attempts from 3 to 4 on wrong password', async () => {
    const user = await makeUserRow({ failed_attempts: 3 });

    mockQuery.mockResolvedValueOnce({ rows: [user] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      login({ email: 'test@example.com', password: 'WrongPassword@1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[1][0]).toBe(4); // 3 + 1
  });

  test('locks account and returns ACCOUNT_LOCKED when failed_attempts reaches 5', async () => {
    // User already has 4 failed attempts; this attempt is the 5th
    const user = await makeUserRow({ failed_attempts: 4 });

    mockQuery.mockResolvedValueOnce({ rows: [user] });
    // UPDATE with lock
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      login({ email: 'test@example.com', password: 'WrongPassword@1' }),
    ).rejects.toMatchObject({ status: 423, code: 'ACCOUNT_LOCKED' });

    // The UPDATE query should set account_status = 'locked' and locked_until
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE users/i);
    expect(updateCall[0]).toMatch(/locked_until/i);
    expect(updateCall[0]).toMatch(/account_status = 'locked'/i);
    expect(updateCall[1][0]).toBe(5); // failed_attempts = 5
  });

  test('rejects login with ACCOUNT_LOCKED when locked_until is in the future', async () => {
    const futureDate = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min from now
    const user = await makeUserRow({
      account_status: 'locked',
      failed_attempts: 5,
      locked_until: futureDate,
    });

    mockQuery.mockResolvedValueOnce({ rows: [user] });

    await expect(
      login({ email: 'test@example.com', password: 'CorrectPassword@1' }),
    ).rejects.toMatchObject({ status: 423, code: 'ACCOUNT_LOCKED' });
  });

  test('resets failed_attempts to 0 on successful login', async () => {
    const bcrypt = await import('bcrypt');
    const correctHash = await bcrypt.hash('CorrectPassword@1', 4);
    const user = await makeUserRow({
      password_hash: correctHash,
      failed_attempts: 3, // had some prior failures
    });

    // SELECT user
    mockQuery.mockResolvedValueOnce({ rows: [user] });
    // UPDATE users (reset)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await login({ email: 'test@example.com', password: 'CorrectPassword@1' });

    expect(result).toHaveProperty('token');

    // The UPDATE query should reset failed_attempts = 0
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE users/i);
    expect(updateCall[0]).toMatch(/failed_attempts = 0/i);
  });

  test('returns a JWT token on successful login', async () => {
    const bcrypt = await import('bcrypt');
    const correctHash = await bcrypt.hash('CorrectPassword@1', 4);
    const user = await makeUserRow({ password_hash: correctHash });

    mockQuery.mockResolvedValueOnce({ rows: [user] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await login({ email: 'test@example.com', password: 'CorrectPassword@1' });

    expect(typeof result.token).toBe('string');
    expect(result.token.split('.').length).toBe(3); // valid JWT has 3 parts
  });

  test('returns 401 UNAUTHENTICATED for unknown email (user not found)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no user found

    await expect(
      login({ email: 'nobody@example.com', password: 'Secure@1!' }),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  test('returns 401 UNAUTHENTICATED for unverified account (pending_verification)', async () => {
    const user = await makeUserRow({ account_status: 'pending_verification' });

    mockQuery.mockResolvedValueOnce({ rows: [user] });

    await expect(
      login({ email: 'test@example.com', password: 'CorrectPassword@1' }),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  test('returns 400 VALIDATION_ERROR when email is missing', async () => {
    await expect(
      login({ email: '', password: 'Secure@1!' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when password is missing', async () => {
    await expect(
      login({ email: 'test@example.com', password: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('does not lock account when failed_attempts is below threshold (4 failures)', async () => {
    const user = await makeUserRow({ failed_attempts: 3 });

    mockQuery.mockResolvedValueOnce({ rows: [user] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      login({ email: 'test@example.com', password: 'WrongPassword@1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    // Should NOT have locked the account — the UPDATE should not include locked_until
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[0]).not.toMatch(/locked_until/i);
    expect(updateCall[0]).not.toMatch(/account_status = 'locked'/i);
  });
});
