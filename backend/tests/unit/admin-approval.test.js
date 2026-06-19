/**
 * Unit tests for Platform_Admin approval service.
 *
 * Task 4.2 — Requirements: 1.4, 1.5, 1.6, 1.7, 1.8
 *
 * Covers:
 *  - listApprovals: returns all requests when no status filter is given
 *  - listApprovals: filters by valid status values (pending, approved, rejected)
 *  - listApprovals: rejects invalid status filter with 400 VALIDATION_ERROR
 *  - processApproval: rejects invalid action values
 *  - processApproval: returns 404 NOT_FOUND when request does not exist
 *  - processApproval: returns 409 ALREADY_IN_STATE when request is not pending
 *  - processApproval (approve): creates tenant, user, shop, and free subscription atomically
 *  - processApproval (approve): enqueues approval email after commit
 *  - processApproval (approve): succeeds even if email enqueue fails
 *  - processApproval (reject): validates rejection_reason (1–500 chars)
 *  - processApproval (reject): records rejection reason and updates status
 *  - processApproval (reject): enqueues rejection email after update
 *  - processApproval (reject): succeeds even if email enqueue fails
 *  - validateRejectionReason: boundary values
 */

import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
  queryTenant: jest.fn(),
}));

// Mock the pool client for transaction-based approve flow
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

const mockEnqueueTenantApprovalEmail = jest.fn().mockResolvedValue(undefined);
const mockEnqueueTenantRejectionEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueVerificationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTenantApprovalEmail: mockEnqueueTenantApprovalEmail,
  enqueueTenantRejectionEmail: mockEnqueueTenantRejectionEmail,
}));

