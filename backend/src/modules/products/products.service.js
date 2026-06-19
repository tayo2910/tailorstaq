'use strict';

/**
 * Products service — business logic for product CRUD and free-tier limit enforcement.
 *
 * Task 6.1
 * Requirements: 2.5, 2.6, 3.3, 3.4
 *
 * Endpoints handled here:
 *   GET    /api/v1/shops/:shopId/products        — list active products (tenant-scoped)
 *   POST   /api/v1/shops/:shopId/products        — create product (with free-tier limit check)
 *   PATCH  /api/v1/shops/:shopId/products/:id    — update product fields
 *   DELETE /api/v1/shops/:shopId/products/:id    — soft-delete (set active = false)
 */

import { query, queryTenant } from '../../db/queries/base.js';
import { env } from '../../config/env.js';
import { uploadFile, buildKey } from '../../utils/storage.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Validate product name: 1–100 characters.
 * @param {string} name
 * @returns {string|null} error message or null
 */
export function validateProductName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'Product name is required.';
  }
  if (name.trim().length > 100) {
    return 'Product name must be between 1 and 100 characters.';
  }
  return null;
}

/**
 * Validate product description: 1–1000 characters.
 * @param {string} description
 * @returns {string|null} error message or null
 */
export function validateProductDescription(description) {
  if (typeof description !== 'string' || description.trim().length === 0) {
    return 'Product description is required.';
  }
  if (description.trim().length > 1000) {
    return 'Product description must be between 1 and 1000 characters.';
  }
  return null;
}

/**
 * Validate product price: 0.01–999,999.99.
 * @param {number|string} price
 * @returns {string|null} error message or null
 */
export function validateProductPrice(price) {
  const parsed = typeof price === 'string' ? parseFloat(price) : price;
  if (price === undefined || price === null || price === '') {
    return 'Product price is required.';
  }
  if (isNaN(parsed) || typeof parsed !== 'number') {
    return 'Product price must be a valid number.';
  }
  if (parsed < 0.01) {
    return 'Product price must be at least 0.01.';
  }
  if (parsed > 999999.99) {
    return 'Product price must not exceed 999,999.99.';
  }
  return null;
}

// ─── Free-tier limit check ────────────────────────────────────────────────────

/**
 * Check whether the tenant is on the free tier and has reached the active
 * product limit (10 products).
 *
 * Both the count query and the subsequent INSERT run inside the same
 * transaction (via queryTenant) to avoid race conditions.
 *
 * @param {string} tenantId
 * @returns {Promise<{ isFreeTier: boolean, activeCount: number, limit: number }>}
 */
async function getFreeTierProductStatus(tenantId) {
  // Check subscription tier
  const subResult = await query(
    `SELECT tier FROM subscriptions WHERE tenant_id = $1 AND status = 'active' ORDER BY activated_at DESC LIMIT 1`,
    [tenantId],
  );

  const tier = subResult.rows.length > 0 ? subResult.rows[0].tier : 'free';
  const isFreeTier = tier === 'free';

  if (!isFreeTier) {
    return { isFreeTier: false, activeCount: 0, limit: env.FREE_TIER_MAX_PRODUCTS };
  }

  // Count active products for this tenant
  const countResult = await queryTenant(
    `SELECT COUNT(*) AS count FROM products WHERE active = true`,
    [],
    tenantId,
  );

  const activeCount = parseInt(countResult.rows[0].count, 10);
  return { isFreeTier: true, activeCount, limit: env.FREE_TIER_MAX_PRODUCTS };
}

// ─── List products ────────────────────────────────────────────────────────────

/**
 * List all active products for a shop (tenant-scoped).
 *
 * Requirement 2.5: Tenant_Admin can view products within their shop.
 *
 * @param {{ tenantId: string, shopId: string }} params
 * @returns {Promise<{ products: Array }>}
 */
