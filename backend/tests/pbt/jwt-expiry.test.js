// Feature: tailorstaq-platform, Property 9: JWT expiry enforcement

/**
 * Property-Based Test: JWT expiry enforcement
 *
 * Property 9: For any JWT issued by the platform, a request bearing that token
 * after its `exp` timestamp SHALL be rejected with an authentication error.
 *
 * Validates: Requirements 8.3
 *
 * Strategy:
 *   - Use fast-check to generate random past timestamps for `exp`
 *   - Sign tokens with those past `exp` values using jsonwebtoken directly
 *   - Assert that verifyToken always throws jwt.TokenExpiredError for every
 *     token whose exp < Date.now() / 1000
 */

import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { verifyToken } from '../../src/utils/jwt.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_to_a_long_random_secret';

/**
 * Build a JWT with an explicit `exp` set to a past Unix timestamp.
 * We use jwt.sign with { expiresIn: 0 } and then manually override the exp
 * claim by signing the payload directly with the numeric exp value.
 *
 * @param {number} expTimestamp - Unix timestamp (seconds) in the past
 * @returns {string} Signed JWT string
 */
function buildExpiredToken(expTimestamp) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'test-user-id',
    role: 'customer',
    tenantId: null,
    iat: now,
    exp: expTimestamp,
  };
  // Sign without expiresIn so our explicit exp claim is used as-is
  return jwt.sign(payload, JWT_SECRET);
}

describe('Property 9: JWT expiry enforcement', () => {
  /**
   * Property: For any token whose exp is strictly in the past
   * (exp < current Unix time), verifyToken MUST throw TokenExpiredError.
   *
   * Validates: Requirements 8.3
   */
  test('verifyToken always throws TokenExpiredError for any token with exp in the past', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Arbitrary: generate a past exp timestamp
    // Range: from 1 second ago up to 10 years ago (315,360,000 seconds)
    const pastExpArbitrary = fc.integer({ min: 1, max: 315_360_000 }).map(
      (secondsAgo) => nowSeconds - secondsAgo,
    );

    fc.assert(
      fc.property(pastExpArbitrary, (pastExp) => {
        const expiredToken = buildExpiredToken(pastExp);

        let threw = false;
        let thrownError = null;

        try {
          verifyToken(expiredToken);
        } catch (err) {
          threw = true;
          thrownError = err;
        }

        // Must throw
        expect(threw).toBe(true);

        // Must specifically be a TokenExpiredError (not a generic JsonWebTokenError)
        expect(thrownError).toBeInstanceOf(jwt.TokenExpiredError);

        // The error's expiredAt field should reflect the token's exp
        expect(thrownError.expiredAt).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Additional property: A token with exp exactly equal to the current second
   * is also expired (exp must be strictly in the future to be valid).
   *
   * Validates: Requirements 8.3
   */
  test('verifyToken throws TokenExpiredError for a token with exp equal to current time', () => {
    // exp set to exactly now — jsonwebtoken treats this as expired
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tokenAtBoundary = buildExpiredToken(nowSeconds);

    expect(() => verifyToken(tokenAtBoundary)).toThrow(jwt.TokenExpiredError);
  });

  /**
   * Sanity check: A token with exp well in the future is accepted.
   * This confirms the test infrastructure is working correctly and that
   * verifyToken does not reject all tokens indiscriminately.
   *
   * Validates: Requirements 8.3 (positive case)
   */
  test('verifyToken accepts a token with exp in the future', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const futureExp = nowSeconds + 86400; // 24 hours from now

    const validPayload = {
      sub: 'test-user-id',
      role: 'customer',
      tenantId: null,
      iat: nowSeconds,
      exp: futureExp,
    };
    const validToken = jwt.sign(validPayload, JWT_SECRET);

    expect(() => verifyToken(validToken)).not.toThrow();
    const decoded = verifyToken(validToken);
    expect(decoded.sub).toBe('test-user-id');
  });
});
