'use strict';

/**
 * Order reference number generator.
 *
 * Generates a cryptographically random 8–12 character uppercase alphanumeric
 * string and verifies its uniqueness against the `orders.reference` column
 * before returning it.
 *
 * Requirements: 5.2
 */

import { randomBytes } from 'crypto';
import { query } from '../db/queries/base.js';

/** Characters used in order references — uppercase letters and digits only. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Minimum and maximum reference length (inclusive). */
const MIN_LENGTH = 8;
const MAX_LENGTH = 12;

/** Maximum number of generation attempts before giving up. */
const MAX_ATTEMPTS = 10;

/**
 * Generate a single cryptographically random uppercase alphanumeric string
 * of the given length.
 *
 * Uses rejection sampling to eliminate modulo bias: bytes whose value falls
 * outside the largest multiple of ALPHABET.length that fits in a byte are
 * discarded and re-sampled.
 *
 * @param {number} length - Desired string length (8–12).
 * @returns {string} Uppercase alphanumeric string.
 */
export function generateRawReference(length) {
  if (length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new RangeError(
      `Reference length must be between ${MIN_LENGTH} and ${MAX_LENGTH}, got ${length}`,
    );
  }

  const alphabetLen = ALPHABET.length; // 36
  // Largest multiple of alphabetLen that fits in a byte (0–255)
  const maxUnbiased = Math.floor(256 / alphabetLen) * alphabetLen; // 252

  const chars = [];
  while (chars.length < length) {
    // Request extra bytes to reduce the number of rejection-sampling rounds
    const buf = randomBytes(length * 2);
    for (let i = 0; i < buf.length && chars.length < length; i++) {
      const byte = buf[i];
      if (byte < maxUnbiased) {
        chars.push(ALPHABET[byte % alphabetLen]);
      }
      // Discard bytes >= maxUnbiased to avoid modulo bias
    }
  }

  return chars.join('');
}

/**
 * Pick a random integer in [min, max] (inclusive) using crypto randomness.
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomIntInclusive(min, max) {
  const range = max - min + 1;
  // Use a single random byte; range is at most 5 (12 - 8 + 1) so no bias risk
  const buf = randomBytes(1);
  return min + (buf[0] % range);
}

/**
 * Check whether a reference string already exists in the `orders` table.
 *
 * Uses the raw `query` helper (not `queryTenant`) because the uniqueness
 * check must span ALL tenants — a reference must be globally unique across
 * the entire platform.
 *
 * @param {string} reference
 * @returns {Promise<boolean>} `true` if the reference already exists.
 */
async function referenceExists(reference) {
  const result = await query(
    'SELECT 1 FROM orders WHERE reference = $1 LIMIT 1',
    [reference],
  );
  return result.rowCount > 0;
}

/**
 * Generate a unique order reference number.
 *
 * Produces a cryptographically random 8–12 uppercase alphanumeric string and
 * verifies that no existing order in the database uses the same reference.
 * Retries up to MAX_ATTEMPTS times if a collision is detected (astronomically
 * unlikely in practice given the ~2.8 trillion possible values).
 *
 * @param {object} [options]
 * @param {object} [options.db] - Optional query function override for testing.
 *   Must have the same signature as the `query` helper: `(sql, params) => Promise<{rowCount}>`.
 * @returns {Promise<string>} A unique order reference string.
 * @throws {Error} If a unique reference cannot be generated within MAX_ATTEMPTS tries.
 */
export async function generateOrderReference(options = {}) {
  const dbQuery = options.db ?? referenceExists;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const length = randomIntInclusive(MIN_LENGTH, MAX_LENGTH);
    const reference = generateRawReference(length);

    // Use the injected checker or the real DB check
    const exists =
      typeof options.db === 'function'
        ? await options.db(reference)
        : await referenceExists(reference);

    if (!exists) {
      return reference;
    }

    // Collision detected — retry (extremely rare)
    console.warn(
      `[orderRef] Reference collision on attempt ${attempt}: ${reference}`,
    );
  }

  throw new Error(
    `[orderRef] Failed to generate a unique order reference after ${MAX_ATTEMPTS} attempts`,
  );
}
