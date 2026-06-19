'use strict';

/**
 * Product routes — CRUD for shop products.
 *
 * Task 6.1
 * Requirements: 2.5, 2.6, 3.3, 3.4
 *
 * Endpoints:
 *   GET    /shops/:shopId/products        — list active products (tenant-scoped)
 *   POST   /shops/:shopId/products        — create product (with free-tier limit check)
 *   PATCH  /shops/:shopId/products/:id    — update product fields
 *   DELETE /shops/:shopId/products/:id    — soft-delete (set active = false)
 *
 * All routes require authentication.
 * Write routes (POST, PATCH, DELETE) require tenant_admin role.
 * GET is accessible to both tenant_admin and customer roles.
 * tenantMiddleware is applied to all routes to enforce shop ownership.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { uploadImage, handleUploadError, validateNonEmpty } from '../../middleware/upload.js';
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from './products.service.js';

const router = Router({ mergeParams: true });

// Apply authentication and tenant ownership check to all product routes
router.use(authenticate, tenantMiddleware);

// ─── GET /shops/:shopId/products ──────────────────────────────────────────────

/**
 * List all active products for a shop.
 *
 * Accessible by: tenant_admin, customer
 *
 * Success: 200 { products: [...] }
 * Errors:
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 CROSS_TENANT_ACCESS — accessing another tenant's shop
 */
router.get('/', requireRole('tenant_admin', 'customer'), async (req, res) => {
  try {
    const { shopId } = req.params;
    const { tenantId } = req.user;

    const result = await listProducts({ tenantId, shopId });
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

// ─── POST /shops/:shopId/products ─────────────────────────────────────────────

/**
 * Create a new product in a shop.
 *
 * Accepts an optional image upload (field name: "image").
 * Enforces free-tier active product limit (max 10).
 *
 * Body (multipart/form-data or application/json):
 *   { name, description, price, [image] }
 *
 * Success: 201 { product: { id, shop_id, name, description, price, image_url, active, created_at } }
 * Errors:
 *   400 VALIDATION_ERROR  — invalid inputs or file type/size
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 FORBIDDEN         — not a tenant_admin
 *   403 CROSS_TENANT_ACCESS — accessing another tenant's shop
 *   404 NOT_FOUND         — shop not found
 *   422 LIMIT_EXCEEDED    — free-tier product limit reached
 */
router.post(
  '/',
  requireRole('tenant_admin'),
  uploadImage,
  handleUploadError,
  validateNonEmpty,
  async (req, res) => {
    try {
      const { shopId } = req.params;
      const { tenantId } = req.user;
      const { name, description, price } = req.body;

      const imageFile = req.file
        ? {
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname,
          }
        : undefined;

      const result = await createProduct({
        tenantId,
        shopId,
        name,
        description,
        price,
        imageFile,
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
  },
);

// ─── PATCH /shops/:shopId/products/:id ───────────────────────────────────────

/**
 * Update an existing product's fields (partial update).
 *
 * Accepts an optional image upload (field name: "image").
 * If activating a product (active: true), re-checks the free-tier limit.
 *
 * Body (multipart/form-data or application/json):
 *   { [name], [description], [price], [active], [image] }
 *
 * Success: 200 { product: { id, shop_id, name, description, price, image_url, active, created_at } }
 * Errors:
 *   400 VALIDATION_ERROR  — invalid inputs or file type/size
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 FORBIDDEN         — not a tenant_admin
 *   403 CROSS_TENANT_ACCESS — accessing another tenant's shop
 *   404 NOT_FOUND         — product not found
 *   422 LIMIT_EXCEEDED    — free-tier product limit reached (when re-activating)
 */
router.patch(
  '/:id',
  requireRole('tenant_admin'),
  uploadImage,
  handleUploadError,
  validateNonEmpty,
  async (req, res) => {
    try {
      const { shopId, id: productId } = req.params;
      const { tenantId } = req.user;
      const { name, description, price, active } = req.body;

      // Parse active from string if sent as form data
      let parsedActive;
      if (active !== undefined) {
        if (active === 'true' || active === true) parsedActive = true;
        else if (active === 'false' || active === false) parsedActive = false;
        else parsedActive = undefined;
      }

      const imageFile = req.file
        ? {
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname,
          }
        : undefined;

      const result = await updateProduct({
        tenantId,
        shopId,
        productId,
        name,
        description,
        price,
        active: parsedActive,
        imageFile,
      });

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

// ─── DELETE /shops/:shopId/products/:id ──────────────────────────────────────

/**
 * Soft-delete a product (sets active = false).
 *
 * Success: 200 { message: 'Product removed successfully.' }
 * Errors:
 *   401 UNAUTHENTICATED   — missing or invalid JWT
 *   403 FORBIDDEN         — not a tenant_admin
 *   403 CROSS_TENANT_ACCESS — accessing another tenant's shop
 *   404 NOT_FOUND         — product not found
 */
router.delete('/:id', requireRole('tenant_admin'), async (req, res) => {
  try {
    const { shopId, id: productId } = req.params;
    const { tenantId } = req.user;

    const result = await deleteProduct({ tenantId, shopId, productId });
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
