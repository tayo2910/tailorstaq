'use strict';

/**
 * Auth service — business logic for login, registration, lockout.
 *
 * Tasks 3.1 and 3.2.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 8.2, 8.4, 8.5
 */

import crypto from 'crypto';
import { query } from '../../db/queries/base.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { signToken } from '../../utils/jwt.js';
import { env } from '../../config/env.js';
import { enqueueVerificationEmail, enqueueAccountLockedEmail } from '../../queues/email.queue.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Validate full_name: 1–100 characters.
 * @param {string} fullName
 * @returns {string|null} error message or null
 */
function validateFullName(fullName) {
  if (typeof fullName !== 'string' || fullName.trim().length === 0) {
    return 'Full name is required.';
  }
  if (fullName.trim().length > 100) {
    return 'Full name must be between 1 and 100 characters.';
  }
  return null;
}

/**
 * Validate email: basic RFC 5321 format check.
 * @param {string} email
 * @returns {string|null} error message or null
 */
function validateEmail(email) {
  if (typeof email !== 'string' || email.trim().length === 0) {
    return 'Email address is required.';
  }
  // RFC 5321 local@domain format — local part up to 64 chars, domain up to 255 chars
  const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
  if (!emailRegex.test(email.trim())) {
    return 'Email address must be a valid RFC 5321 format.';
  }
  return null;
}

/**
 * Validate password strength:
 *   - min 8 characters
 *   - at least 1 uppercase letter
 *   - at least 1 lowercase letter
 *   - at least 1 digit
 *   - at least 1 special character
 * @param {string} password
 * @returns {string|null} error message or null
 */
export function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
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
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special character.';
  }
  return null;
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a new customer account.
 *
 * Flow:
 *  1. Validate inputs (full_name, email, password).
 *  2. Check email uniqueness.
 *  3. Hash password.
 *  4. Insert user with role='customer', account_status='pending_verification'.
 *  5. Generate UUID token, insert into email_verifications (expires in 24 h).
 *  6. Enqueue verification email job.
 *
 * @param {{ full_name: string, email: string, password: string }} data
 * @returns {Promise<{ message: string }>}
 * @throws {{ status: number, code: string, message: string }} on validation/conflict errors
 */
