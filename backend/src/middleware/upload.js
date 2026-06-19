'use strict';

/**
 * Multer file upload middleware.
 *
 * Configured per Requirements 2.3, 2.4, 2.6:
 *   - Maximum file size: 5 MB (5 * 1024 * 1024 bytes)
 *   - Accepted MIME types: image/png, image/jpeg, image/svg+xml
 *   - Zero-byte files are rejected after upload with a distinct VALIDATION_ERROR
 *
 * Exports:
 *   uploadImage   — single-file upload middleware (field name: "image")
 *   uploadLogo    — single-file upload middleware (field name: "logo")
 *   handleUploadError — error-handling middleware that converts Multer errors
 *                       to the platform's standard VALIDATION_ERROR envelope
 *   validateNonEmpty  — post-upload middleware that rejects zero-byte files
 */

import multer from 'multer';
import { env } from '../config/env.js';

// ─── Allowed MIME types ───────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);

// ─── Multer configuration ─────────────────────────────────────────────────────

/**
 * fileFilter: reject files whose MIME type is not in the allowed set.
 * Multer calls this before writing the file to storage.
 *
 * @param {import('express').Request} _req
 * @param {Express.Multer.File} file
 * @param {multer.FileFilterCallback} cb
 */
function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
    err.message = `Invalid file type "${file.mimetype}". Only PNG, JPG, and SVG images are accepted.`;
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }
  cb(null, true);
}

/**
 * Multer instance using memory storage so files are available as
 * req.file.buffer for direct upload to the object store.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.UPLOAD_MAX_FILE_SIZE_BYTES, // 5 MB default
  },
  fileFilter,
});

// ─── Exported middleware ──────────────────────────────────────────────────────

/**
 * Single-file upload middleware for product images (field name: "image").
 * Chain with handleUploadError and validateNonEmpty.
 *
 * @example
 * router.post('/products', authenticate, uploadImage, handleUploadError, validateNonEmpty, handler);
 */
export const uploadImage = upload.single('image');

/**
 * Single-file upload middleware for shop logos (field name: "logo").
 * Chain with handleUploadError and validateNonEmpty.
 *
 * @example
 * router.post('/shops/:shopId/logo', authenticate, uploadLogo, handleUploadError, validateNonEmpty, handler);
 */
export const uploadLogo = upload.single('logo');

/**
 * Error-handling middleware that converts Multer errors into the platform's
 * standard VALIDATION_ERROR JSON envelope.
 *
 * Must be placed immediately after the Multer middleware in the route chain.
 *
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function handleUploadError(err, _req, res, next) {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `File exceeds the maximum allowed size of ${env.UPLOAD_MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
        },
      });
    }

    if (err.code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message,
        },
      });
    }

    // Other Multer errors (e.g. LIMIT_UNEXPECTED_FILE from wrong field name)
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message || 'File upload failed.',
      },
    });
  }

  // Non-Multer error — pass through to the global error handler
  return next(err);
}

/**
 * Post-upload middleware that rejects zero-byte files.
 *
 * Multer does not reject zero-byte files on its own; this check runs after
 * the file has been accepted by fileFilter and stored in memory.
 *
 * If no file was uploaded (req.file is undefined) this middleware passes
 * through — use it only on routes where a file is required.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateNonEmpty(req, res, next) {
  if (req.file && req.file.size === 0) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Uploaded file is empty (0 bytes). Please upload a valid image.',
      },
    });
  }
  return next();
}
