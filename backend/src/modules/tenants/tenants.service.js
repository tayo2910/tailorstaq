'use strict';

/**
 * Tenant service — business logic for tenant registration.
 *
 * Task 4.1
 * Requirements: 1.1, 1.2, 1.3
 *
 * Endpoint handled here:
 *   POST /api/v1/tenants/register — create an approval_request with status 'pending'
 */

import { query } from '../../db/queries/base.js';
import { hashPassword } from '../../utils/password.js';
import { enqueueTenantConfirmationEmail } from '../../queues/email.queue.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Validate business name: 1–100 characters.
 * @param {string} businessName
 * @returns {string|null} error message or null
 */
function validateBusinessName(businessName) {
  if (typeof businessName !== 'string' || businessName.trim().length === 0) {
    return 'Business name is required.';
  }
  if (businessName.trim().length > 100) {
    return 'Business name must be between 1 and 100 characters.';
  }
  return null;
}

/**
 * Validate contact email: basic RFC 5321 format check.
 * @param {string} email
 * @returns {string|null} error message or null
 */
function validateContactEmail(email) {
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

/**
 * Validate phone number: 7–20 characters.
 * @param {string} phone
 * @returns {string|null} error message or null
 */
function validatePhone(phone) {
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
 * Validate business description: 1–500 characters.
 * @param {string} description
 * @returns {string|null} error message or null
 */
function validateBusinessDescription(description) {
  if (typeof description !== 'string' || description.trim().length === 0) {
    return 'Business description is required.';
  }
  if (description.trim().length > 500) {
    return 'Business description must be between 1 and 500 characters.';
  }
  return null;
}

/**
 * Validate password: 8–128 characters with at least one uppercase, one lowercase, one digit.
 * @param {string} password
 * @returns {string|null} error message or null
 */
function validatePassword(password) {
  if (typeof password !== 'string' || password.trim().length === 0) {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (password.length > 128) {
    return 'Password must be no more than 128 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one digit.';
  }
  return null;
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a prospective tenant by creating an approval_request row.
 *
 * Flow:
 *  1. Validate all inputs (business_name, contact_email, phone, business_description).
 *  2. Check contact_email uniqueness across approval_requests AND tenants.
 *  3. Insert approval_requests row with status = 'pending'.
 *  4. Enqueue confirmation email to the submitted contact_email.
 *
 * @param {{
 *   business_name: string,
 *   contact_email: string,
 *   phone: string,
 *   business_description: string
 * }} data
 * @returns {Promise<{ message: string, requestId: string }>}
 * @throws {{ status: number, code: string, message: string, details?: string[] }}
 */
export async function registerTenant({
  business_name,
  contact_email,
  phone,
  business_description,
  password,
}) {
  // 1. Validate inputs
  const validationErrors = [];

  const businessNameError = validateBusinessName(business_name);
  if (businessNameError) validationErrors.push(businessNameError);

  const emailError = validateContactEmail(contact_email);
  if (emailError) validationErrors.push(emailError);

  const phoneError = validatePhone(phone);
  if (phoneError) validationErrors.push(phoneError);

  const descriptionError = validateBusinessDescription(business_description);
  if (descriptionError) validationErrors.push(descriptionError);

  const passwordError = validatePassword(password);
  if (passwordError) validationErrors.push(passwordError);

  if (validationErrors.length > 0) {
    const err = new Error(validationErrors[0]);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = validationErrors;
    throw err;
  }

  const normalizedEmail = contact_email.trim().toLowerCase();

  // 2. Check email uniqueness across approval_requests AND tenants
  //    Requirement 1.2: reject if email already exists in either table.
  const [existingApproval, existingTenant] = await Promise.all([
    query(
      'SELECT id FROM approval_requests WHERE contact_email = $1',
      [normalizedEmail],
    ),
    query(
      'SELECT id FROM tenants WHERE contact_email = $1',
      [normalizedEmail],
    ),
  ]);

  if (existingApproval.rows.length > 0 || existingTenant.rows.length > 0) {
    const err = new Error(
      'This email address is already associated with an existing registration or tenant account.',
    );
    err.status = 409;
    err.code = 'DUPLICATE_EMAIL';
    throw err;
  }

  const passwordHash = await hashPassword(password);

  // 3. Insert approval_requests row with status = 'pending'
  const insertResult = await query(
    `INSERT INTO approval_requests
        (business_name, contact_email, phone, business_description, password_hash, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id`,
    [
      business_name.trim(),
      normalizedEmail,
      phone.trim(),
      business_description.trim(),
      passwordHash,
    ],
  );

  const requestId = insertResult.rows[0].id;

  // 4. Enqueue confirmation email (best-effort; registration succeeds even if enqueue fails)
  try {
    await enqueueTenantConfirmationEmail({
      requestId,
      email: normalizedEmail,
      businessName: business_name.trim(),
    });
  } catch (queueErr) {
    // Log but do not fail the registration
    console.error('Failed to enqueue tenant confirmation email:', queueErr.message);
  }

  return {
    message: 'Registration submitted successfully. You will receive a confirmation email shortly.',
    requestId,
  };
}

// Export validators for unit testing
export { validateBusinessName, validateContactEmail, validatePhone, validatePassword, validateBusinessDescription };
