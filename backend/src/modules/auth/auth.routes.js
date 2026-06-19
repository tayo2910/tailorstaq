'use strict';

/**
 * Auth routes — login, registration, email verification.
 *
 * Tasks 3.1 and 3.2.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 8.2, 8.4, 8.5
 *
 * Endpoints:
 *   POST /login                — issue JWT (task 3.1)
 *   POST /register/customer    — customer registration (task 3.2)
 *   POST /verify-email         — email verification (task 3.2)
 */

import { Router } from 'express';
import { login, registerCustomer, verifyEmail } from './auth.service.js';

const router = Router();

// ─── POST /register/customer ─────────────────────────────────────────────────

/**
 * Register a new customer account.
 *
 * Body: { full_name, email, password }
 * Success: 201 { message: 'Verification email sent' }
 * Errors:
 *   400 VALIDATION_ERROR  — invalid inputs
 *   409 DUPLICATE_EMAIL   — email already registered
 */
router.post('/register/customer', async (req, res) => {
  try {
    const { full_name, email, password } = req.body;
    const result = await registerCustomer({ full_name, email, password });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred.',
        details: err.details || [],
      },
    });
  }
});

// ─── POST /verify-email ───────────────────────────────────────────────────────

/**
 * Verify a customer's email address using a one-time token.
 *
 * Body: { token }
 * Success: 200 { message: 'Email verified successfully' }
 * Errors:
 *   400 VALIDATION_ERROR  — invalid, used, or expired token
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    const result = await verifyEmail({ token });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred.',
        details: err.details || [],
      },
    });
  }
});

// ─── POST /login ──────────────────────────────────────────────────────────────

/**
 * Authenticate a user and issue a JWT.
 *
 * Body: { email, password }
 * Success: 200 { token }
 * Errors:
 *   400 VALIDATION_ERROR  — missing inputs
 *   401 UNAUTHENTICATED   — invalid credentials or unverified account
 *   423 ACCOUNT_LOCKED    — account locked due to failed attempts
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login({ email, password });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred.',
        details: err.details || [],
      },
    });
  }
});

export default router;
