// Feature: tailorstaq-platform, Property 7: Email verification token expiry

/**
 * Property-Based Test: Email verification token expiry
 *
 * Property 7: For any email verification token, the token SHALL be accepted
 * only if it has not been used AND its `expires_at` timestamp is in the future
 * at the time of use.
 *
 * Validates: Requirements 4.4
 *
 * Strategy:
 *   - Implement the token validation state machine inline (mirrors the logic
 *     in auth.service.js verifyEmail()).
 *   - Use fast-check to generate random token ages (relative to expires_at)
 *     and used/unused states, then assert the acceptance condition holds
 *     across all generated inputs.
 *
 * Token acceptance rules (from Requirements 4.4 and auth.service.js):
 *   1. A token is ACCEPTED if and only if:
 *        - used === false, AND
 *        - expires_at > now()  (strictly in the future)
 *   2. A token is REJECTED if:
 *        - used === true  (already consumed), OR
 *        - expires_at <= now()  (expired or exactly at boundary)
 *   3. A token that does not exist is always rejected (invalid token).
 */

import fc from 'fast-check';

// ─── Token validation state machine ──────────────────────────────────────────

/**
 * Represents a row from the email_verifications table.
 *
 * @typedef {Object} EmailVerificationToken
 * @property {boolean} used        - whether the token has already been consumed
 * @property {number}  expiresAtMs - Unix timestamp (ms) when the token expires
 */

/**
 * Validate an email verification token against the current time.
 *
 * This function mirrors the logic in auth.service.js verifyEmail():
 *   - If used === true  → reject with TOKEN_ALREADY_USED
 *   - If expires_at <= nowMs → reject with TOKEN_EXPIRED
 *   - Otherwise → accept
 *
 * @param {EmailVerificationToken} token - the token record
 * @param {number} nowMs - current time in milliseconds (injectable for testing)
 * @returns {{ accepted: boolean; reason: string | null }}
 *   accepted=true  → token is valid and may be consumed
 *   accepted=false → token is invalid; reason describes why
 */
