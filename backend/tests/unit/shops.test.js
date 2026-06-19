/**
 * Unit tests for the shops service.
 *
 * Task 5.2 — Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.8
 *
 * Covers:
 *  - validateShopName: boundary values (0, 1, 100, 101 chars)
 *  - validateAddress: boundary values (0, 1, 255, 256 chars)
 *  - validatePhone: boundary values (6, 7, 20, 21 chars)
 *  - validateContactEmail: valid and invalid RFC 5321 format
 *  - getShop: returns shop when found; throws 404 when not found
 *  - updateShop: validates each field; partial update; throws 404 when not found
 *  - uploadShopLogo: throws 400 when no file; throws 404 when shop not found; uploads and updates logo_url
 */

import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQueryTenant = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: jest.fn(),
  queryTenant: mockQueryTenant,
}));

const mockUploadFile = jest.fn();
const mockBuildKey = jest.fn();

jest.unstable_mockModule('../../src/utils/storage.js', () => ({
  uploadFile: mockUploadFile,
  buildKey: mockBuildKey,
}));

// Import after mocks are registered
const {
  validateShopName,
  validateAddress,
  validatePhone,
  validateContactEmail,
  getShop,
  updateShop,
  uploadShopLogo,
} = await import('../../src/modules/shops/shops.service.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const SHOP_ID = 'shop-uuid-1';

function makeShop(overrides = {}) {
  return {
    id: SHOP_ID,
    tenant_id: TENANT_ID,
    name: 'NE Clothiers',
    logo_url: null,
    address: '123 Tailor Street',
    phone: '1234567',
    contact_email: 'shop@neclothiers.com',
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── validateShopName ─────────────────────────────────────────────────────────

describe('validateShopName — boundary values', () => {
  test('returns error for empty string', () => {
    expect(validateShopName('')).toBe('Shop name is required.');
  });

  test('returns error for whitespace-only string', () => {
    expect(validateShopName('   ')).toBe('Shop name is required.');
  });

  test('returns error for null', () => {
    expect(validateShopName(null)).toBe('Shop name is required.');
  });

  test('returns null for a single character (length 1)', () => {
    expect(validateShopName('A')).toBeNull();
  });

  test('returns null for exactly 100 characters', () => {
    expect(validateShopName('A'.repeat(100))).toBeNull();
  });

  test('returns error for 101 characters', () => {
    expect(validateShopName('A'.repeat(101))).toBe(
      'Shop name must be between 1 and 100 characters.',
    );
  });

  test('returns null for a typical shop name', () => {
    expect(validateShopName('NE Clothiers')).toBeNull();
  });
});

// ─── validateAddress ──────────────────────────────────────────────────────────

describe('validateAddress — boundary values', () => {
  test('returns error for empty string', () => {
    expect(validateAddress('')).toBe('Address is required.');
  });

  test('returns error for whitespace-only string', () => {
    expect(validateAddress('   ')).toBe('Address is required.');
  });

  test('returns error for null', () => {
    expect(validateAddress(null)).toBe('Address is required.');
  });

  test('returns null for a single character (length 1)', () => {
    expect(validateAddress('A')).toBeNull();
  });

  test('returns null for exactly 255 characters', () => {
    expect(validateAddress('A'.repeat(255))).toBeNull();
  });

  test('returns error for 256 characters', () => {
    expect(validateAddress('A'.repeat(256))).toBe(
      'Address must be between 1 and 255 characters.',
    );
  });

  test('returns null for a typical address', () => {
    expect(validateAddress('123 Tailor Street, London, UK')).toBeNull();
  });
});

// ─── validatePhone ────────────────────────────────────────────────────────────

describe('validatePhone — boundary values', () => {
  test('returns error for empty string', () => {
    expect(validatePhone('')).toBe('Phone number is required.');
  });

  test('returns error for whitespace-only string', () => {
    expect(validatePhone('   ')).toBe('Phone number is required.');
  });

  test('returns error for null', () => {
    expect(validatePhone(null)).toBe('Phone number is required.');
  });

  test('returns error for 6 characters (below minimum)', () => {
    expect(validatePhone('123456')).toBe('Phone number must be at least 7 characters.');
  });

  test('returns null for exactly 7 characters (minimum)', () => {
    expect(validatePhone('1234567')).toBeNull();
  });

  test('returns null for exactly 20 characters (maximum)', () => {
    expect(validatePhone('1'.repeat(20))).toBeNull();
  });

  test('returns error for 21 characters (above maximum)', () => {
    expect(validatePhone('1'.repeat(21))).toBe(
      'Phone number must be no more than 20 characters.',
    );
  });

  test('returns null for a typical phone number', () => {
    expect(validatePhone('+44 7911 123456')).toBeNull();
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

  test('returns null for a valid email', () => {
    expect(validateContactEmail('shop@neclothiers.com')).toBeNull();
  });

  test('returns null for email with subdomain', () => {
    expect(validateContactEmail('admin@mail.tailorstaq.com')).toBeNull();
  });

  test('returns error for email missing @', () => {
    expect(validateContactEmail('notanemail')).toBe(
      'Contact email address must be a valid RFC 5321 format.',
    );
  });

  test('returns error for email missing domain', () => {
    expect(validateContactEmail('user@')).toBe(
      'Contact email address must be a valid RFC 5321 format.',
    );
  });

  test('returns error for email missing local part', () => {
    expect(validateContactEmail('@domain.com')).toBe(
      'Contact email address must be a valid RFC 5321 format.',
    );
  });

  test('returns error for local part exceeding 64 characters', () => {
    const longLocal = 'a'.repeat(65);
    expect(validateContactEmail(`${longLocal}@domain.com`)).toBe(
      'Contact email address must be a valid RFC 5321 format.',
    );
  });
});

// ─── getShop ──────────────────────────────────────────────────────────────────

describe('getShop', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
  });

  test('returns shop details when found', async () => {
    const shop = makeShop();
    mockQueryTenant.mockResolvedValueOnce({ rows: [shop] });

    const result = await getShop({ tenantId: TENANT_ID, shopId: SHOP_ID });

    expect(result).toEqual({ shop });
    expect(mockQueryTenant).toHaveBeenCalledTimes(1);
    const [sql, params, tenantId] = mockQueryTenant.mock.calls[0];
    expect(sql).toMatch(/SELECT[\s\S]*FROM shops/i);
    expect(params).toContain(SHOP_ID);
    expect(tenantId).toBe(TENANT_ID);
  });

  test('throws 404 NOT_FOUND when shop does not exist', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [] });

    await expect(getShop({ tenantId: TENANT_ID, shopId: SHOP_ID })).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Shop not found.',
    });
  });
});

