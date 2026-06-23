'use strict';

/**
 * Tenant routes — registration, approval, shop provisioning.
 *
 * Task 4.1
 * Requirements: 1.1, 1.2, 1.3
 *
 * Endpoints:
 *   POST /register — submit a tenant registration request (public)
 */

import { Router } from 'express';
import { registerTenant } from './tenants.service.js';

const router = Router();

// ─── POST /register ───────────────────────────────────────────────────────────

/**
 * Submit a tenant registration (approval) request.
 *
 * Body: { business_name, contact_email, phone, business_description }
 * Success: 201 { message, requestId }
 * Errors:
 *   400 VALIDATION_ERROR  — invalid or missing inputs
 *   409 DUPLICATE_EMAIL   — email already in use in approval_requests or tenants
 */
router.post('/register', async (req, res) => {
  try {
    const { business_name, contact_email, phone, business_description, password } = req.body;
    const result = await registerTenant({
      business_name,
      contact_email,
      phone,
      business_description,
      password,
    });
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

export default router;
