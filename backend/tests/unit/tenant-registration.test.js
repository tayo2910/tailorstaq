/**
 * Unit tests for tenant registration service.
 *
 * Task 4.1 — Requirements: 1.1, 1.2, 1.3
 *
 * Covers:
 *  - Validation of business_name (1–100 chars)
 *  - Validation of contact_email (RFC 5321 format)
 *  - Validation of phone (7–20 chars)
 *  - Validation of business_description (1–500 chars)
 *  - Duplicate email rejection across approval_requests and tenants
 *  - Successful registration creates approval_request with status 'pending'
 *  - Confirmation email is enqueued on success
 *  - Email is normalised to lowercase before storage
 */

import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: jest.fn(),
}));

const mockEnqueueTenantConfirmationEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueVerificationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantConfirmationEmail: mockEnqueueTenantConfirmationEmail,
}));

// Import after mocks are registered
const {
  registerTenant,
  validateBusinessName,
  validateContactEmail,
  validatePhone,
  validateBusinessDescription,
} = await import('../../src/modules/tenants/tenants.service.js');

// ─── validateBusinessName ─────────────────────────────────────────────────────

describe('validateBusinessName — boundary values', () => {
  test('returns error for empty string', () => {
    expect(validateBusinessName('')).toBe('Business name is required.');
  });

  test('returns error for whitespace-only string', () => {
    expect(validateBusinessName('   ')).toBe('Business name is required.');
  });

  test('returns error for null', () => {
    expect(validateBusinessName(null)).toBe('Business name is required.');
  });

  test('returns error for undefined', () => {
    expect(validateBusinessName(undefined)).toBe('Business name is required.');
  });

  test('returns null for a single character (length 1)', () => {
    expect(validateBusinessName('A')).toBeNull();
  });

  test('returns null for exactly 100 characters', () => {
    expect(validateBusinessName('A'.repeat(100))).toBeNull();
  });

  test('returns error for 101 characters', () => {
    expect(validateBusinessName('A'.repeat(101))).toBe(
      'Business name must be between 1 and 100 characters.',
    );
  });

  test('returns null for a typical business name', () => {
    expect(validateBusinessName('NE Clothiers Ltd')).toBeNull();
  });
});

// ─── validateContactEmail ─────────────────────────────────────────────────────

describe('validateContactEmail — format validation', () => {
  test('returns error for empty string', () => {
    expect(validateContactEmail('')).toBe('Contact email address is required.');
  });

  test('returns error for null', () => {
    expect(validateContactEmail(null)).toBe('Contact email address is required.');
  });

  test('returns error for string without @', () => {
    expect(validateContactEmail('notanemail')).toBe(
      'Contact email address must be a valid RFC 5321 format.',
    );
  });

  test('returns error for string with multiple @', () => {
    expect(validateContactEmail('a@@b.com')).toBe(
      'Contact email address must be a valid RFC 5321 format.',
    );
  });

  test('returns null for a valid email address', () => {
    expect(validateContactEmail('owner@tailorshop.com')).toBeNull();
  });

  test('returns null for email with subdomain', () => {
    expect(validateContactEmail('contact@mail.example.co.uk')).toBeNull();
  });

  test('returns null for email with plus addressing', () => {
    expect(validateContactEmail('owner+shop@example.com')).toBeNull();
  });
});

// ─── validatePhone ────────────────────────────────────────────────────────────

describe('validatePhone — boundary values', () => {
  test('returns error for empty string', () => {
    expect(validatePhone('')).toBe('Phone number is required.');
  });

  test('returns error for null', () => {
    expect(validatePhone(null)).toBe('Phone number is required.');
  });

  test('returns error for 6 characters (one below minimum)', () => {
    expect(validatePhone('123456')).toBe('Phone number must be at least 7 characters.');
  });

  test('returns null for exactly 7 characters', () => {
    expect(validatePhone('1234567')).toBeNull();
  });

  test('returns null for exactly 20 characters', () => {
    expect(validatePhone('1'.repeat(20))).toBeNull();
  });

  test('returns error for 21 characters (one above maximum)', () => {
    expect(validatePhone('1'.repeat(21))).toBe(
      'Phone number must be no more than 20 characters.',
    );
  });

  test('returns null for a typical international phone number', () => {
    expect(validatePhone('+44 7911 123456')).toBeNull();
  });
});

// ─── validateBusinessDescription ─────────────────────────────────────────────

describe('validateBusinessDescription — boundary values', () => {
  test('returns error for empty string', () => {
    expect(validateBusinessDescription('')).toBe('Business description is required.');
  });

  test('returns error for null', () => {
    expect(validateBusinessDescription(null)).toBe('Business description is required.');
  });

  test('returns null for a single character (length 1)', () => {
    expect(validateBusinessDescription('A')).toBeNull();
  });

  test('returns null for exactly 500 characters', () => {
    expect(validateBusinessDescription('A'.repeat(500))).toBeNull();
  });

  test('returns error for 501 characters', () => {
    expect(validateBusinessDescription('A'.repeat(501))).toBe(
      'Business description must be between 1 and 500 characters.',
    );
  });

  test('returns null for a typical description', () => {
    expect(
      validateBusinessDescription('We specialise in bespoke suits and traditional garments.'),
    ).toBeNull();
  });
});

