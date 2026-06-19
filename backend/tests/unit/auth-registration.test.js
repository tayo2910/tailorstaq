/**
 * Unit tests for customer registration and email verification logic.
 *
 * Task 3.2 — Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 *
 * These tests exercise the pure validation helpers and the service functions
 * using mocked database calls so no live database is required.
 */

import { jest } from '@jest/globals';

// ─── Mock the database query helper ──────────────────────────────────────────
// We mock before importing the service so the service picks up the mock.

const mockQuery = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: jest.fn(),
}));

// Mock the email queue so no Redis connection is needed
jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueVerificationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
}));

// Dynamically import after mocks are set up
const { validatePasswordStrength, registerCustomer, verifyEmail } =
  await import('../../src/modules/auth/auth.service.js');

// ─── validatePasswordStrength ─────────────────────────────────────────────────

describe('validatePasswordStrength', () => {
  test('returns null for a valid strong password', () => {
    expect(validatePasswordStrength('Secure@1')).toBeNull();
  });

  test('returns error when password is empty', () => {
    expect(validatePasswordStrength('')).toBe('Password is required.');
  });

  test('returns error when password is null', () => {
    expect(validatePasswordStrength(null)).toBe('Password is required.');
  });

  test('returns error when password is shorter than 8 characters', () => {
    expect(validatePasswordStrength('Ab1!')).toBe(
      'Password must be at least 8 characters long.',
    );
  });

  test('returns error when password has exactly 7 characters', () => {
    expect(validatePasswordStrength('Abcd1!x')).toBe(
      'Password must be at least 8 characters long.',
    );
  });

  test('accepts password with exactly 8 characters meeting all rules', () => {
    expect(validatePasswordStrength('Abcde1!x')).toBeNull();
  });

  test('returns error when password has no uppercase letter', () => {
    expect(validatePasswordStrength('secure@1')).toBe(
      'Password must contain at least one uppercase letter.',
    );
  });

  test('returns error when password has no lowercase letter', () => {
    expect(validatePasswordStrength('SECURE@1')).toBe(
      'Password must contain at least one lowercase letter.',
    );
  });

  test('returns error when password has no digit', () => {
    expect(validatePasswordStrength('Secure@!')).toBe(
      'Password must contain at least one digit.',
    );
  });

  test('returns error when password has no special character', () => {
    expect(validatePasswordStrength('Secure123')).toBe(
      'Password must contain at least one special character.',
    );
  });
});

// ─── registerCustomer ─────────────────────────────────────────────────────────

describe('registerCustomer', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('returns 400 VALIDATION_ERROR when full_name is empty', async () => {
    await expect(
      registerCustomer({ full_name: '', email: 'user@example.com', password: 'Secure@1' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when full_name exceeds 100 characters', async () => {
    const longName = 'A'.repeat(101);
    await expect(
      registerCustomer({ full_name: longName, email: 'user@example.com', password: 'Secure@1' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when email is invalid', async () => {
    await expect(
      registerCustomer({ full_name: 'Jane Doe', email: 'not-an-email', password: 'Secure@1' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when password is too weak', async () => {
    await expect(
      registerCustomer({ full_name: 'Jane Doe', email: 'jane@example.com', password: 'weak' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 409 DUPLICATE_EMAIL when email is already registered', async () => {
    // Simulate existing user found
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-uuid' }] });

    await expect(
      registerCustomer({
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Secure@1!',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_EMAIL' });
  });

  test('creates user and verification token on valid input', async () => {
    // 1st query: email uniqueness check — no existing user
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 2nd query: INSERT user — return new user id
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-uuid' }] });
    // 3rd query: INSERT email_verifications
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await registerCustomer({
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Secure@1!',
    });

    expect(result).toEqual({ message: 'Verification email sent' });
    // Verify the INSERT user query was called with correct role and status
    const insertUserCall = mockQuery.mock.calls[1];
    expect(insertUserCall[0]).toMatch(/INSERT INTO users/i);
    expect(insertUserCall[1]).toContain('jane@example.com');
  });

  test('normalises email to lowercase before storing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-uuid' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await registerCustomer({
      full_name: 'Jane Doe',
      email: 'Jane@Example.COM',
      password: 'Secure@1!',
    });

    // The email uniqueness check should use the lowercased email
    expect(mockQuery.mock.calls[0][1]).toContain('jane@example.com');
  });

  test('inserts email_verifications row with 24-hour expiry', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-uuid' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await registerCustomer({
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Secure@1!',
    });

    const insertTokenCall = mockQuery.mock.calls[2];
    expect(insertTokenCall[0]).toMatch(/INSERT INTO email_verifications/i);
    expect(insertTokenCall[0]).toMatch(/24 hours/i);
  });
});

// ─── verifyEmail ──────────────────────────────────────────────────────────────

describe('verifyEmail', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('returns 400 VALIDATION_ERROR when token is missing', async () => {
    await expect(verifyEmail({ token: '' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  test('returns 400 VALIDATION_ERROR when token is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(verifyEmail({ token: 'nonexistent-token' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid verification token.',
    });
  });

  test('returns 400 VALIDATION_ERROR when token is already used', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'ev-uuid',
          user_id: 'user-uuid',
          used: true,
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      ],
    });

    await expect(verifyEmail({ token: 'used-token' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'This verification link has already been used.',
    });
  });

  test('returns 400 VALIDATION_ERROR when token is expired', async () => {
    const expiredRow = {
      id: 'ev-uuid',
      user_id: 'user-uuid',
      used: false,
      expires_at: new Date(Date.now() - 1000).toISOString(), // 1 second in the past
    };

    // Two separate assertions each need their own mock response
    mockQuery.mockResolvedValueOnce({ rows: [expiredRow] });
    mockQuery.mockResolvedValueOnce({ rows: [expiredRow] });

    const err1 = await verifyEmail({ token: 'expired-token' }).catch((e) => e);
    expect(err1).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });

    const err2 = await verifyEmail({ token: 'expired-token' }).catch((e) => e);
    expect(err2.message).toEqual(expect.stringContaining('expired'));
  });

  test('activates user and marks token used on valid token', async () => {
    // Token lookup
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'ev-uuid',
          user_id: 'user-uuid',
          used: false,
          expires_at: new Date(Date.now() + 3600_000).toISOString(), // 1 hour from now
        },
      ],
    });
    // UPDATE users
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // UPDATE email_verifications
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await verifyEmail({ token: 'valid-token' });

    expect(result).toEqual({ message: 'Email verified successfully' });

    // Verify user was activated
    const updateUserCall = mockQuery.mock.calls[1];
    expect(updateUserCall[0]).toMatch(/UPDATE users/i);
    expect(updateUserCall[0]).toMatch(/account_status = 'active'/i);

    // Verify token was marked used
    const updateTokenCall = mockQuery.mock.calls[2];
    expect(updateTokenCall[0]).toMatch(/UPDATE email_verifications/i);
    expect(updateTokenCall[0]).toMatch(/used = true/i);
  });
});
