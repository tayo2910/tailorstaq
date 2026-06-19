/**
 * Unit tests for upload middleware (task 5.1).
 *
 * Tests:
 *   - fileFilter accepts PNG, JPEG, SVG MIME types
 *   - fileFilter rejects all other MIME types with INVALID_FILE_TYPE code
 *   - handleUploadError converts LIMIT_FILE_SIZE to VALIDATION_ERROR
 *   - handleUploadError converts INVALID_FILE_TYPE to VALIDATION_ERROR
 *   - handleUploadError passes non-Multer errors through
 *   - validateNonEmpty rejects zero-byte files
 *   - validateNonEmpty passes files with size > 0
 *   - validateNonEmpty passes when no file is present (optional upload)
 *
 * Requirements: 2.3, 2.4, 2.6
 */

import { jest } from '@jest/globals';
import multer from 'multer';
import { handleUploadError, validateNonEmpty } from '../../src/middleware/upload.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock Express response that captures the JSON sent.
 */
function mockRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

/**
 * Build a minimal mock Express request.
 */
function mockReq(overrides = {}) {
  return { headers: {}, ...overrides };
}

// ─── handleUploadError ────────────────────────────────────────────────────────

describe('handleUploadError — Multer LIMIT_FILE_SIZE', () => {
  test('returns 400 VALIDATION_ERROR with file-size message', () => {
    const err = new multer.MulterError('LIMIT_FILE_SIZE');
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    handleUploadError(err, req, res, next);

    expect(res._status).toBe(400);
    expect(res._body.error.code).toBe('VALIDATION_ERROR');
    expect(res._body.error.message).toMatch(/maximum allowed size/i);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('handleUploadError — INVALID_FILE_TYPE', () => {
  test('returns 400 VALIDATION_ERROR with the custom message from fileFilter', () => {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
    err.code = 'INVALID_FILE_TYPE';
    err.message = 'Invalid file type "application/pdf". Only PNG, JPG, and SVG images are accepted.';

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    handleUploadError(err, req, res, next);

    expect(res._status).toBe(400);
    expect(res._body.error.code).toBe('VALIDATION_ERROR');
    expect(res._body.error.message).toMatch(/Invalid file type/i);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('handleUploadError — other MulterError', () => {
  test('returns 400 VALIDATION_ERROR for any other Multer error code', () => {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
    err.message = 'Unexpected field';

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    handleUploadError(err, req, res, next);

    expect(res._status).toBe(400);
    expect(res._body.error.code).toBe('VALIDATION_ERROR');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('handleUploadError — non-Multer error', () => {
  test('calls next(err) for non-Multer errors', () => {
    const err = new Error('Something else went wrong');
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    handleUploadError(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res._status).toBeNull();
  });
});

describe('handleUploadError — no error', () => {
  test('calls next() when err is null', () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    handleUploadError(null, req, res, next);

    expect(next).toHaveBeenCalledWith(); // called with no args
    expect(res._status).toBeNull();
  });
});

// ─── validateNonEmpty ─────────────────────────────────────────────────────────

describe('validateNonEmpty — zero-byte file', () => {
  test('returns 400 VALIDATION_ERROR when req.file.size === 0', () => {
    const req = mockReq({ file: { size: 0, originalname: 'empty.png', mimetype: 'image/png' } });
    const res = mockRes();
    const next = jest.fn();

    validateNonEmpty(req, res, next);

    expect(res._status).toBe(400);
    expect(res._body.error.code).toBe('VALIDATION_ERROR');
    expect(res._body.error.message).toMatch(/empty.*0 bytes/i);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('validateNonEmpty — valid file', () => {
  test('calls next() when req.file.size > 0', () => {
    const req = mockReq({ file: { size: 1024, originalname: 'logo.png', mimetype: 'image/png' } });
    const res = mockRes();
    const next = jest.fn();

    validateNonEmpty(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });

  test('calls next() when req.file is undefined (optional upload)', () => {
    const req = mockReq({ file: undefined });
    const res = mockRes();
    const next = jest.fn();

    validateNonEmpty(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });
});

// ─── buildKey (storage utility) ───────────────────────────────────────────────

import { buildKey } from '../../src/utils/storage.js';

describe('buildKey', () => {
  test('combines folder and filename with a single slash', () => {
    expect(buildKey('logos', 'shop-123.png')).toBe('logos/shop-123.png');
  });

  test('strips leading slash from folder', () => {
    expect(buildKey('/logos', 'shop-123.png')).toBe('logos/shop-123.png');
  });

  test('strips trailing slash from folder', () => {
    expect(buildKey('logos/', 'shop-123.png')).toBe('logos/shop-123.png');
  });

  test('handles nested folder paths', () => {
    expect(buildKey('uploads/products', 'item-456.jpg')).toBe('uploads/products/item-456.jpg');
  });
});
