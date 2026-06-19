'use strict';

/**
 * JWT authentication middleware and role-guard helpers.
 *
 * authenticate
 *   Extracts the Bearer token from the Authorization header, verifies it,
 *   and attaches req.user = { userId, role, tenantId } on success.
 *   Returns 401 UNAUTHENTICATED for missing or invalid tokens.
 *   Returns 401 TOKEN_EXPIRED for expired tokens.
 *
 * requireRole(...roles)
 *   Factory that returns a middleware enforcing that req.user.role is one of
 *   the allowed roles. Returns 403 FORBIDDEN otherwise.
 */

import jwt from 'jsonwebtoken';
import { verifyToken } from '../utils/jwt.js';

/**
 * Middleware: verify the Bearer JWT and attach req.user.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] ?? req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication token is missing.',
      },
    });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication token is missing.',
      },
    });
  }

  try {
    const payload = verifyToken(token);

    // Attach a normalised user object — map JWT `sub` → `userId`
    req.user = {
      userId: payload.sub,
      role: payload.role,
      tenantId: payload.tenantId ?? null,
    };

    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired. Please log in again.',
        },
      });
    }

    // JsonWebTokenError, NotBeforeError, or any other JWT failure
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication token is invalid.',
      },
    });
  }
}

/**
 * Middleware factory: require the authenticated user to have one of the
 * specified roles. Must be used after `authenticate`.
 *
 * @param {...string} roles  Allowed role values (e.g. 'platform_admin', 'tenant_admin', 'customer')
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.get('/admin/tenants', authenticate, requireRole('platform_admin'), handler);
 * router.patch('/shops/:id', authenticate, requireRole('tenant_admin', 'platform_admin'), handler);
 */
export function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      // Defensive: authenticate should always run first
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication token is missing.',
        },
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.',
        },
      });
    }

    return next();
  };
}
