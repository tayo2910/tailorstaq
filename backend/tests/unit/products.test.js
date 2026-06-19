/**
 * Unit tests for the products service.
 *
 * Task 6.1 — Requirements: 2.5, 2.6, 3.3, 3.4
 *
 * Covers:
 *  - validateProductName: boundary values (0, 1, 100, 101 chars)
 *  - validateProductDescription: boundary values (0, 1, 1000, 1001 chars)
 *  - validateProductPrice: boundary values (0.00, 0.01, 999999.99, 1000000.00)
 *  - createProduct: validates all required fields
 *  - createProduct: returns 404 when shop not found
 *  - createProduct: enforces free-tier limit at exactly 10 active products
 *  - createProduct: allows creation when on paid tier regardless of count
 *  - createProduct: inserts product and returns it
 *  - createProduct: uploads image when imageFile is provided
 *  - updateProduct: validates provided fields
 *  - updateProduct: returns 404 when product not found
 *  - updateProduct: re-checks free-tier limit when activating a product
 *  - updateProduct: skips limit check when product is already active
 *  - deleteProduct: soft-deletes by setting active = false
 *  - deleteProduct: returns 404 when product not found
 *  - listProducts: returns active products for the shop
 */

import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockQueryTenant = jest.fn();

jest.unstable_mockModule('../../src/db/queries/base.js', () => ({
  query: mockQuery,
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
  validateProductName,
  validateProductDescription,
  validateProductPrice,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = await import('../../src/modules/products/products.service.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProduct(overrides = {}) {
  return {
    id: 'product-uuid-1',
    shop_id: 'shop-uuid-1',
    name: 'Classic Suit',
    description: 'A bespoke classic suit tailored to your measurements.',
    price: '299.99',
    image_url: null,
    active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const TENANT_ID = 'tenant-uuid-1';
const SHOP_ID = 'shop-uuid-1';
const PRODUCT_ID = 'product-uuid-1';

// ─── validateProductName ──────────────────────────────────────────────────────

describe('validateProductName — boundary values', () => {
  test('returns error for empty string', () => {
    expect(validateProductName('')).toBe('Product name is required.');
  });

  test('returns error for whitespace-only string', () => {
    expect(validateProductName('   ')).toBe('Product name is required.');
  });

  test('returns error for null', () => {
    expect(validateProductName(null)).toBe('Product name is required.');
  });

  test('returns null for a single character (length 1)', () => {
    expect(validateProductName('A')).toBeNull();
  });

  test('returns null for exactly 100 characters', () => {
    expect(validateProductName('A'.repeat(100))).toBeNull();
  });

  test('returns error for 101 characters', () => {
    expect(validateProductName('A'.repeat(101))).toBe(
      'Product name must be between 1 and 100 characters.',
    );
  });

  test('returns null for a typical product name', () => {
    expect(validateProductName('Classic Suit')).toBeNull();
  });
});

// ─── validateProductDescription ──────────────────────────────────────────────

describe('validateProductDescription — boundary values', () => {
  test('returns error for empty string', () => {
    expect(validateProductDescription('')).toBe('Product description is required.');
  });

  test('returns error for whitespace-only string', () => {
    expect(validateProductDescription('   ')).toBe('Product description is required.');
  });

  test('returns null for a single character (length 1)', () => {
    expect(validateProductDescription('A')).toBeNull();
  });

  test('returns null for exactly 1000 characters', () => {
    expect(validateProductDescription('A'.repeat(1000))).toBeNull();
  });

  test('returns error for 1001 characters', () => {
    expect(validateProductDescription('A'.repeat(1001))).toBe(
      'Product description must be between 1 and 1000 characters.',
    );
  });
});

// ─── validateProductPrice ─────────────────────────────────────────────────────

describe('validateProductPrice — boundary values', () => {
  test('returns error for undefined', () => {
    expect(validateProductPrice(undefined)).toBe('Product price is required.');
  });

  test('returns error for null', () => {
    expect(validateProductPrice(null)).toBe('Product price is required.');
  });

  test('returns error for empty string', () => {
    expect(validateProductPrice('')).toBe('Product price is required.');
  });

  test('returns error for 0.00 (below minimum)', () => {
    expect(validateProductPrice(0.0)).toBe('Product price must be at least 0.01.');
  });

  test('returns error for negative price', () => {
    expect(validateProductPrice(-1)).toBe('Product price must be at least 0.01.');
  });

  test('returns null for 0.01 (minimum valid price)', () => {
    expect(validateProductPrice(0.01)).toBeNull();
  });

  test('returns null for 999999.99 (maximum valid price)', () => {
    expect(validateProductPrice(999999.99)).toBeNull();
  });

  test('returns error for 1000000.00 (above maximum)', () => {
    expect(validateProductPrice(1000000.0)).toBe(
      'Product price must not exceed 999,999.99.',
    );
  });

  test('returns null for a typical price as string', () => {
    expect(validateProductPrice('299.99')).toBeNull();
  });

  test('returns error for non-numeric string', () => {
    expect(validateProductPrice('abc')).toBe('Product price must be a valid number.');
  });
});

// ─── listProducts ─────────────────────────────────────────────────────────────

describe('listProducts', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
  });

  test('returns active products for the shop', async () => {
    const products = [makeProduct(), makeProduct({ id: 'product-uuid-2', name: 'Dress Shirt' })];
    mockQueryTenant.mockResolvedValueOnce({ rows: products });

    const result = await listProducts({ tenantId: TENANT_ID, shopId: SHOP_ID });

    expect(result).toEqual({ products });
    expect(mockQueryTenant).toHaveBeenCalledTimes(1);
    const [sql, params, tenantId] = mockQueryTenant.mock.calls[0];
    expect(sql).toMatch(/active = true/i);
    expect(params).toContain(SHOP_ID);
    expect(tenantId).toBe(TENANT_ID);
  });

  test('returns empty array when no active products exist', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [] });

    const result = await listProducts({ tenantId: TENANT_ID, shopId: SHOP_ID });

    expect(result).toEqual({ products: [] });
  });
});

