'use strict';

/**
 * JWT utilities — token signing and verification.
 *
 * signToken({ userId, role, tenantId })
 *   Issues a signed JWT with a 24-hour expiry.
 *   Payload: { sub, role, tenantId, iat, exp }
 *
 * verifyToken(token)
 *   Verifies the token signature and expiry.
 *   Throws JsonWebTokenError on invalid signature.
 *   Throws TokenExpiredError on expired token.
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const EXPIRY_SECONDS = 86400; // 24 hours

/**
 * Sign a JWT for the given user identity.
 *
 * @param {{ userId: string, role: string, tenantId: string|null }} payload
 * @returns {string} Signed JWT string
 */
export function signToken({ userId, role, tenantId }) {
  if (!userId) throw new Error('userId is required');
  if (!role) throw new Error('role is required');

  return jwt.sign(
    {
      sub: userId,
      role,
      tenantId: tenantId ?? null,
    },
    env.JWT_SECRET,
    {
      expiresIn: EXPIRY_SECONDS, // sets exp = iat + 86400
    },
  );
}

/**
 * Verify a JWT and return its decoded payload.
 *
 * @param {string} token
 * @returns {{ sub: string, role: string, tenantId: string|null, iat: number, exp: number }}
 * @throws {jwt.TokenExpiredError} when the token has expired
 * @throws {jwt.JsonWebTokenError} when the signature is invalid or token is malformed
 */
export function verifyToken(token) {
  // jwt.verify throws TokenExpiredError or JsonWebTokenError on failure
  return jwt.verify(token, env.JWT_SECRET);
}
