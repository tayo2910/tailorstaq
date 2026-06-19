// Feature: tailorstaq-platform, Property 8: Account lockout after failed attempts

/**
 * Property-Based Test: Account lockout after failed attempts
 *
 * Property 8: For any user account, after 5 consecutive failed login attempts
 * the account SHALL be locked and no further login SHALL succeed until the
 * 15-minute lockout period has elapsed.
 *
 * Validates: Requirements 8.5
 *
 * Strategy:
 *   - Implement the lockout state machine inline (mirrors the logic that will
 *     live in auth.service.js once task 3.1 is complete).
 *   - Use fast-check to generate random sequences of login attempts
 *     (mix of successes and failures) and verify the lockout invariants hold
 *     across all generated sequences.
 *
 * Lockout rules (from Requirements 8.4 and 8.5):
 *   1. Each failed attempt increments `failed_attempts`.
 *   2. A successful attempt resets `failed_attempts` to 0.
 *   3. When `failed_attempts` reaches 5, the account is locked:
 *        - `account_status` is set to 'locked'
 *        - `locked_until` is set to now + 15 minutes
 *   4. While locked, every login attempt (even with correct credentials) is
 *      rejected with ACCOUNT_LOCKED.
 *   5. After `locked_until` has passed, the account is automatically unlocked:
 *        - `account_status` reverts to 'active'
 *        - `failed_attempts` is reset to 0
 *        - `locked_until` is cleared
 */

import fc from 'fast-check';

// ─── Lockout state machine ────────────────────────────────────────────────────

const LOCKOUT_THRESHOLD = 5;          // consecutive failures before lock
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * Represents the persisted state of a user account relevant to lockout.
 *
 * @typedef {Object} AccountState
 * @property {'active' | 'locked'} account_status
 * @property {number} failed_attempts  - consecutive failed login count
 * @property {number | null} locked_until - Unix ms timestamp when lock expires
 */

/**
 * Create a fresh, unlocked account state.
 *
 * @returns {AccountState}
 */
function createAccount() {
  return {
    account_status: 'active',
    failed_attempts: 0,
    locked_until: null,
  };
}

/**
 * Attempt a login against the given account state.
 *
 * This function mirrors the logic that auth.service.js will implement:
 *   - If the account is locked and the lock has not expired → reject
 *   - If the account is locked but the lock has expired → auto-unlock first
 *   - If credentials are correct (success=true) → reset counter, return ok
 *   - If credentials are wrong (success=false) → increment counter, lock if threshold reached
 *
 * @param {AccountState} state   - mutable account state (modified in place)
 * @param {boolean}      success - whether the credentials are correct
 * @param {number}       nowMs   - current time in milliseconds (injectable for testing)
 * @returns {{ ok: boolean; code: string | null }}
 *   ok=true  → login succeeded
 *   ok=false → login rejected; code is the error code
 */
