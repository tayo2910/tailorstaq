'use strict';

/**
 * Password hashing utilities using bcrypt.
 *
 * hashPassword(plain)   — hashes a plaintext password with cost factor 12
 * verifyPassword(plain, hash) — compares a plaintext password against a stored hash
 */

import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * Hash a plaintext password.
 *
 * @param {string} plain  Plaintext password
 * @returns {Promise<string>} bcrypt hash
 */
export async function hashPassword(plain) {
  if (!plain) throw new Error('plain password is required');
  return bcrypt.hash(plain, env.BCRYPT_COST_FACTOR);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 *
 * @param {string} plain  Plaintext password to check
 * @param {string} hash   Stored bcrypt hash
 * @returns {Promise<boolean>} true if the password matches, false otherwise
 */
export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}