export async function registerCustomer({ full_name, email, password }) {
  // 1. Validate inputs
  const validationErrors = [];

  const fullNameError = validateFullName(full_name);
  if (fullNameError) validationErrors.push(fullNameError);

  const emailError = validateEmail(email);
  if (emailError) validationErrors.push(emailError);

  const passwordError = validatePasswordStrength(password);
  if (passwordError) validationErrors.push(passwordError);

  if (validationErrors.length > 0) {
    const err = new Error(validationErrors[0]);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = validationErrors;
    throw err;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 2. Check email uniqueness
  const existingUser = await query(
    'SELECT id FROM users WHERE email = $1',
    [normalizedEmail],
  );
  if (existingUser.rows.length > 0) {
    const err = new Error('An account with this email address already exists.');
    err.status = 409;
    err.code = 'DUPLICATE_EMAIL';
    throw err;
  }

  // 3. Hash password
  const passwordHash = await hashPassword(password);

  // 4. Insert user
  const insertUserResult = await query(
    `INSERT INTO users (full_name, email, password_hash, role, tenant_id, account_status, failed_attempts)
     VALUES ($1, $2, $3, 'customer', NULL, 'pending_verification', 0)
     RETURNING id`,
    [full_name.trim(), normalizedEmail, passwordHash],
  );
  const userId = insertUserResult.rows[0].id;

  // 5. Generate verification token and insert into email_verifications
  const token = crypto.randomUUID();
  await query(
    `INSERT INTO email_verifications (user_id, token, expires_at, used)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours', false)`,
    [userId, token],
  );

  // 6. Enqueue verification email (best-effort; registration succeeds even if enqueue fails)
  try {
    await enqueueVerificationEmail({
      userId,
      email: normalizedEmail,
      fullName: full_name.trim(),
      token,
    });
  } catch (queueErr) {
    // Log but do not fail the registration — the user can request a resend
    console.error('Failed to enqueue verification email:', queueErr.message);
  }

  return { message: 'Verification email sent' };
}

// ─── Email verification ───────────────────────────────────────────────────────

/**
 * Verify a customer's email address using a one-time token.
 *
 * Flow:
 *  1. Look up token in email_verifications.
 *  2. If not found → 400 VALIDATION_ERROR (invalid token).
 *  3. If used = true → 400 VALIDATION_ERROR (token already used).
 *  4. If expires_at <= NOW() → 400 VALIDATION_ERROR (token expired).
 *  5. Update user account_status = 'active'.
 *  6. Mark token used = true.
 *
 * @param {{ token: string }} data
 * @returns {Promise<{ message: string }>}
 * @throws {{ status: number, code: string, message: string }} on invalid/expired token
 */
export async function verifyEmail({ token }) {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    const err = new Error('Verification token is required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 1. Look up token
  const tokenResult = await query(
    `SELECT ev.id, ev.user_id, ev.used, ev.expires_at
     FROM email_verifications ev
     WHERE ev.token = $1`,
    [token.trim()],
  );

  // 2. Token not found
  if (tokenResult.rows.length === 0) {
    const err = new Error('Invalid verification token.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const record = tokenResult.rows[0];

  // 3. Token already used
  if (record.used) {
    const err = new Error('This verification link has already been used.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 4. Token expired
  if (new Date(record.expires_at) <= new Date()) {
    const err = new Error(
      'This verification link has expired. Please request a new verification email.',
    );
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 5. Activate user account
  await query(
    `UPDATE users SET account_status = 'active' WHERE id = $1`,
    [record.user_id],
  );

  // 6. Mark token as used
  await query(
    `UPDATE email_verifications SET used = true WHERE id = $1`,
    [record.id],
  );

  return { message: 'Email verified successfully' };
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Authenticate a user and issue a JWT.
 *
 * Flow:
 *  1. Validate email and password inputs.
 *  2. Look up user by email.
 *  3. Check account_status: reject pending_verification with specific message.
 *  4. Check lockout: reject if locked_until > NOW().
 *  5. Verify password.
 *  6. On failure: increment failed_attempts; lock if threshold reached.
 *  7. On success: reset failed_attempts; issue JWT.
 *
 * @param {{ email: string, password: string }} data
 * @returns {Promise<{ token: string }>}
 * @throws {{ status: number, code: string, message: string }}
 */
export async function login({ email, password }) {
  // 1. Basic input validation
  if (!email || !password) {
    const err = new Error('Email and password are required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 2. Look up user
  const userResult = await query(
    `SELECT id, full_name, email, password_hash, role, tenant_id,
            account_status, failed_attempts, locked_until
     FROM users
     WHERE email = $1`,
    [normalizedEmail],
  );

  // Generic failure message to avoid user enumeration
  const authFailErr = () => {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    err.code = 'UNAUTHENTICATED';
    return err;
  };

  if (userResult.rows.length === 0) {
    throw authFailErr();
  }

  const user = userResult.rows[0];

  // 3. Pending verification
  if (user.account_status === 'pending_verification') {
    const err = new Error(
      'Please verify your email address before logging in.',
    );
    err.status = 401;
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // 4. Lockout check
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const err = new Error(
      'Your account is temporarily locked due to too many failed login attempts. Please try again later.',
    );
    err.status = 423;
    err.code = 'ACCOUNT_LOCKED';
    throw err;
  }

  // 5. Verify password
  const passwordMatch = await verifyPassword(password, user.password_hash);

  if (!passwordMatch) {
    // 6. Increment failed_attempts
    const newFailedAttempts = user.failed_attempts + 1;
    const maxAttempts = env.MAX_FAILED_LOGIN_ATTEMPTS;

    if (newFailedAttempts >= maxAttempts) {
      // Lock the account
      const lockoutMinutes = env.LOCKOUT_DURATION_MINUTES;
      await query(
        `UPDATE users
         SET failed_attempts = $1,
             locked_until = NOW() + ($2 || ' minutes')::INTERVAL,
             account_status = 'locked'
         WHERE id = $3`,
        [newFailedAttempts, String(lockoutMinutes), user.id],
      );

      // Enqueue lockout notification (best-effort)
      try {
        await enqueueAccountLockedEmail({
          userId: user.id,
          email: user.email,
          fullName: user.full_name,
          lockoutMinutes,
        });
      } catch (queueErr) {
        console.error('Failed to enqueue account locked email:', queueErr.message);
      }

      const err = new Error(
        `Your account has been locked for ${lockoutMinutes} minutes due to too many failed login attempts.`,
      );
      err.status = 423;
      err.code = 'ACCOUNT_LOCKED';
      throw err;
    } else {
      await query(
        `UPDATE users SET failed_attempts = $1 WHERE id = $2`,
        [newFailedAttempts, user.id],
      );
    }

    throw authFailErr();
  }

  // 7. Successful login — reset failed_attempts and issue JWT
  await query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL, account_status = 'active'
     WHERE id = $1`,
    [user.id],
  );

  const token = signToken({
    userId: user.id,
    role: user.role,
    tenantId: user.tenant_id ?? null,
  });

  return { token, userId: user.id, role: user.role, fullName: user.full_name };
}