// ─── updateShop ───────────────────────────────────────────────────────────────

describe('updateShop — field validation', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
  });

  test('throws 400 VALIDATION_ERROR when name is empty', async () => {
    await expect(
      updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID, name: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when name exceeds 100 characters', async () => {
    await expect(
      updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID, name: 'A'.repeat(101) }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when address is empty', async () => {
    await expect(
      updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID, address: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when address exceeds 255 characters', async () => {
    await expect(
      updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID, address: 'A'.repeat(256) }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when phone is too short (6 chars)', async () => {
    await expect(
      updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID, phone: '123456' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when phone is too long (21 chars)', async () => {
    await expect(
      updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID, phone: '1'.repeat(21) }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when contact_email is invalid', async () => {
    await expect(
      updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID, contact_email: 'not-an-email' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('includes all validation errors in the details array', async () => {
    await expect(
      updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID, name: '', address: '' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([
        expect.stringMatching(/shop name/i),
        expect.stringMatching(/address/i),
      ]),
    });
  });
});

describe('updateShop — shop not found', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
  });

  test('throws 404 NOT_FOUND when shop does not belong to tenant', async () => {
    // Shop existence check returns empty
    mockQueryTenant.mockResolvedValueOnce({ rows: [] });

    await expect(
      updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID, name: 'Updated Name' }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('updateShop — successful partial update', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
  });

  test('updates only the provided fields and returns updated shop', async () => {
    // Shop existence check
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });
    // UPDATE shop
    const updated = makeShop({ name: 'Updated Shop Name' });
    mockQueryTenant.mockResolvedValueOnce({ rows: [updated] });

    const result = await updateShop({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      name: 'Updated Shop Name',
    });

    expect(result).toEqual({ shop: updated });
    const [sql, params] = mockQueryTenant.mock.calls[1];
    expect(sql).toMatch(/UPDATE shops/i);
    expect(params).toContain('Updated Shop Name');
  });

  test('updates contact_email in lowercase', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });
    const updated = makeShop({ contact_email: 'new@shop.com' });
    mockQueryTenant.mockResolvedValueOnce({ rows: [updated] });

    const result = await updateShop({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      contact_email: 'NEW@SHOP.COM',
    });

    expect(result).toEqual({ shop: updated });
    const [sql, params] = mockQueryTenant.mock.calls[1];
    expect(params).toContain('new@shop.com');
  });

  test('returns current shop data when no fields are provided (no-op update)', async () => {
    // getShop is called internally when no fields are provided.
    // updateShop first does a shop existence check (SELECT id), then
    // calls getShop (SELECT * FROM shops) — 2 queryTenant calls total.
    const shop = makeShop();
    mockQueryTenant.mockImplementation(async () => ({ rows: [shop] }));

    const result = await updateShop({ tenantId: TENANT_ID, shopId: SHOP_ID });

    expect(result).toEqual({ shop });
    // Two queryTenant calls: shop existence check + getShop SELECT
    expect(mockQueryTenant).toHaveBeenCalledTimes(2);
    const [sql] = mockQueryTenant.mock.calls[0];
    expect(sql).toMatch(/SELECT/i);
    const [sql2] = mockQueryTenant.mock.calls[1];
    expect(sql2).toMatch(/SELECT/i);

    // Restore to default (reset) behaviour so other tests are not affected
    mockQueryTenant.mockReset();
  });

  test('updates multiple fields in a single request', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });
    const updated = makeShop({
      name: 'New Name',
      address: '456 New Street',
      phone: '9876543',
      contact_email: 'new@shop.com',
    });
    mockQueryTenant.mockResolvedValueOnce({ rows: [updated] });

    const result = await updateShop({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      name: 'New Name',
      address: '456 New Street',
      phone: '9876543',
      contact_email: 'new@shop.com',
    });

    expect(result).toEqual({ shop: updated });
    const [sql, params] = mockQueryTenant.mock.calls[1];
    expect(sql).toMatch(/UPDATE shops/i);
    expect(params).toContain('New Name');
    expect(params).toContain('456 New Street');
    expect(params).toContain('9876543');
    expect(params).toContain('new@shop.com');
  });
});