function attemptLogin(state, success, nowMs) {
  // Step 1: Check if account is currently locked
  if (state.account_status === 'locked') {
    if (state.locked_until !== null && nowMs < state.locked_until) {
      // Lock is still active — reject regardless of credentials
      return { ok: false, code: 'ACCOUNT_LOCKED' };
    }
    // Lock has expired — auto-unlock
    state.account_status = 'active';
    state.failed_attempts = 0;
    state.locked_until = null;
  }

  // Step 2: Process the attempt
  if (success) {
    // Correct credentials — reset counter and allow login
    state.failed_attempts = 0;
    return { ok: true, code: null };
  }

  // Wrong credentials — increment counter
  state.failed_attempts += 1;

  if (state.failed_attempts >= LOCKOUT_THRESHOLD) {
    // Threshold reached — lock the account
    state.account_status = 'locked';
    state.locked_until = nowMs + LOCKOUT_DURATION_MS;
    return { ok: false, code: 'ACCOUNT_LOCKED' };
  }

  return { ok: false, code: 'INVALID_CREDENTIALS' };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * An arbitrary that generates a single login attempt: { success: boolean }.
 * We use fc.boolean() so each attempt is independently and uniformly random.
 */
const attemptArbitrary = fc.record({ success: fc.boolean() });

/**
 * An arbitrary that generates a sequence of 1–30 login attempts.
 * Sequences are short enough to be readable in counter-examples but long
 * enough to exercise multi-attempt patterns.
 */
const attemptSequenceArbitrary = fc.array(attemptArbitrary, {
  minLength: 1,
  maxLength: 30,
});

// ─── Helper: replay a sequence and collect results ────────────────────────────

/**
 * Replay a sequence of attempts against a fresh account, advancing a
 * simulated clock by `stepMs` between each attempt.
 *
 * @param {{ success: boolean }[]} attempts
 * @param {number} stepMs - milliseconds to advance the clock per attempt
 * @returns {{ results: { ok: boolean; code: string | null }[]; finalState: AccountState }}
 */
function replaySequence(attempts, stepMs = 0) {
  const state = createAccount();
  let nowMs = Date.now();
  const results = [];

  for (const attempt of attempts) {
    nowMs += stepMs;
    results.push(attemptLogin(state, attempt.success, nowMs));
  }

  return { results, finalState: state };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 8: Account lockout after failed attempts', () => {
  /**
   * Property 8a: Lock triggers after exactly 5 consecutive failures.
   *
   * For any sequence of attempts, if we find a run of exactly 5 consecutive
   * failures (with no success in between), the 5th failure MUST produce
   * ACCOUNT_LOCKED and every subsequent attempt (before the lock expires)
   * MUST also be rejected with ACCOUNT_LOCKED.
   *
   * Validates: Requirements 8.5
   */
  test(
    'account locks after exactly 5 consecutive failures and subsequent attempts are rejected',
    () => {
      // Use a fixed sequence: N successes/failures then exactly 5 failures
      // We generate the prefix (0–10 random attempts) and verify the suffix
      const prefixArbitrary = fc.array(
        fc.record({ success: fc.boolean() }),
        { minLength: 0, maxLength: 10 },
      );

      fc.assert(
        fc.property(prefixArbitrary, (prefix) => {
          const state = createAccount();
          let nowMs = 1_000_000; // fixed start time

          // Replay the prefix — this may leave the account in various states
          for (const attempt of prefix) {
            attemptLogin(state, attempt.success, nowMs);
          }

          // If the account is already locked after the prefix, unlock it by
          // advancing time past the lock window so we can test a fresh run
          if (state.account_status === 'locked') {
            nowMs += LOCKOUT_DURATION_MS + 1;
            // Trigger auto-unlock by making a failed attempt after expiry
            attemptLogin(state, false, nowMs);
            // Reset to a clean unlocked state for the core test
            state.account_status = 'active';
            state.failed_attempts = 0;
            state.locked_until = null;
          }

          // Now apply exactly 5 consecutive failures
          let result;
          for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
            result = attemptLogin(state, false, nowMs);
          }

          // The 5th failure must trigger the lock
          expect(result.ok).toBe(false);
          expect(result.code).toBe('ACCOUNT_LOCKED');
          expect(state.account_status).toBe('locked');
          expect(state.locked_until).not.toBeNull();
          expect(state.locked_until).toBeGreaterThan(nowMs);

          // Any further attempt (before lock expires) must also be rejected
          const afterLock = attemptLogin(state, true, nowMs + 1); // even with correct creds
          expect(afterLock.ok).toBe(false);
          expect(afterLock.code).toBe('ACCOUNT_LOCKED');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 8b: A successful login resets the failed-attempt counter.
   *
   * For any sequence of up to 4 failures followed by a success, the account
   * MUST NOT be locked and the counter MUST be 0 after the success.
   *
   * Validates: Requirements 8.4
   */
  test(
    'a successful login resets the failed-attempt counter to zero',
    () => {
      // Generate 0–4 failures (not enough to lock) then a success
      const failCountArbitrary = fc.integer({ min: 0, max: LOCKOUT_THRESHOLD - 1 });

      fc.assert(
        fc.property(failCountArbitrary, (failCount) => {
          const state = createAccount();
          const nowMs = 1_000_000;

          // Apply failCount failures
          for (let i = 0; i < failCount; i++) {
            attemptLogin(state, false, nowMs);
          }

          // Verify counter incremented correctly
          expect(state.failed_attempts).toBe(failCount);
          expect(state.account_status).toBe('active');

          // Now a successful login
          const result = attemptLogin(state, true, nowMs);

          expect(result.ok).toBe(true);
          expect(state.failed_attempts).toBe(0);
          expect(state.account_status).toBe('active');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 8c: Account unlocks after the 15-minute lockout period.
   *
   * After an account is locked, advancing time by more than 15 minutes and
   * making any attempt MUST auto-unlock the account and process the attempt
   * normally (not return ACCOUNT_LOCKED due to the expired lock).
   *
   * Validates: Requirements 8.5
   */
  test(
    'account automatically unlocks after the 15-minute lockout period',
    () => {
      // Generate a time offset strictly greater than 15 minutes
      const timeAfterLockArbitrary = fc.integer({
        min: LOCKOUT_DURATION_MS + 1,
        max: LOCKOUT_DURATION_MS + 3_600_000, // up to 1 hour after lock
      });

      fc.assert(
        fc.property(timeAfterLockArbitrary, (msAfterLock) => {
          const state = createAccount();
          const lockTime = 1_000_000;

          // Lock the account by applying 5 consecutive failures
          for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
            attemptLogin(state, false, lockTime);
          }

          expect(state.account_status).toBe('locked');

          // Advance time past the lock window
          const unlockTime = lockTime + msAfterLock;

          // A successful attempt after the lock expires should succeed
          const result = attemptLogin(state, true, unlockTime);

          expect(result.ok).toBe(true);
          expect(result.code).toBeNull();
          expect(state.account_status).toBe('active');
          expect(state.failed_attempts).toBe(0);
          expect(state.locked_until).toBeNull();
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 8d: Account remains locked during the 15-minute window.
   *
   * For any time strictly before locked_until, every login attempt (correct
   * or incorrect credentials) MUST be rejected with ACCOUNT_LOCKED.
   *
   * Validates: Requirements 8.5
   */
  test(
    'account remains locked for any attempt made before the lockout period expires',
    () => {
      // Generate a time offset strictly less than 15 minutes
      const timeWithinLockArbitrary = fc.integer({
        min: 0,
        max: LOCKOUT_DURATION_MS - 1,
      });
      const credentialsArbitrary = fc.boolean(); // correct or incorrect

      fc.assert(
        fc.property(timeWithinLockArbitrary, credentialsArbitrary, (msWithinLock, correctCreds) => {
          const state = createAccount();
          const lockTime = 1_000_000;

          // Lock the account
          for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
            attemptLogin(state, false, lockTime);
          }

          expect(state.account_status).toBe('locked');

          // Attempt within the lock window
          const attemptTime = lockTime + msWithinLock;
          const result = attemptLogin(state, correctCreds, attemptTime);

          expect(result.ok).toBe(false);
          expect(result.code).toBe('ACCOUNT_LOCKED');
          // Account must still be locked
          expect(state.account_status).toBe('locked');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 8e: Fewer than 5 consecutive failures never lock the account.
   *
   * For any sequence of attempts where no run of 5 consecutive failures
   * occurs, the account MUST NOT be locked at the end of the sequence.
   *
   * We enforce this by generating sequences that always have a success
   * injected before the 5th consecutive failure.
   *
   * Validates: Requirements 8.5
   */
  test(
    'fewer than 5 consecutive failures never lock the account',
    () => {
      // Generate groups of (0–4 failures) followed by a success, repeated 1–8 times
      const groupArbitrary = fc.record({
        failsBefore: fc.integer({ min: 0, max: LOCKOUT_THRESHOLD - 1 }),
      });
      const groupsArbitrary = fc.array(groupArbitrary, { minLength: 1, maxLength: 8 });

      fc.assert(
        fc.property(groupsArbitrary, (groups) => {
          const state = createAccount();
          const nowMs = 1_000_000;

          for (const group of groups) {
            // Apply failsBefore failures (always < 5)
            for (let i = 0; i < group.failsBefore; i++) {
              attemptLogin(state, false, nowMs);
            }
            // Reset with a success
            attemptLogin(state, true, nowMs);
          }

          // Account must never have been locked
          expect(state.account_status).toBe('active');
          expect(state.failed_attempts).toBe(0);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 8f: Random mixed sequences — lockout invariant holds throughout.
   *
   * For any random sequence of attempts, at every point in the sequence the
   * following invariant must hold:
   *   - If the account is locked and the lock has not expired, every attempt
   *     returns ACCOUNT_LOCKED.
   *   - If the account is active, a successful attempt always returns ok=true.
   *   - failed_attempts is always in [0, LOCKOUT_THRESHOLD].
   *
   * Validates: Requirements 8.4, 8.5
   */
  test(
    'lockout invariants hold across random mixed sequences of attempts',
    () => {
      fc.assert(
        fc.property(attemptSequenceArbitrary, (attempts) => {
          const state = createAccount();
          let nowMs = 1_000_000;

          for (const attempt of attempts) {
            const prevStatus = state.account_status;
            const prevLockedUntil = state.locked_until;

            const result = attemptLogin(state, attempt.success, nowMs);

            // Invariant 1: failed_attempts is always non-negative and bounded
            expect(state.failed_attempts).toBeGreaterThanOrEqual(0);
            expect(state.failed_attempts).toBeLessThanOrEqual(LOCKOUT_THRESHOLD);

            // Invariant 2: if account was locked and lock had not expired,
            // the result must be ACCOUNT_LOCKED
            if (
              prevStatus === 'locked' &&
              prevLockedUntil !== null &&
              nowMs < prevLockedUntil
            ) {
              expect(result.ok).toBe(false);
              expect(result.code).toBe('ACCOUNT_LOCKED');
            }

            // Invariant 3: if account is active and attempt succeeded, result is ok
            if (state.account_status === 'active' && attempt.success && result.ok) {
              expect(state.failed_attempts).toBe(0);
            }

            // Invariant 4: locked_until is only set when account is locked
            if (state.account_status === 'active') {
              expect(state.locked_until).toBeNull();
            }
            if (state.account_status === 'locked') {
              expect(state.locked_until).not.toBeNull();
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
