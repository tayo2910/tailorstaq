'use strict';

/**
 * Object store upload helper.
 *
 * Provides a thin abstraction over AWS S3 (or any S3-compatible store such as
 * MinIO or Cloudflare R2) for uploading files and returning their public URLs.
 *
 * Configuration is read from the centralised env module:
 *   OBJECT_STORE_BUCKET          — target bucket name
 *   OBJECT_STORE_REGION          — AWS region (or equivalent)
 *   OBJECT_STORE_ACCESS_KEY_ID   — credentials
 *   OBJECT_STORE_SECRET_ACCESS_KEY
 *   OBJECT_STORE_ENDPOINT        — optional custom endpoint (for MinIO etc.)
 *   OBJECT_STORE_FORCE_PATH_STYLE — set true for path-style S3 URLs (MinIO)
 *
 * Exports:
 *   uploadFile(buffer, key, mimeType) → Promise<string>  (public URL)
 *   deleteFile(key)                   → Promise<void>
 *   buildKey(folder, filename)        → string
 */

import { env } from '../config/env.js';

// ─── Lazy S3 client factory ───────────────────────────────────────────────────
// We import @aws-sdk/client-s3 lazily so that the module can be loaded in test
// environments without requiring AWS credentials to be present.

let _s3Client = null;

/**
 * Returns a singleton S3Client instance, creating it on first call.
 * Throws a clear error if the AWS SDK is not installed.
 *
 * @returns {import('@aws-sdk/client-s3').S3Client}
 */
async function getS3Client() {
  if (_s3Client) return _s3Client;

  let S3Client;
  try {
    ({ S3Client } = await import('@aws-sdk/client-s3'));
  } catch {
    throw new Error(
      'AWS SDK (@aws-sdk/client-s3) is not installed. ' +
        'Run: npm install @aws-sdk/client-s3',
    );
  }

  const clientConfig = {
    region: env.OBJECT_STORE_REGION,
    credentials: {
      accessKeyId: env.OBJECT_STORE_ACCESS_KEY_ID,
      secretAccessKey: env.OBJECT_STORE_SECRET_ACCESS_KEY,
    },
  };

  if (env.OBJECT_STORE_ENDPOINT) {
    clientConfig.endpoint = env.OBJECT_STORE_ENDPOINT;
    clientConfig.forcePathStyle = env.OBJECT_STORE_FORCE_PATH_STYLE;
  }

  _s3Client = new S3Client(clientConfig);
  return _s3Client;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Build a deterministic object key from a folder prefix and a filename.
 *
 * @param {string} folder   — e.g. 'logos', 'products', 'receipts'
 * @param {string} filename — e.g. 'shop-uuid-1234.png'
 * @returns {string}        — e.g. 'logos/shop-uuid-1234.png'
 */
export function buildKey(folder, filename) {
  // Normalise: strip leading/trailing slashes from folder
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
  return `${cleanFolder}/${filename}`;
}

/**
 * Upload a file buffer to the configured object store.
 *
 * @param {Buffer}  buffer   — file contents (from multer memoryStorage)
 * @param {string}  key      — object key within the bucket (use buildKey())
 * @param {string}  mimeType — MIME type, e.g. 'image/png'
 * @returns {Promise<string>} Public URL of the uploaded object
 *
 * @throws {Error} If the upload fails or the SDK is not installed
 *
 * @example
 * const key = buildKey('logos', `${shopId}-${Date.now()}.png`);
 * const url = await uploadFile(req.file.buffer, key, req.file.mimetype);
 */
export async function uploadFile(buffer, key, mimeType) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('uploadFile: buffer must be a Buffer instance.');
  }
  if (!key || typeof key !== 'string') {
    throw new TypeError('uploadFile: key must be a non-empty string.');
  }
  if (!mimeType || typeof mimeType !== 'string') {
    throw new TypeError('uploadFile: mimeType must be a non-empty string.');
  }

  let PutObjectCommand;
  try {
    ({ PutObjectCommand } = await import('@aws-sdk/client-s3'));
  } catch {
    throw new Error(
      'AWS SDK (@aws-sdk/client-s3) is not installed. ' +
        'Run: npm install @aws-sdk/client-s3',
    );
  }

  const client = await getS3Client();

  const command = new PutObjectCommand({
    Bucket: env.OBJECT_STORE_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    // ACL is intentionally omitted — bucket policy should control public access.
    // For public-read buckets, add: ACL: 'public-read'
  });

  await client.send(command);

  // Build the public URL.
  // For custom endpoints (MinIO etc.) use path-style; otherwise use virtual-hosted style.
  if (env.OBJECT_STORE_ENDPOINT) {
    const base = env.OBJECT_STORE_ENDPOINT.replace(/\/+$/, '');
    if (env.OBJECT_STORE_FORCE_PATH_STYLE) {
      return `${base}/${env.OBJECT_STORE_BUCKET}/${key}`;
    }
    return `${base}/${key}`;
  }

  // Standard AWS S3 virtual-hosted URL
  return `https://${env.OBJECT_STORE_BUCKET}.s3.${env.OBJECT_STORE_REGION}.amazonaws.com/${key}`;
}

/**
 * Delete an object from the configured object store.
 *
 * @param {string} key — object key within the bucket
 * @returns {Promise<void>}
 *
 * @throws {Error} If the deletion fails or the SDK is not installed
 */
export async function deleteFile(key) {
  if (!key || typeof key !== 'string') {
    throw new TypeError('deleteFile: key must be a non-empty string.');
  }

  let DeleteObjectCommand;
  try {
    ({ DeleteObjectCommand } = await import('@aws-sdk/client-s3'));
  } catch {
    throw new Error(
      'AWS SDK (@aws-sdk/client-s3) is not installed. ' +
        'Run: npm install @aws-sdk/client-s3',
    );
  }

  const client = await getS3Client();

  const command = new DeleteObjectCommand({
    Bucket: env.OBJECT_STORE_BUCKET,
    Key: key,
  });

  await client.send(command);
}