// ─── uploadShopLogo ───────────────────────────────────────────────────────────

describe('uploadShopLogo', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
    mockUploadFile.mockReset();
    mockBuildKey.mockReset();
  });

  test('throws 400 VALIDATION_ERROR when no file is provided', async () => {
    await expect(
      uploadShopLogo({ tenantId: TENANT_ID, shopId: SHOP_ID, file: undefined }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 404 NOT_FOUND when shop does not belong to tenant', async () => {
    // Shop existence check returns empty
    mockQueryTenant.mockResolvedValueOnce({ rows: [] });

    const file = { buffer: Buffer.from('logo'), mimetype: 'image/png', originalname: 'logo.png' };

    await expect(
      uploadShopLogo({ tenantId: TENANT_ID, shopId: SHOP_ID, file }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  test('uploads file to object store and updates logo_url', async () => {
    // Shop existence check
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });

    const logoUrl = 'https://example.com/logos/shop-uuid-1-1234.png';
    mockBuildKey.mockReturnValue('logos/shop-uuid-1-1234.png');
    mockUploadFile.mockResolvedValue(logoUrl);

    const updated = makeShop({ logo_url: logoUrl });
    // UPDATE shops SET logo_url
    mockQueryTenant.mockResolvedValueOnce({ rows: [updated] });

    const file = {
      buffer: Buffer.from('fake-logo-data'),
      mimetype: 'image/png',
      originalname: 'logo.png',
    };

    const result = await uploadShopLogo({ tenantId: TENANT_ID, shopId: SHOP_ID, file });

    expect(result).toEqual({ shop: updated });
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(mockUploadFile).toHaveBeenCalledWith(file.buffer, 'logos/shop-uuid-1-1234.png', 'image/png');
    expect(mockBuildKey).toHaveBeenCalledWith('logos', expect.stringMatching(/^shop-uuid-1-\d+\.png$/));
    const [sql, params] = mockQueryTenant.mock.calls[1];
    expect(sql).toMatch(/UPDATE shops/i);
    expect(params).toContain(logoUrl);
    expect(params).toContain(SHOP_ID);
  });

  test('logo_url in updated shop matches the URL returned by uploadFile', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });

    const expectedUrl = 'https://s3.example.com/tailorstaq-uploads/logos/shop-uuid-1-9999.svg';
    mockBuildKey.mockReturnValue('logos/shop-uuid-1-9999.svg');
    mockUploadFile.mockResolvedValue(expectedUrl);

    mockQueryTenant.mockResolvedValueOnce({ rows: [makeShop({ logo_url: expectedUrl })] });

    const file = {
      buffer: Buffer.from('svg-data'),
      mimetype: 'image/svg+xml',
      originalname: 'logo.svg',
    };

    const result = await uploadShopLogo({ tenantId: TENANT_ID, shopId: SHOP_ID, file });

    expect(result.shop.logo_url).toBe(expectedUrl);
  });
});