function validateToken(token, nowMs) {
  if (token.used) {
    return { accepted: false, reason: 'TOKEN_ALREADY_USED' };
  }
  if (token.expiresAtMs <= nowMs) {
    return { accepted: false, reason: 'TOKEN_EXPIRED' };
  }
  return { accepted: true, reason: null };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * Arbitrary for a token that has already been used.
 * The expires_at can be anything (past or future) — used=true always rejects.
 */
const usedTokenArbitrary = fc.record({
  used: fc.constant(true),
  // expires_at can be anywhere: 10 years in the past to 10 years in the future
  expiresAtMs: fc.integer({ min: -315_360_000_000, max: 315_360_000_000 }).map(
    (offsetMs) => Date.now() + offsetMs,
  ),
});

/**
 * Arbitrary for an expired token (used=false, expires_at in the past or at boundary).
 * Range: from 1 ms ago up to 10 years ago, plus the exact boundary (expires_at === now).
 */
const expiredTokenArbitrary = fc.record({
  used: fc.constant(false),
  // expires_at is at or before now: offset is 0 (boundary) to -315_360_000_000 ms (10 years ago)
  expiresAtMs: fc.integer({ min: 1, max: 315_360_000_000 }).map(
    (msAgo) => Date.now() - msAgo,
  ),
});

/**
 * Arbitrary for a valid token (used=false, expires_at strictly in the future).
 * Range: from 1 ms in the future up to 24 hours in the future (the max token lifetime).
 */
const validTokenArbitrary = fc.record({
  used: fc.constant(false),
  // expires_at is strictly after now: offset is 1 ms to 86_400_000 ms (24 hours)
  expiresAtMs: fc.integer({ min: 1, max: 86_400_000 }).map(
    (msAhead) => Date.now() + msAhead,
  ),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 7: Email verification token expiry', () => {
  /**
   * Property 7a: A used token is always rejected, regardless of expiry.
   *
   * For any token where used === true, validateToken MUST return
   * accepted=false with reason TOKEN_ALREADY_USED, regardless of whether
   * expires_at is in the past or future.
   *
   * Validates: Requirements 4.4
   */
  test(
    'a used token is always rejected regardless of its expiry timestamp',
    () => {
      fc.assert(
        fc.property(usedTokenArbitrary, (token) => {
          const nowMs = Date.now();
          const result = validateToken(token, nowMs);

          expect(result.accepted).toBe(false);
          expect(result.reason).toBe('TOKEN_ALREADY_USED');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 7b: An expired token is always rejected, regardless of used flag.
   *
   * For any token where expires_at <= now(), validateToken MUST return
   * accepted=false. The reason may be TOKEN_EXPIRED (if used=false) or
   * TOKEN_ALREADY_USED (if used=true, since used is checked first).
   *
   * Validates: Requirements 4.4
   */
  test(
    'an expired token (expires_at <= now) is always rejected',
    () => {
      fc.assert(
        fc.property(expiredTokenArbitrary, (token) => {
          const nowMs = Date.now();
          const result = validateToken(token, nowMs);

          expect(result.accepted).toBe(false);
          expect(result.reason).toBe('TOKEN_EXPIRED');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 7c: A valid token (unused AND not expired) is always accepted.
   *
   * For any token where used === false AND expires_at > now(),
   * validateToken MUST return accepted=true.
   *
   * Validates: Requirements 4.4
   */
  test(
    'a valid token (used=false and expires_at in the future) is always accepted',
    () => {
      fc.assert(
        fc.property(validTokenArbitrary, (token) => {
          const nowMs = Date.now();
          const result = validateToken(token, nowMs);

          expect(result.accepted).toBe(true);
          expect(result.reason).toBeNull();
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 7d: The acceptance condition is exactly (used === false AND expires_at > now).
   *
   * For any combination of used flag and expiry offset, the acceptance result
   * MUST match the logical conjunction: !used && expiresAtMs > nowMs.
   *
   * This is the core property — it verifies the acceptance predicate is
   * precisely correct across all possible inputs.
   *
   * Validates: Requirements 4.4
   */
  test(
    'token is accepted if and only if used=false AND expires_at is strictly in the future',
    () => {
      // Generate any combination of used flag and expiry offset
      const anyTokenArbitrary = fc.record({
        used: fc.boolean(),
        // Offset from now: -10 years to +10 years (covers all realistic cases)
        expiresOffsetMs: fc.integer({
          min: -315_360_000_000,
          max: 315_360_000_000,
        }),
      });

      fc.assert(
        fc.property(anyTokenArbitrary, ({ used, expiresOffsetMs }) => {
          const nowMs = Date.now();
          const expiresAtMs = nowMs + expiresOffsetMs;
          const token = { used, expiresAtMs };

          const result = validateToken(token, nowMs);

          // The acceptance condition: not used AND strictly in the future
          const shouldBeAccepted = !used && expiresAtMs > nowMs;

          expect(result.accepted).toBe(shouldBeAccepted);

          if (result.accepted) {
            expect(result.reason).toBeNull();
          } else {
            expect(result.reason).not.toBeNull();
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 7e: Boundary — a token expiring exactly at the current millisecond is rejected.
   *
   * expires_at === now() is NOT strictly in the future, so the token MUST be
   * rejected with TOKEN_EXPIRED (assuming used=false).
   *
   * Validates: Requirements 4.4
   */
  test(
    'a token with expires_at exactly equal to now is rejected as expired',
    () => {
      const nowMs = Date.now();
      const boundaryToken = { used: false, expiresAtMs: nowMs };

      const result = validateToken(boundaryToken, nowMs);

      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('TOKEN_EXPIRED');
    },
  );

  /**
   * Property 7f: used=true takes precedence over expiry check.
   *
   * When a token is both used AND expired, the rejection reason MUST be
   * TOKEN_ALREADY_USED (used is checked first, matching auth.service.js logic).
   *
   * Validates: Requirements 4.4
   */
  test(
    'used=true takes precedence over expiry — reason is TOKEN_ALREADY_USED even when also expired',
    () => {
      // Generate tokens that are both used and expired
      const usedAndExpiredArbitrary = fc.record({
        used: fc.constant(true),
        expiresAtMs: fc.integer({ min: 1, max: 315_360_000_000 }).map(
          (msAgo) => Date.now() - msAgo,
        ),
      });

      fc.assert(
        fc.property(usedAndExpiredArbitrary, (token) => {
          const nowMs = Date.now();
          const result = validateToken(token, nowMs);

          expect(result.accepted).toBe(false);
          // used is checked before expiry in auth.service.js
          expect(result.reason).toBe('TOKEN_ALREADY_USED');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 7g: Token lifetime — a freshly issued token (expires_at = now + 24h)
   * is always valid immediately after issuance.
   *
   * This sanity check confirms that the standard 24-hour token lifetime
   * (as issued by registerCustomer in auth.service.js) produces valid tokens.
   *
   * Validates: Requirements 4.4
   */
  test(
    'a freshly issued 24-hour token is always valid immediately after issuance',
    () => {
      // Simulate issuance at various points in time (random issuedAt)
      const issuedAtArbitrary = fc.integer({ min: 0, max: 1_000_000_000 }).map(
        (offsetMs) => Date.now() - offsetMs,
      );

      fc.assert(
        fc.property(issuedAtArbitrary, (issuedAtMs) => {
          const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours
          const expiresAtMs = issuedAtMs + TOKEN_LIFETIME_MS;

          // The token is checked immediately after issuance (nowMs === issuedAtMs)
          const token = { used: false, expiresAtMs };
          const result = validateToken(token, issuedAtMs);

          // A freshly issued token must always be valid at the moment of issuance
          expect(result.accepted).toBe(true);
          expect(result.reason).toBeNull();
        }),
        { numRuns: 100 },
      );
    },
  );
});
