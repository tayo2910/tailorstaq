'use strict';

/**
 * Shop settings routes.
 *
 * Task 5.2
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.8
 *
 * Endpoints:
 *   GET   /api/v1/shops/:shopId       — return shop details (tenant-scoped)
 *   PATCH /api/v1/shops/:shopId       — update shop name, address, phone, contact email
 *   POST  /api/v1/shops/:shopId/logo  — upload shop logo to object store
 *
 * All routes require authentication (tenant_admin role) and enforce tenant
 * ownership via tenantMiddleware (Requirement 2.8, 7.2, 8.8).
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { uploadLogo, handleUploadError, validateNonEmpty } from '../../middleware/upload.js';
import { getShop, updateShop, uploadShopLogo } from './shops.service.js';

const router = Router({ mergeParams: true });

// Apply authentication and tenant ownership check to all shop routes
router.use(authenticate, requireRole('tenant_admin'), tenantMiddleware);

// ─── GET /shops/:shopId ───────────────────────────────────────────────────────

/**
 * Retrieve shop details for the authenticated tenant.
 *
 * Requirement 2.2: Tenant_Admin can view their shop configuration.
 *
 * Success: 200 { shop: { id, tenant_id, name, logo_url, address, phone, contact_email, updated_at } }
 * Errors:
 *   401 UNAUTHENTICATED      — missing or invalid JWT
 *   401 TOKEN_EXPIRED        — JWT has expired
 *   403 FORBIDDEN            — authenticated user is not a tenant_admin
 *   403 CROSS_TENANT_ACCESS  — shop belongs to a different tenant
 *   404 NOT_FOUND            — shop does not exist
 */
router.get('/', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { tenantId } = req.user;

    const result = await getShop({ tenantId, shopId });
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

// ─── PATCH /shops/:shopId ─────────────────────────────────────────────────────

/**
 * Update shop settings (partial update).
 *
 * Supported fields: name (1–100), address (1–255), phone (7–20), contact_email.
 * Persists changes and responds within 5 s (Requirement 2.7).
 *
 * Requirements: 2.1, 2.2, 2.7
 *
 * Body (application/json):
 *   { [name], [address], [phone], [contact_email] }
 *
 * Success: 200 { shop: { id, tenant_id, name, logo_url, address, phone, contact_email, updated_at } }
 * Errors:
 *   400 VALIDATION_ERROR     — one or more fields failed validation
 *   401 UNAUTHENTICATED      — missing or invalid JWT
 *   401 TOKEN_EXPIRED        — JWT has expired
 *   403 FORBIDDEN            — authenticated user is not a tenant_admin
 *   403 CROSS_TENANT_ACCESS  — shop belongs to a different tenant
 *   404 NOT_FOUND            — shop does not exist
 */
router.patch('/', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { tenantId } = req.user;
    const { name, address, phone, contact_email } = req.body;

    const result = await updateShop({ tenantId, shopId, name, address, phone, contact_email });
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

// ─── POST /shops/:shopId/logo ─────────────────────────────────────────────────

/**
 * Upload a logo image for the shop.
 *
 * Accepts a multipart/form-data upload with the field name "logo".
 * The Multer middleware validates MIME type (PNG, JPG, SVG) and file size (≤ 5 MB).
 * validateNonEmpty rejects zero-byte files.
 * On success the logo is stored in the object store and logo_url is updated.
 *
 * Requirements: 2.3, 2.4, 2.7
 *
 * Body (multipart/form-data):
 *   logo — image file (PNG, JPG, or SVG, ≤ 5 MB, > 0 bytes)
 *
 * Success: 200 { shop: { id, tenant_id, name, logo_url, address, phone, contact_email, updated_at } }
 * Errors:
 *   400 VALIDATION_ERROR     — invalid file type, file too large, or zero-byte file
 *   401 UNAUTHENTICATED      — missing or invalid JWT
 *   401 TOKEN_EXPIRED        — JWT has expired
 *   403 FORBIDDEN            — authenticated user is not a tenant_admin
 *   403 CROSS_TENANT_ACCESS  — shop belongs to a different tenant
 *   404 NOT_FOUND            — shop does not exist
 */
router.post(
  '/logo',
  uploadLogo,
  handleUploadError,
  validateNonEmpty,
  async (req, res) => {
    try {
      const { shopId } = req.params;
      const { tenantId } = req.user;

      const file = req.file
        ? {
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname,
          }
        : undefined;

      const result = await uploadShopLogo({ tenantId, shopId, file });
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
  },
);

export default router;