// Import after mocks are registered
const {
  listApprovals,
  processApproval,
  validateRejectionReason,
} = await import('../../src/modules/admin/admin.service.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mock approval request row.
 */
function makeApprovalRequest(overrides = {}) {
  return {
    id: 'req-uuid-1',
    business_name: 'NE Clothiers',
    contact_email: 'owner@neclothiers.com',
    phone: '+44 7911 123456',
    business_description: 'Bespoke tailoring for all occasions.',
    status: 'pending',
    ...overrides,
  };
}

/**
 * Set up the mock pool client for the transactional approve flow.
 * Returns a mock client that records all query calls.
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

// ─── validateRejectionReason — boundary values ────────────────────────────────

describe('validateRejectionReason — boundary values', () => {
  test('returns error for empty string', () => {
    expect(validateRejectionReason('')).toBe('Rejection reason is required.');
  });

  test('returns error for whitespace-only string', () => {
    expect(validateRejectionReason('   ')).toBe('Rejection reason is required.');
  });

  test('returns error for null', () => {
    expect(validateRejectionReason(null)).toBe('Rejection reason is required.');
  });

  test('returns error for undefined', () => {
    expect(validateRejectionReason(undefined)).toBe('Rejection reason is required.');
  });

  test('returns null for a single character (length 1)', () => {
    expect(validateRejectionReason('A')).toBeNull();
  });

  test('returns null for exactly 500 characters', () => {
    expect(validateRejectionReason('A'.repeat(500))).toBeNull();
  });

  test('returns error for 501 characters', () => {
    expect(validateRejectionReason('A'.repeat(501))).toBe(
      'Rejection reason must be between 1 and 500 characters.',
    );
  });

  test('returns null for a typical rejection reason', () => {
    expect(
      validateRejectionReason('The business description does not meet our requirements.'),
    ).toBeNull();
  });
});

// ─── listApprovals ────────────────────────────────────────────────────────────

describe('listApprovals', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('returns all approval requests when no status filter is provided', async () => {
    const rows = [
      makeApprovalRequest({ id: 'req-1', status: 'pending' }),
      makeApprovalRequest({ id: 'req-2', status: 'approved' }),
      makeApprovalRequest({ id: 'req-3', status: 'rejected' }),
    ];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listApprovals();

    expect(result).toEqual({ approvals: rows });
    // Query should NOT include a WHERE clause for status
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).not.toMatch(/WHERE status/i);
  });

  test('filters by status=pending', async () => {
    const rows = [makeApprovalRequest({ status: 'pending' })];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listApprovals({ status: 'pending' });

    expect(result).toEqual({ approvals: rows });
    // Query should include a WHERE clause for status
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/WHERE status = \$1/i);
    expect(mockQuery.mock.calls[0][1]).toEqual(['pending']);
  });

  test('filters by status=approved', async () => {
    const rows = [makeApprovalRequest({ status: 'approved' })];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listApprovals({ status: 'approved' });

    expect(result).toEqual({ approvals: rows });
    expect(mockQuery.mock.calls[0][1]).toEqual(['approved']);
  });

  test('filters by status=rejected', async () => {
    const rows = [makeApprovalRequest({ status: 'rejected' })];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listApprovals({ status: 'rejected' });

    expect(result).toEqual({ approvals: rows });
    expect(mockQuery.mock.calls[0][1]).toEqual(['rejected']);
  });

  test('returns empty array when no requests match the filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await listApprovals({ status: 'pending' });

    expect(result).toEqual({ approvals: [] });
  });

  test('throws 400 VALIDATION_ERROR for invalid status filter value', async () => {
    await expect(listApprovals({ status: 'invalid_status' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    // Should not have called the database
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('throws 400 VALIDATION_ERROR for status=active (not a valid approval status)', async () => {
    await expect(listApprovals({ status: 'active' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  test('returns all requests when status is empty string (treated as no filter)', async () => {
    const rows = [makeApprovalRequest()];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listApprovals({ status: '' });

    expect(result).toEqual({ approvals: rows });
    // Should use the unfiltered query
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).not.toMatch(/WHERE status/i);
  });

  test('returns all requests when status is undefined', async () => {
    const rows = [makeApprovalRequest()];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listApprovals({ status: undefined });

    expect(result).toEqual({ approvals: rows });
  });

  test('results are ordered by created_at DESC', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listApprovals();

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/ORDER BY created_at DESC/i);
  });
});

// ─── processApproval — input validation ──────────────────────────────────────

describe('processApproval — input validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('throws 400 VALIDATION_ERROR for action=null', async () => {
    await expect(
      processApproval({ requestId: 'req-1', action: null }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('throws 400 VALIDATION_ERROR for action=undefined', async () => {
    await expect(
      processApproval({ requestId: 'req-1', action: undefined }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR for action=delete (invalid value)', async () => {
    await expect(
      processApproval({ requestId: 'req-1', action: 'delete' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR for action=APPROVE (wrong case)', async () => {
    await expect(
      processApproval({ requestId: 'req-1', action: 'APPROVE' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});

// ─── processApproval — not found ─────────────────────────────────────────────

describe('processApproval — not found', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('throws 404 NOT_FOUND when approval request does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no request found

    await expect(
      processApproval({ requestId: 'nonexistent-uuid', action: 'approve' }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

// ─── processApproval — already processed (Requirement 1.7) ───────────────────

describe('processApproval — already processed (Requirement 1.7)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('throws 409 ALREADY_IN_STATE when request is already approved', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeApprovalRequest({ status: 'approved' })],
    });

    await expect(
      processApproval({ requestId: 'req-1', action: 'approve' }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_IN_STATE' });
  });

  test('throws 409 ALREADY_IN_STATE when request is already rejected', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeApprovalRequest({ status: 'rejected' })],
    });

    await expect(
      processApproval({ requestId: 'req-1', action: 'reject', rejection_reason: 'Not suitable.' }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_IN_STATE' });
  });

  test('throws 409 ALREADY_IN_STATE when trying to reject an already-approved request', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeApprovalRequest({ status: 'approved' })],
    });

    await expect(
      processApproval({ requestId: 'req-1', action: 'reject', rejection_reason: 'Changed mind.' }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_IN_STATE' });
  });
});

// ─── processApproval — approve flow (Requirement 1.5) ────────────────────────

describe('processApproval — approve flow (Requirement 1.5)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockPoolConnect.mockReset();
    mockEnqueueTenantApprovalEmail.mockReset();
    mockEnqueueTenantApprovalEmail.mockResolvedValue(undefined);
  });

  /**
   * Set up a successful approve transaction.
   * Transaction queries in order:
   *   0: BEGIN
   *   1: INSERT tenants → returns { id: 'new-tenant-uuid' }
   *   2: INSERT users
   *   3: INSERT shops
   *   4: INSERT subscriptions
   *   5: UPDATE approval_requests
   *   6: COMMIT
   */
  function setupSuccessfulApprove() {
    // SELECT approval_request (non-transactional)
    mockQuery.mockResolvedValueOnce({
      rows: [makeApprovalRequest()],
    });

    // Transaction client queries
    setupMockClient([
      { rows: [] },                              // BEGIN
      { rows: [{ id: 'new-tenant-uuid' }] },     // INSERT tenants
      { rows: [] },                              // INSERT users
      { rows: [] },                              // INSERT shops
      { rows: [] },                              // INSERT subscriptions
      { rows: [] },                              // UPDATE approval_requests
      { rows: [] },                              // COMMIT
    ]);
  }

  test('returns success message and tenantId on approve', async () => {
    setupSuccessfulApprove();

    const result = await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    expect(result).toMatchObject({
      message: expect.stringContaining('approved'),
      tenantId: 'new-tenant-uuid',
    });
  });

  test('creates a tenant row inside the transaction', async () => {
    setupSuccessfulApprove();

    await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    // Find the INSERT tenants call among client queries
    const insertTenantCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT INTO tenants/i.test(sql),
    );
    expect(insertTenantCall).toBeDefined();
    // Should include the business name from the approval request
    expect(insertTenantCall[1]).toContain('NE Clothiers');
  });

  test('creates a tenant_admin user row inside the transaction', async () => {
    setupSuccessfulApprove();

    await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    const insertUserCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT INTO users/i.test(sql),
    );
    expect(insertUserCall).toBeDefined();
    // Should include tenant_admin role
    expect(insertUserCall[0]).toMatch(/tenant_admin/i);
    // Should include the contact email
    expect(insertUserCall[1]).toContain('owner@neclothiers.com');
  });

  test('creates a shop row inside the transaction', async () => {
    setupSuccessfulApprove();

    await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    const insertShopCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT INTO shops/i.test(sql),
    );
    expect(insertShopCall).toBeDefined();
    // Shop should be associated with the new tenant
    expect(insertShopCall[1]).toContain('new-tenant-uuid');
  });

  test('creates a free subscription row inside the transaction', async () => {
    setupSuccessfulApprove();

    await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    const insertSubCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT INTO subscriptions/i.test(sql),
    );
    expect(insertSubCall).toBeDefined();
    // Subscription should be free tier
    expect(insertSubCall[0]).toMatch(/free/i);
    // Should be associated with the new tenant
    expect(insertSubCall[1]).toContain('new-tenant-uuid');
  });

  test('updates approval_requests status to approved inside the transaction', async () => {
    setupSuccessfulApprove();

    await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    const updateCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /UPDATE approval_requests/i.test(sql),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).toMatch(/status = 'approved'/i);
    expect(updateCall[1]).toContain('req-uuid-1');
  });

  test('wraps all DB operations in a transaction (BEGIN + COMMIT)', async () => {
    setupSuccessfulApprove();

    await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    const beginCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /BEGIN/i.test(sql),
    );
    const commitCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /COMMIT/i.test(sql),
    );
    expect(beginCall).toBeDefined();
    expect(commitCall).toBeDefined();
  });

  test('releases the DB client after successful approve', async () => {
    setupSuccessfulApprove();

    await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  test('enqueues approval email after successful transaction', async () => {
    setupSuccessfulApprove();

    await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    expect(mockEnqueueTenantApprovalEmail).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTenantApprovalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'new-tenant-uuid',
        email: 'owner@neclothiers.com',
        businessName: 'NE Clothiers',
      }),
    );
  });

  test('still returns success even if approval email enqueue fails', async () => {
    setupSuccessfulApprove();
    mockEnqueueTenantApprovalEmail.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await processApproval({ requestId: 'req-uuid-1', action: 'approve' });

    expect(result).toMatchObject({
      message: expect.stringContaining('approved'),
      tenantId: 'new-tenant-uuid',
    });
  });

  test('rolls back and re-throws on DB error during transaction', async () => {
    // SELECT approval_request
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });

    // Transaction: BEGIN succeeds, INSERT tenants fails
    let callIndex = 0;
    mockClientQuery.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve({ rows: [] }); // BEGIN
      if (callIndex === 2) return Promise.reject(new Error('DB constraint violation')); // INSERT tenants
      return Promise.resolve({ rows: [] });
    });
    mockClientRelease.mockResolvedValue(undefined);
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });

    await expect(
      processApproval({ requestId: 'req-uuid-1', action: 'approve' }),
    ).rejects.toThrow('DB constraint violation');

    // ROLLBACK should have been called
    const rollbackCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /ROLLBACK/i.test(sql),
    );
    expect(rollbackCall).toBeDefined();

    // Client should still be released
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });
});