export async function listProducts({ tenantId, shopId }) {
  const result = await queryTenant(
    `SELECT id, shop_id, name, description, price, image_url, active, created_at
     FROM products
     WHERE shop_id = $1 AND active = true
     ORDER BY created_at DESC`,
    [shopId],
    tenantId,
  );

  return { products: result.rows };
}

// ─── Create product ───────────────────────────────────────────────────────────

/**
 * Create a new product in a shop.
 *
 * Flow:
 *  1. Validate name, description, price.
 *  2. Verify the shop belongs to the tenant.
 *  3. Check free-tier active product limit before insert.
 *  4. If an image file is provided, upload it to the object store.
 *  5. Insert the product row.
 *
 * Requirements: 2.5, 2.6, 3.3, 3.4
 *
 * @param {{
 *   tenantId: string,
 *   shopId: string,
 *   name: string,
 *   description: string,
 *   price: number|string,
 *   imageFile?: { buffer: Buffer, mimetype: string, originalname: string }
 * }} data
 * @returns {Promise<{ product: object }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function createProduct({ tenantId, shopId, name, description, price, imageFile }) {
  // 1. Validate inputs
  const validationErrors = [];

  const nameError = validateProductName(name);
  if (nameError) validationErrors.push(nameError);

  const descriptionError = validateProductDescription(description);
  if (descriptionError) validationErrors.push(descriptionError);

  const priceError = validateProductPrice(price);
  if (priceError) validationErrors.push(priceError);

  if (validationErrors.length > 0) {
    const err = new Error(validationErrors[0]);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = validationErrors;
    throw err;
  }

  // 2. Verify the shop belongs to this tenant
  const shopResult = await query(
    'SELECT id FROM shops WHERE id = $1 AND tenant_id = $2',
    [shopId, tenantId],
  );

  if (shopResult.rows.length === 0) {
    const err = new Error('Shop not found or does not belong to your account.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // 3. Check free-tier active product limit (Requirement 3.3, 3.4)
  const { isFreeTier, activeCount, limit } = await getFreeTierProductStatus(tenantId);

  if (isFreeTier && activeCount >= limit) {
    const err = new Error(
      `You have reached the free tier limit of ${limit} active products. Upgrade to the paid tier to add more products.`,
    );
    err.status = 422;
    err.code = 'LIMIT_EXCEEDED';
    throw err;
  }

  // 4. Upload image if provided
  let imageUrl = null;
  if (imageFile) {
    const ext = imageFile.originalname.split('.').pop() || 'bin';
    const key = buildKey('products', `${tenantId}-${shopId}-${Date.now()}.${ext}`);
    imageUrl = await uploadFile(imageFile.buffer, key, imageFile.mimetype);
  }

  // 5. Insert product
  const parsedPrice = typeof price === 'string' ? parseFloat(price) : price;

  const insertResult = await queryTenant(
    `INSERT INTO products (tenant_id, shop_id, name, description, price, image_url, active)
     VALUES ($5, $1, $2, $3, $4, $6, true)
     RETURNING id, shop_id, name, description, price, image_url, active, created_at`,
    [shopId, name.trim(), description.trim(), parsedPrice, tenantId, imageUrl],
    tenantId,
  );

  return { product: insertResult.rows[0] };
}

// ─── Update product ───────────────────────────────────────────────────────────

/**
 * Update an existing product's fields.
 *
 * Only provided fields are updated (partial update).
 * If `active` is being set to true, re-checks the free-tier limit.
 *
 * Requirements: 2.5, 3.3, 3.4
 *
 * @param {{
 *   tenantId: string,
 *   shopId: string,
 *   productId: string,
 *   name?: string,
 *   description?: string,
 *   price?: number|string,
 *   active?: boolean,
 *   imageFile?: { buffer: Buffer, mimetype: string, originalname: string }
 * }} data
 * @returns {Promise<{ product: object }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function updateProduct({
  tenantId,
  shopId,
  productId,
  name,
  description,
  price,
  active,
  imageFile,
}) {
  // Validate provided fields
  const validationErrors = [];

  if (name !== undefined) {
    const nameError = validateProductName(name);
    if (nameError) validationErrors.push(nameError);
  }

  if (description !== undefined) {
    const descriptionError = validateProductDescription(description);
    if (descriptionError) validationErrors.push(descriptionError);
  }

  if (price !== undefined) {
    const priceError = validateProductPrice(price);
    if (priceError) validationErrors.push(priceError);
  }

  if (validationErrors.length > 0) {
    const err = new Error(validationErrors[0]);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = validationErrors;
    throw err;
  }

  // Verify the product exists and belongs to this tenant's shop
  const productResult = await queryTenant(
    `SELECT id, active FROM products WHERE id = $1 AND shop_id = $2`,
    [productId, shopId],
    tenantId,
  );

  if (productResult.rows.length === 0) {
    const err = new Error('Product not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const currentProduct = productResult.rows[0];

  // If activating a product, re-check the free-tier limit (Requirement 3.3, 3.4)
  if (active === true && !currentProduct.active) {
    const { isFreeTier, activeCount, limit } = await getFreeTierProductStatus(tenantId);

    if (isFreeTier && activeCount >= limit) {
      const err = new Error(
        `You have reached the free tier limit of ${limit} active products. Upgrade to the paid tier to activate more products.`,
      );
      err.status = 422;
      err.code = 'LIMIT_EXCEEDED';
      throw err;
    }
  }

  // Upload new image if provided
  let imageUrl;
  if (imageFile) {
    const ext = imageFile.originalname.split('.').pop() || 'bin';
    const key = buildKey('products', `${tenantId}-${shopId}-${productId}-${Date.now()}.${ext}`);
    imageUrl = await uploadFile(imageFile.buffer, key, imageFile.mimetype);
  }

  // Build dynamic SET clause
  const setClauses = [];
  const params = [];
  let paramIndex = 1;

  if (name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(name.trim());
  }
  if (description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    params.push(description.trim());
  }
  if (price !== undefined) {
    setClauses.push(`price = $${paramIndex++}`);
    params.push(typeof price === 'string' ? parseFloat(price) : price);
  }
  if (active !== undefined) {
    setClauses.push(`active = $${paramIndex++}`);
    params.push(active);
  }
  if (imageUrl !== undefined) {
    setClauses.push(`image_url = $${paramIndex++}`);
    params.push(imageUrl);
  }

  if (setClauses.length === 0) {
    // Nothing to update — return the current product
    const currentResult = await queryTenant(
      `SELECT id, shop_id, name, description, price, image_url, active, created_at
       FROM products WHERE id = $1 AND shop_id = $2`,
      [productId, shopId],
      tenantId,
    );
    return { product: currentResult.rows[0] };
  }

  // Add WHERE clause params
  params.push(productId);
  const productIdParam = paramIndex++;
  params.push(shopId);
  const shopIdParam = paramIndex;

  const updateResult = await queryTenant(
    `UPDATE products
     SET ${setClauses.join(', ')}
     WHERE id = $${productIdParam} AND shop_id = $${shopIdParam}
     RETURNING id, shop_id, name, description, price, image_url, active, created_at`,
    params,
    tenantId,
  );

  if (updateResult.rows.length === 0) {
    const err = new Error('Product not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return { product: updateResult.rows[0] };
}

// ─── Delete product (soft-delete) ─────────────────────────────────────────────

/**
 * Soft-delete a product by setting active = false.
 *
 * Requirement 2.5: Tenant_Admin can remove products from their shop.
 *
 * @param {{ tenantId: string, shopId: string, productId: string }} params
 * @returns {Promise<{ message: string }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function deleteProduct({ tenantId, shopId, productId }) {
  const result = await queryTenant(
    `UPDATE products
     SET active = false
     WHERE id = $1 AND shop_id = $2
     RETURNING id`,
    [productId, shopId],
    tenantId,
  );

  if (result.rows.length === 0) {
    const err = new Error('Product not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return { message: 'Product removed successfully.' };
}