// ─── createProduct ────────────────────────────────────────────────────────────

describe('createProduct — validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('throws 400 VALIDATION_ERROR when name is missing', async () => {
    await expect(
      createProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, name: '', description: 'Desc', price: 10 }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when description is missing', async () => {
    await expect(
      createProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, name: 'Suit', description: '', price: 10 }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when price is 0', async () => {
    await expect(
      createProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, name: 'Suit', description: 'Desc', price: 0 }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when price exceeds maximum', async () => {
    await expect(
      createProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, name: 'Suit', description: 'Desc', price: 1000000 }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});

describe('createProduct — shop not found', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('throws 404 NOT_FOUND when shop does not belong to tenant', async () => {
    // Shop lookup returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      createProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, name: 'Suit', description: 'Desc', price: 10 }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('createProduct — free-tier limit enforcement (Requirement 3.3, 3.4)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
    mockUploadFile.mockReset();
    mockBuildKey.mockReset();
  });

  function setupShopFound() {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] }); // shop lookup
  }

  test('throws 422 LIMIT_EXCEEDED when free-tier tenant has exactly 10 active products', async () => {
    setupShopFound();
    // Subscription check — free tier
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'free' }] });
    // Active product count — 10 (at limit)
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ count: '10' }] });

    await expect(
      createProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, name: 'Suit', description: 'Desc', price: 10 }),
    ).rejects.toMatchObject({ status: 422, code: 'LIMIT_EXCEEDED' });
  });

  test('throws 422 LIMIT_EXCEEDED when free-tier tenant has 11 active products', async () => {
    setupShopFound();
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'free' }] });
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ count: '11' }] });

    await expect(
      createProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, name: 'Suit', description: 'Desc', price: 10 }),
    ).rejects.toMatchObject({ status: 422, code: 'LIMIT_EXCEEDED' });
  });

  test('allows creation when free-tier tenant has exactly 9 active products', async () => {
    setupShopFound();
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'free' }] });
    // Count = 9 (below limit)
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ count: '9' }] });
    // INSERT product
    mockQueryTenant.mockResolvedValueOnce({ rows: [makeProduct()] });

    const result = await createProduct({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      name: 'Suit',
      description: 'Desc',
      price: 10,
    });

    expect(result).toMatchObject({ product: expect.objectContaining({ name: 'Classic Suit' }) });
  });

  test('allows creation when tenant is on paid tier regardless of product count', async () => {
    setupShopFound();
    // Subscription check — paid tier
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'paid' }] });
    // INSERT product (no count check for paid tier)
    mockQueryTenant.mockResolvedValueOnce({ rows: [makeProduct()] });

    const result = await createProduct({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      name: 'Suit',
      description: 'Desc',
      price: 10,
    });

    expect(result).toMatchObject({ product: expect.objectContaining({ name: 'Classic Suit' }) });
    // queryTenant should only be called once (for INSERT, not for count)
    expect(mockQueryTenant).toHaveBeenCalledTimes(1);
  });

  test('defaults to free tier when no subscription record exists', async () => {
    setupShopFound();
    // No subscription found
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Active product count — 10 (at limit)
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ count: '10' }] });

    await expect(
      createProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, name: 'Suit', description: 'Desc', price: 10 }),
    ).rejects.toMatchObject({ status: 422, code: 'LIMIT_EXCEEDED' });
  });
});