// ─── processApproval — reject flow (Requirement 1.6) ─────────────────────────

describe('processApproval — reject flow (Requirement 1.6)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnqueueTenantRejectionEmail.mockReset();
    mockEnqueueTenantRejectionEmail.mockResolvedValue(undefined);
  });

  test('throws 400 VALIDATION_ERROR when rejection_reason is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });

    await expect(
      processApproval({ requestId: 'req-uuid-1', action: 'reject' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when rejection_reason is empty string', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });

    await expect(
      processApproval({ requestId: 'req-uuid-1', action: 'reject', rejection_reason: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when rejection_reason exceeds 500 characters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });

    await expect(
      processApproval({
        requestId: 'req-uuid-1',
        action: 'reject',
        rejection_reason: 'A'.repeat(501),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('returns success message on valid rejection', async () => {
    // SELECT approval_request
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });
    // UPDATE approval_requests
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await processApproval({
      requestId: 'req-uuid-1',
      action: 'reject',
      rejection_reason: 'Business description does not meet our requirements.',
    });

    expect(result).toMatchObject({
      message: expect.stringContaining('rejected'),
    });
  });

  test('updates approval_requests with status=rejected and rejection_reason', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await processApproval({
      requestId: 'req-uuid-1',
      action: 'reject',
      rejection_reason: 'Not suitable for our platform.',
    });

    // The UPDATE query should set status = 'rejected' and include the reason
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE approval_requests/i);
    expect(updateCall[0]).toMatch(/status = 'rejected'/i);
    expect(updateCall[0]).toMatch(/rejection_reason/i);
    expect(updateCall[1][0]).toBe('Not suitable for our platform.');
    expect(updateCall[1][1]).toBe('req-uuid-1');
  });

  test('trims whitespace from rejection_reason before storing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await processApproval({
      requestId: 'req-uuid-1',
      action: 'reject',
      rejection_reason: '  Not suitable.  ',
    });

    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[1][0]).toBe('Not suitable.');
  });

  test('accepts rejection_reason of exactly 1 character', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await processApproval({
      requestId: 'req-uuid-1',
      action: 'reject',
      rejection_reason: 'X',
    });

    expect(result).toMatchObject({ message: expect.stringContaining('rejected') });
  });

  test('accepts rejection_reason of exactly 500 characters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await processApproval({
      requestId: 'req-uuid-1',
      action: 'reject',
      rejection_reason: 'A'.repeat(500),
    });

    expect(result).toMatchObject({ message: expect.stringContaining('rejected') });
  });

  test('enqueues rejection email after successful rejection', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await processApproval({
      requestId: 'req-uuid-1',
      action: 'reject',
      rejection_reason: 'Not suitable for our platform.',
    });

    expect(mockEnqueueTenantRejectionEmail).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTenantRejectionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-uuid-1',
        email: 'owner@neclothiers.com',
        businessName: 'NE Clothiers',
        rejectionReason: 'Not suitable for our platform.',
      }),
    );
  });

  test('still returns success even if rejection email enqueue fails', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockEnqueueTenantRejectionEmail.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await processApproval({
      requestId: 'req-uuid-1',
      action: 'reject',
      rejection_reason: 'Not suitable.',
    });

    expect(result).toMatchObject({ message: expect.stringContaining('rejected') });
  });

  test('does NOT create tenant, user, shop, or subscription on rejection', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeApprovalRequest()] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await processApproval({
      requestId: 'req-uuid-1',
      action: 'reject',
      rejection_reason: 'Not suitable.',
    });

    // Only 2 queries: SELECT + UPDATE (no INSERT queries)
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const allSqls = mockQuery.mock.calls.map(([sql]) => sql);
    const hasInsert = allSqls.some((sql) => /INSERT/i.test(sql));
    expect(hasInsert).toBe(false);
  });
});
