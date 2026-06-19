'use strict';

/**
 * Shops service — business logic for shop settings management.
 *
 * Task 5.2
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.8
 *
 * Endpoints handled here:
 *   GET   /api/v1/shops/:shopId        — return shop details (tenant-scoped)
 *   PATCH /api/v1/shops/:shopId        — update shop name, address, phone, contact email
 *   POST  /api/v1/shops/:shopId/logo   — upload shop logo to object store
 */

import { query, queryTenant } from '../../db/queries/base.js';
import { uploadFile, buildKey } from '../../utils/storage.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Validate shop name: 1–100 characters.
 * @param {string} name
 * @returns {string|null} error message or null
 */
export function validateShopName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'Shop name is required.';
  }
  if (name.trim().length > 100) {
    return 'Shop name must be between 1 and 100 characters.';
  }
  return null;
}

/**
 * Validate address: 1–255 characters.
 * @param {string} address
 * @returns {string|null} error message or null
 */
export function validateAddress(address) {
  if (typeof address !== 'string' || address.trim().length === 0) {
    return 'Address is required.';
  }
  if (address.trim().length > 255) {
    return 'Address must be between 1 and 255 characters.';
  }
  return null;
}

/**
 * Validate phone number: 7–20 characters.
 * @param {string} phone
 * @returns {string|null} error message or null
 */
export function validatePhone(phone) {
  if (typeof phone !== 'string' || phone.trim().length === 0) {
    return 'Phone number is required.';
  }
  if (phone.trim().length < 7) {
    return 'Phone number must be at least 7 characters.';
  }
  if (phone.trim().length > 20) {
    return 'Phone number must be no more than 20 characters.';
  }
  return null;
}

/**
 * Validate contact email: basic RFC 5321 format check.
 * @param {string} email
 * @returns {string|null} error message or null
 */
export function validateContactEmail(email) {
  if (typeof email !== 'string' || email.trim().length === 0) {
    return 'Contact email address is required.';
  }
  // RFC 5321 local@domain format — local part up to 64 chars, domain up to 255 chars
  const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
  if (!emailRegex.test(email.trim())) {
    return 'Contact email address must be a valid RFC 5321 format.';
  }
  return null;
}

// ─── Get shop ─────────────────────────────────────────────────────────────────

/**
 * Retrieve shop details for the authenticated tenant.
 *
 * Requirement 2.2: Tenant_Admin can view their shop configuration.
 *
 * @param {{ tenantId: string, shopId: string }} params
 * @returns {Promise<{ shop: object }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function getShop({ tenantId, shopId }) {
  const result = await queryTenant(
    `SELECT id, tenant_id, name, logo_url, address, phone, contact_email, updated_at
     FROM shops
     WHERE id = $1`,
    [shopId],
    tenantId,
  );

  if (result.rows.length === 0) {
    const err = new Error('Shop not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return { shop: result.rows[0] };
}

// ─── Update shop settings ─────────────────────────────────────────────────────

/**
 * Update shop settings (partial update — only provided fields are changed).
 *
 * Supported fields: name (1–100), address (1–255), phone (7–20), contact_email.
 * Persists changes and returns the updated shop within 5 s (Requirement 2.7).
 *
 * Requirements: 2.1, 2.2, 2.7
 *
 * @param {{
 *   tenantId: string,
 *   shopId: string,
 *   name?: string,
 *   address?: string,
 *   phone?: string,
 *   contact_email?: string
 * }} data
 * @returns {Promise<{ shop: object }>}
 * @throws {{ status: number, code: string, message: string, details?: string[] }}
 */
export async function updateShop({ tenantId, shopId, name, address, phone, contact_email }) {
  // Validate only the fields that are being updated
  const validationErrors = [];

  if (name !== undefined) {
    const nameError = validateShopName(name);
    if (nameError) validationErrors.push(nameError);
  }

  if (address !== undefined) {
    const addressError = validateAddress(address);
    if (addressError) validationErrors.push(addressError);
  }

  if (phone !== undefined) {
    const phoneError = validatePhone(phone);
    if (phoneError) validationErrors.push(phoneError);
  }

  if (contact_email !== undefined) {
    const emailError = validateContactEmail(contact_email);
    if (emailError) validationErrors.push(emailError);
  }

  if (validationErrors.length > 0) {
    const err = new Error(validationErrors[0]);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = validationErrors;
    throw err;
  }

  // Verify the shop exists and belongs to this tenant
  const shopCheck = await queryTenant(
    'SELECT id FROM shops WHERE id = $1',
    [shopId],
    tenantId,
  );

  if (shopCheck.rows.length === 0) {
    const err = new Error('Shop not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Build dynamic SET clause — only include provided fields
  const setClauses = [];
  const params = [];
  let paramIndex = 1;

  if (name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(name.trim());
  }
  if (address !== undefined) {
    setClauses.push(`address = $${paramIndex++}`);
    params.push(address.trim());
  }
  if (phone !== undefined) {
    setClauses.push(`phone = $${paramIndex++}`);
    params.push(phone.trim());
  }
  if (contact_email !== undefined) {
    setClauses.push(`contact_email = $${paramIndex++}`);
    params.push(contact_email.trim().toLowerCase());
  }

  if (setClauses.length === 0) {
    // Nothing to update — return the current shop data
    return getShop({ tenantId, shopId });
  }

  // Always update the updated_at timestamp
  setClauses.push(`updated_at = NOW()`);

  // Add shopId as the WHERE param
  params.push(shopId);
  const shopIdParam = paramIndex;

  const updateResult = await queryTenant(
    `UPDATE shops
     SET ${setClauses.join(', ')}
     WHERE id = $${shopIdParam}
     RETURNING id, tenant_id, name, logo_url, address, phone, contact_email, updated_at`,
    params,
    tenantId,
  );

  if (updateResult.rows.length === 0) {
    const err = new Error('Shop not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return { shop: updateResult.rows[0] };
}

// ─── Upload shop logo ─────────────────────────────────────────────────────────

/**
 * Upload a logo image to the object store and update the shop's logo_url.
 *
 * The file is already validated by the Multer middleware (MIME type, size).
 * This function uploads the file and persists the resulting URL.
 *
 * Requirements: 2.3, 2.4, 2.7
 *
 * @param {{
 *   tenantId: string,
 *   shopId: string,
 *   file: { buffer: Buffer, mimetype: string, originalname: string }
 * }} data
 * @returns {Promise<{ shop: object }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function uploadShopLogo({ tenantId, shopId, file }) {
  if (!file) {
    const err = new Error('A logo image file is required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Verify the shop exists and belongs to this tenant
  const shopCheck = await queryTenant(
    'SELECT id FROM shops WHERE id = $1',
    [shopId],
    tenantId,
  );

  if (shopCheck.rows.length === 0) {
    const err = new Error('Shop not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Upload to object store
  const ext = (file.originalname || '').split('.').pop() || 'bin';
  const key = buildKey('logos', `${shopId}-${Date.now()}.${ext}`);
  const logoUrl = await uploadFile(file.buffer, key, file.mimetype);

  // Persist the new logo URL and return the updated shop
  const updateResult = await queryTenant(
    `UPDATE shops
     SET logo_url = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, tenant_id, name, logo_url, address, phone, contact_email, updated_at`,
    [logoUrl, shopId],
    tenantId,
  );

  if (updateResult.rows.length === 0) {
    const err = new Error('Shop not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return { shop: updateResult.rows[0] };
}