// ─── registerTenant ───────────────────────────────────────────────────────────

describe('registerTenant', () => {
  /** Valid input fixture */
  const validInput = {
    business_name: 'NE Clothiers',
    contact_email: 'owner@neclothiers.com',
    phone: '+44 7911 123456',
    business_description: 'Bespoke tailoring for all occasions.',
  };

  beforeEach(() => {
    mockQuery.mockReset();
    mockEnqueueTenantConfirmationEmail.mockReset();
    mockEnqueueTenantConfirmationEmail.mockResolvedValue(undefined);
  });

  // ── Validation errors ──────────────────────────────────────────────────────

  test('returns 400 VALIDATION_ERROR when business_name is empty', async () => {
    await expect(
      registerTenant({ ...validInput, business_name: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when business_name exceeds 100 characters', async () => {
    await expect(
      registerTenant({ ...validInput, business_name: 'A'.repeat(101) }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when contact_email is invalid', async () => {
    await expect(
      registerTenant({ ...validInput, contact_email: 'not-an-email' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when phone is too short (6 chars)', async () => {
    await expect(
      registerTenant({ ...validInput, phone: '123456' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when phone is too long (21 chars)', async () => {
    await expect(
      registerTenant({ ...validInput, phone: '1'.repeat(21) }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when business_description is empty', async () => {
    await expect(
      registerTenant({ ...validInput, business_description: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns 400 VALIDATION_ERROR when business_description exceeds 500 characters', async () => {
    await expect(
      registerTenant({ ...validInput, business_description: 'A'.repeat(501) }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('includes all validation errors in details array', async () => {
    let caughtErr;
    try {
      await registerTenant({
        business_name: '',
        contact_email: 'bad',
        phone: '123',
        business_description: '',
      });
    } catch (err) {
      caughtErr = err;
    }
    expect(caughtErr.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(caughtErr.details)).toBe(true);
    expect(caughtErr.details.length).toBeGreaterThan(1);
  });

  // ── Duplicate email ────────────────────────────────────────────────────────

  test('returns 409 DUPLICATE_EMAIL when email exists in approval_requests', async () => {
    // approval_requests check returns a match
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-req-uuid' }] });
    // tenants check returns nothing
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(registerTenant(validInput)).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_EMAIL',
    });
  });

  test('returns 409 DUPLICATE_EMAIL when email exists in tenants', async () => {
    // approval_requests check returns nothing
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // tenants check returns a match
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-tenant-uuid' }] });

    await expect(registerTenant(validInput)).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_EMAIL',
    });
  });

  test('returns 409 DUPLICATE_EMAIL when email exists in both tables', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'req-uuid' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-uuid' }] });

    await expect(registerTenant(validInput)).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_EMAIL',
    });
  });

  // ── Successful registration ────────────────────────────────────────────────

  test('creates approval_request row with status pending on valid input', async () => {
    // approval_requests uniqueness check — no match
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // tenants uniqueness check — no match
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT approval_requests — return new id
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-request-uuid' }] });

    const result = await registerTenant(validInput);

    expect(result).toMatchObject({
      message: expect.stringContaining('Registration submitted'),
      requestId: 'new-request-uuid',
    });

    // Verify the INSERT query was called with status = 'pending'
    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toMatch(/INSERT INTO approval_requests/i);
    expect(insertCall[0]).toMatch(/'pending'/i);
  });

  test('normalises contact_email to lowercase before storing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-request-uuid' }] });

    await registerTenant({ ...validInput, contact_email: 'Owner@NE-Clothiers.COM' });

    // The uniqueness check queries should use the lowercased email
    expect(mockQuery.mock.calls[0][1]).toContain('owner@ne-clothiers.com');
    expect(mockQuery.mock.calls[1][1]).toContain('owner@ne-clothiers.com');
  });

  test('trims whitespace from business_name before storing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-request-uuid' }] });

    await registerTenant({ ...validInput, business_name: '  NE Clothiers  ' });

    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[1][0]).toBe('NE Clothiers');
  });

  test('enqueues confirmation email after successful registration', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-request-uuid' }] });

    await registerTenant(validInput);

    expect(mockEnqueueTenantConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTenantConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'new-request-uuid',
        email: 'owner@neclothiers.com',
        businessName: 'NE Clothiers',
      }),
    );
  });

  test('still returns success even if email enqueue fails', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-request-uuid' }] });

    // Simulate email queue failure
    mockEnqueueTenantConfirmationEmail.mockRejectedValueOnce(
      new Error('Redis connection refused'),
    );

    const result = await registerTenant(validInput);

    // Registration should still succeed
    expect(result).toMatchObject({
      message: expect.stringContaining('Registration submitted'),
      requestId: 'new-request-uuid',
    });
  });

  test('checks email uniqueness against both approval_requests and tenants tables', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-request-uuid' }] });

    await registerTenant(validInput);

    // First two queries should be the uniqueness checks
    expect(mockQuery.mock.calls[0][0]).toMatch(/approval_requests/i);
    expect(mockQuery.mock.calls[1][0]).toMatch(/tenants/i);
  });
});