describe('createProduct — successful creation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
    mockUploadFile.mockReset();
    mockBuildKey.mockReset();
  });

  test('inserts product and returns it', async () => {
    // Shop lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });
    // Subscription — paid tier (skip count check)
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'paid' }] });
    // INSERT product
    const product = makeProduct();
    mockQueryTenant.mockResolvedValueOnce({ rows: [product] });

    const result = await createProduct({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      name: 'Classic Suit',
      description: 'A bespoke classic suit.',
      price: 299.99,
    });

    expect(result).toEqual({ product });
    // Verify INSERT was called with correct params
    const [sql, params] = mockQueryTenant.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO products/i);
    expect(params).toContain(SHOP_ID);
    expect(params).toContain('Classic Suit');
    expect(params).toContain(299.99);
  });

  test('uploads image and stores URL when imageFile is provided', async () => {
    // Shop lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SHOP_ID }] });
    // Subscription — paid tier
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'paid' }] });
    // INSERT product
    const product = makeProduct({ image_url: 'https://example.com/image.png' });
    mockQueryTenant.mockResolvedValueOnce({ rows: [product] });

    mockBuildKey.mockReturnValue('products/key.png');
    mockUploadFile.mockResolvedValue('https://example.com/image.png');

    const imageFile = {
      buffer: Buffer.from('fake-image'),
      mimetype: 'image/png',
      originalname: 'suit.png',
    };

    const result = await createProduct({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      name: 'Classic Suit',
      description: 'A bespoke classic suit.',
      price: 299.99,
      imageFile,
    });

    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(mockUploadFile).toHaveBeenCalledWith(
      imageFile.buffer,
      'products/key.png',
      'image/png',
    );
    expect(result.product.image_url).toBe('https://example.com/image.png');
  });
});

// ─── updateProduct ────────────────────────────────────────────────────────────

describe('updateProduct — validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('throws 400 VALIDATION_ERROR when name is provided but empty', async () => {
    await expect(
      updateProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, productId: PRODUCT_ID, name: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  test('throws 400 VALIDATION_ERROR when price is provided but invalid', async () => {
    await expect(
      updateProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, productId: PRODUCT_ID, price: 0 }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});

describe('updateProduct — not found', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
  });

  test('throws 404 NOT_FOUND when product does not exist', async () => {
    // Product lookup returns empty
    mockQueryTenant.mockResolvedValueOnce({ rows: [] });

    await expect(
      updateProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, productId: PRODUCT_ID, name: 'New Name' }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('updateProduct — free-tier limit re-check when activating', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('throws 422 LIMIT_EXCEEDED when activating a product on a full free tier', async () => {
    // Product lookup — currently inactive
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID, active: false }] });
    // Subscription — free tier
    mockQuery.mockResolvedValueOnce({ rows: [{ tier: 'free' }] });
    // Active product count — 10 (at limit)
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ count: '10' }] });

    await expect(
      updateProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, productId: PRODUCT_ID, active: true }),
    ).rejects.toMatchObject({ status: 422, code: 'LIMIT_EXCEEDED' });
  });

  test('skips limit check when product is already active', async () => {
    // Product lookup — currently active
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID, active: true }] });
    // UPDATE product
    mockQueryTenant.mockResolvedValueOnce({ rows: [makeProduct({ name: 'Updated Suit' })] });

    const result = await updateProduct({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      productId: PRODUCT_ID,
      active: true,
      name: 'Updated Suit',
    });

    expect(result).toMatchObject({ product: expect.objectContaining({ name: 'Updated Suit' }) });
    // mockQuery should NOT have been called (no subscription check)
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('updateProduct — successful update', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryTenant.mockReset();
  });

  test('updates product fields and returns updated product', async () => {
    // Product lookup
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID, active: true }] });
    // UPDATE product
    const updated = makeProduct({ name: 'Updated Suit', price: '399.99' });
    mockQueryTenant.mockResolvedValueOnce({ rows: [updated] });

    const result = await updateProduct({
      tenantId: TENANT_ID,
      shopId: SHOP_ID,
      productId: PRODUCT_ID,
      name: 'Updated Suit',
      price: 399.99,
    });

    expect(result).toEqual({ product: updated });
    const [sql, params] = mockQueryTenant.mock.calls[1];
    expect(sql).toMatch(/UPDATE products/i);
    expect(params).toContain('Updated Suit');
    expect(params).toContain(399.99);
  });
});

// ─── deleteProduct ────────────────────────────────────────────────────────────

describe('deleteProduct', () => {
  beforeEach(() => {
    mockQueryTenant.mockReset();
  });

  test('soft-deletes product by setting active = false', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] });

    const result = await deleteProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, productId: PRODUCT_ID });

    expect(result).toEqual({ message: 'Product removed successfully.' });
    const [sql, params] = mockQueryTenant.mock.calls[0];
    expect(sql).toMatch(/UPDATE products/i);
    expect(sql).toMatch(/active = false/i);
    expect(params).toContain(PRODUCT_ID);
    expect(params).toContain(SHOP_ID);
  });

  test('throws 404 NOT_FOUND when product does not exist', async () => {
    mockQueryTenant.mockResolvedValueOnce({ rows: [] });

    await expect(
      deleteProduct({ tenantId: TENANT_ID, shopId: SHOP_ID, productId: PRODUCT_ID }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
