// Feature: tailorstaq-platform, Property 4: Order status lifecycle validity

/**
 * Property-Based Test: Order status lifecycle validity
 *
 * Property 4: For any Order, every recorded status transition SHALL follow the
 * defined lifecycle: `received → in-progress → ready-for-pickup → completed`,
 * with `cancelled` reachable from any non-terminal status, and no transition
 * out of `completed` or `cancelled`.
 *
 * Validates: Requirements 5.3, 5.7, 5.8
 *
 * Strategy:
 *   - Import `isValidStatusTransition`, `TERMINAL_STATUSES`, and
 *     `VALID_TRANSITIONS` directly from orders.service.js so the test
 *     exercises the real lifecycle logic without requiring a database
 *     connection.
 *   - Use fast-check to generate random valid and invalid transition sequences
 *     and assert:
 *       a) Only valid transitions are accepted.
 *       b) Terminal states (completed, cancelled) block all further updates.
 *       c) The full forward path (received → in-progress → ready-for-pickup →
 *          completed) is always accepted.
 *       d) Cancellation from any non-terminal state is always accepted.
 *       e) Skipping steps in the forward path is always rejected.
 *       f) Backward transitions are always rejected.
 *
 * Order status lifecycle (from Requirements 5.3, 5.7, 5.8 and orders.service.js):
 *   Forward path:  received → in-progress → ready-for-pickup → completed
 *   Cancel path:   received → cancelled
 *                  in-progress → cancelled
 *                  ready-for-pickup → cancelled
 *   Terminal states: completed, cancelled  (no further transitions allowed)
 */

import fc from 'fast-check';
import {
  isValidStatusTransition,
  TERMINAL_STATUSES,
  VALID_TRANSITIONS,
} from '../../src/modules/orders/orders.service.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** All recognised order statuses. */
const ALL_STATUSES = ['received', 'in-progress', 'ready-for-pickup', 'completed', 'cancelled'];

/** Non-terminal statuses from which transitions are allowed. */
const NON_TERMINAL_STATUSES = ALL_STATUSES.filter((s) => !TERMINAL_STATUSES.has(s));

/** The canonical forward path through the lifecycle. */
const FORWARD_PATH = ['received', 'in-progress', 'ready-for-pickup', 'completed'];

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for any recognised order status. */
const anyStatusArbitrary = fc.constantFrom(...ALL_STATUSES);

/** Arbitrary for any terminal status. */
const terminalStatusArbitrary = fc.constantFrom(...[...TERMINAL_STATUSES]);

/** Arbitrary for any non-terminal status. */
const nonTerminalStatusArbitrary = fc.constantFrom(...NON_TERMINAL_STATUSES);

/**
 * Arbitrary for a valid (currentStatus, newStatus) transition pair.
 * Picks a non-terminal current status, then picks one of its allowed next statuses.
 */
const validTransitionArbitrary = fc
  .constantFrom(...NON_TERMINAL_STATUSES)
  .chain((currentStatus) => {
    const allowed = [...VALID_TRANSITIONS[currentStatus]];
    return fc.constantFrom(...allowed).map((newStatus) => ({ currentStatus, newStatus }));
  });

/**
 * Arbitrary for an invalid (currentStatus, newStatus) transition pair where
 * the current status is non-terminal but the new status is NOT in the allowed set.
 */
const invalidTransitionArbitrary = fc
  .constantFrom(...NON_TERMINAL_STATUSES)
  .chain((currentStatus) => {
    const allowed = VALID_TRANSITIONS[currentStatus];
    const disallowed = ALL_STATUSES.filter((s) => !allowed.has(s));
    return fc.constantFrom(...disallowed).map((newStatus) => ({ currentStatus, newStatus }));
  });

/**
 * Arbitrary for a sequence of valid transitions starting from 'received'.
 * Generates a path length between 1 and the full forward path length (4 steps).
 * Each step follows the canonical forward path.
 */
const validForwardSequenceArbitrary = fc
  .integer({ min: 1, max: FORWARD_PATH.length - 1 })
  .map((steps) => FORWARD_PATH.slice(0, steps + 1));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 4: Order status lifecycle validity', () => {
  // ── Valid transitions ──────────────────────────────────────────────────────

  /**
   * Property 4a: Every valid transition is accepted.
   *
   * For any (currentStatus, newStatus) pair where newStatus is in
   * VALID_TRANSITIONS[currentStatus], isValidStatusTransition MUST return
   * { valid: true, terminalError: false }.
   *
   * Validates: Requirements 5.3, 5.7
   */
  test(
    'every valid transition is accepted with valid=true and terminalError=false',
    () => {
      fc.assert(
        fc.property(validTransitionArbitrary, ({ currentStatus, newStatus }) => {
          const result = isValidStatusTransition(currentStatus, newStatus);

          expect(result.valid).toBe(true);
          expect(result.terminalError).toBe(false);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 4b: Every invalid transition from a non-terminal state is rejected.
   *
   * For any (currentStatus, newStatus) pair where currentStatus is non-terminal
   * but newStatus is NOT in VALID_TRANSITIONS[currentStatus],
   * isValidStatusTransition MUST return { valid: false, terminalError: false }.
   *
   * Validates: Requirements 5.3, 5.7
   */
  test(
    'every invalid transition from a non-terminal state is rejected with valid=false and terminalError=false',
    () => {
      fc.assert(
        fc.property(invalidTransitionArbitrary, ({ currentStatus, newStatus }) => {
          const result = isValidStatusTransition(currentStatus, newStatus);

          expect(result.valid).toBe(false);
          expect(result.terminalError).toBe(false);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Terminal state blocking ────────────────────────────────────────────────

  /**
   * Property 4c: Any transition from a terminal state is always rejected with terminalError=true.
   *
   * For any terminal currentStatus (completed or cancelled) and any newStatus
   * (including itself), isValidStatusTransition MUST return
   * { valid: false, terminalError: true }.
   *
   * This directly validates Requirements 5.7 and 5.8: once an order reaches
   * a terminal state, no further status updates are permitted.
   *
   * Validates: Requirements 5.7, 5.8
   */
  test(
    'any transition from a terminal state is always rejected with terminalError=true',
    () => {
      fc.assert(
        fc.property(terminalStatusArbitrary, anyStatusArbitrary, (currentStatus, newStatus) => {
          const result = isValidStatusTransition(currentStatus, newStatus);

          expect(result.valid).toBe(false);
          expect(result.terminalError).toBe(true);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 4d: completed is always a terminal state.
   *
   * For any newStatus, attempting to transition from 'completed' MUST always
   * return { valid: false, terminalError: true }.
   *
   * Validates: Requirements 5.8
   */
  test(
    'completed is always a terminal state — no transition out of completed is ever accepted',
    () => {
      fc.assert(
        fc.property(anyStatusArbitrary, (newStatus) => {
          const result = isValidStatusTransition('completed', newStatus);

          expect(result.valid).toBe(false);
          expect(result.terminalError).toBe(true);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 4e: cancelled is always a terminal state.
   *
   * For any newStatus, attempting to transition from 'cancelled' MUST always
   * return { valid: false, terminalError: true }.
   *
   * Validates: Requirements 5.8
   */
  test(
    'cancelled is always a terminal state — no transition out of cancelled is ever accepted',
    () => {
      fc.assert(
        fc.property(anyStatusArbitrary, (newStatus) => {
          const result = isValidStatusTransition('cancelled', newStatus);

          expect(result.valid).toBe(false);
          expect(result.terminalError).toBe(true);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Cancellation from non-terminal states ─────────────────────────────────

  /**
   * Property 4f: Cancellation from any non-terminal state is always accepted.
   *
   * For any non-terminal currentStatus (received, in-progress, ready-for-pickup),
   * transitioning to 'cancelled' MUST always be accepted.
   *
   * Validates: Requirements 5.3, 5.7
   */
  test(
    'cancellation from any non-terminal state is always accepted',
    () => {
      fc.assert(
        fc.property(nonTerminalStatusArbitrary, (currentStatus) => {
          const result = isValidStatusTransition(currentStatus, 'cancelled');

          expect(result.valid).toBe(true);
          expect(result.terminalError).toBe(false);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Forward path ──────────────────────────────────────────────────────────

  /**
   * Property 4g: The full forward path is always valid step by step.
   *
   * For any prefix of the canonical forward path
   * (received → in-progress → ready-for-pickup → completed),
   * every consecutive pair of statuses MUST be a valid transition.
   *
   * Validates: Requirements 5.3
   */
  test(
    'every consecutive step in the forward path is always a valid transition',
    () => {
      fc.assert(
        fc.property(validForwardSequenceArbitrary, (path) => {
          for (let i = 0; i < path.length - 1; i++) {
            const currentStatus = path[i];
            const newStatus = path[i + 1];
            const result = isValidStatusTransition(currentStatus, newStatus);

            expect(result.valid).toBe(true);
            expect(result.terminalError).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 4h: Skipping steps in the forward path is always rejected.
   *
   * For any pair of statuses (A, B) where B appears two or more positions
   * ahead of A in the forward path, the transition A → B MUST be rejected.
   *
   * Examples of skipped transitions:
   *   received → ready-for-pickup  (skips in-progress)
   *   received → completed         (skips two steps)
   *   in-progress → completed      (skips ready-for-pickup)
   *
   * Validates: Requirements 5.3
   */
  test(
    'skipping steps in the forward path is always rejected',
    () => {
      // Build all (from, to) pairs where `to` is 2+ positions ahead of `from`
      const skippedPairs = [];
      for (let i = 0; i < FORWARD_PATH.length; i++) {
        for (let j = i + 2; j < FORWARD_PATH.length; j++) {
          skippedPairs.push({ currentStatus: FORWARD_PATH[i], newStatus: FORWARD_PATH[j] });
        }
      }

      fc.assert(
        fc.property(fc.constantFrom(...skippedPairs), ({ currentStatus, newStatus }) => {
          const result = isValidStatusTransition(currentStatus, newStatus);

          expect(result.valid).toBe(false);
          expect(result.terminalError).toBe(false);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 4i: Backward transitions are always rejected.
   *
   * For any pair of statuses (A, B) where B appears earlier than A in the
   * forward path, the transition A → B MUST be rejected.
   *
   * Examples of backward transitions:
   *   in-progress → received
   *   ready-for-pickup → in-progress
   *   ready-for-pickup → received
   *   completed → ready-for-pickup  (also terminal, so terminalError=true)
   *
   * Validates: Requirements 5.3
   */
  test(
    'backward transitions in the forward path are always rejected',
    () => {
      // Build all (from, to) pairs where `to` is strictly earlier than `from`
      const backwardPairs = [];
      for (let i = 1; i < FORWARD_PATH.length; i++) {
        for (let j = 0; j < i; j++) {
          backwardPairs.push({ currentStatus: FORWARD_PATH[i], newStatus: FORWARD_PATH[j] });
        }
      }

      fc.assert(
        fc.property(fc.constantFrom(...backwardPairs), ({ currentStatus, newStatus }) => {
          const result = isValidStatusTransition(currentStatus, newStatus);

          expect(result.valid).toBe(false);
          // terminalError is true only when currentStatus is terminal
          if (TERMINAL_STATUSES.has(currentStatus)) {
            expect(result.terminalError).toBe(true);
          } else {
            expect(result.terminalError).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Transition to same status ──────────────────────────────────────────────

  /**
   * Property 4j: Transitioning to the same status is always rejected.
   *
   * For any status S, the transition S → S MUST be rejected.
   * - If S is terminal: { valid: false, terminalError: true }
   * - If S is non-terminal: { valid: false, terminalError: false }
   *   (since no status lists itself as a valid next state)
   *
   * Validates: Requirements 5.3
   */
  test(
    'transitioning to the same status is always rejected',
    () => {
      fc.assert(
        fc.property(anyStatusArbitrary, (status) => {
          const result = isValidStatusTransition(status, status);

          expect(result.valid).toBe(false);

          if (TERMINAL_STATUSES.has(status)) {
            expect(result.terminalError).toBe(true);
          } else {
            expect(result.terminalError).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Random mixed sequences ─────────────────────────────────────────────────

  /**
   * Property 4k: A random sequence of transitions starting from 'received'
   * respects the lifecycle at every step.
   *
   * Generate a random sequence of status values. Walk through the sequence
   * starting from 'received', applying each transition. At each step, the
   * result of isValidStatusTransition MUST match the expected outcome based
   * on the current state and the proposed next state.
   *
   * This property exercises the lifecycle as a state machine across arbitrary
   * transition sequences, including sequences that mix valid and invalid moves.
   *
   * Validates: Requirements 5.3, 5.7, 5.8
   */
  test(
    'a random sequence of transitions respects the lifecycle state machine at every step',
    () => {
      // Generate a sequence of 1–10 status values (the proposed next statuses)
      const transitionSequenceArbitrary = fc.array(anyStatusArbitrary, {
        minLength: 1,
        maxLength: 10,
      });

      fc.assert(
        fc.property(transitionSequenceArbitrary, (proposedStatuses) => {
          let currentStatus = 'received';

          for (const proposedStatus of proposedStatuses) {
            const result = isValidStatusTransition(currentStatus, proposedStatus);

            // Determine expected outcome based on lifecycle rules
            const isCurrentTerminal = TERMINAL_STATUSES.has(currentStatus);
            const isAllowedTransition =
              !isCurrentTerminal &&
              VALID_TRANSITIONS[currentStatus] &&
              VALID_TRANSITIONS[currentStatus].has(proposedStatus);

            if (isCurrentTerminal) {
              // Terminal state: always rejected with terminalError=true
              expect(result.valid).toBe(false);
              expect(result.terminalError).toBe(true);
              // State does not change
            } else if (isAllowedTransition) {
              // Valid transition: accepted
              expect(result.valid).toBe(true);
              expect(result.terminalError).toBe(false);
              // Advance the state
              currentStatus = proposedStatus;
            } else {
              // Invalid transition from non-terminal: rejected without terminalError
              expect(result.valid).toBe(false);
              expect(result.terminalError).toBe(false);
              // State does not change
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Structural sanity checks (non-PBT) ────────────────────────────────────

  /**
   * Sanity: TERMINAL_STATUSES contains exactly 'completed' and 'cancelled'.
   */
  test('TERMINAL_STATUSES contains exactly completed and cancelled', () => {
    expect(TERMINAL_STATUSES.has('completed')).toBe(true);
    expect(TERMINAL_STATUSES.has('cancelled')).toBe(true);
    expect(TERMINAL_STATUSES.size).toBe(2);
  });

  /**
   * Sanity: VALID_TRANSITIONS covers all non-terminal statuses.
   */
  test('VALID_TRANSITIONS is defined for every non-terminal status', () => {
    for (const status of NON_TERMINAL_STATUSES) {
      expect(VALID_TRANSITIONS[status]).toBeDefined();
      expect(VALID_TRANSITIONS[status].size).toBeGreaterThan(0);
    }
  });

  /**
   * Sanity: received → in-progress is valid.
   */
  test('received → in-progress is a valid transition', () => {
    const result = isValidStatusTransition('received', 'in-progress');
    expect(result.valid).toBe(true);
    expect(result.terminalError).toBe(false);
  });

  /**
   * Sanity: in-progress → ready-for-pickup is valid.
   */
  test('in-progress → ready-for-pickup is a valid transition', () => {
    const result = isValidStatusTransition('in-progress', 'ready-for-pickup');
    expect(result.valid).toBe(true);
    expect(result.terminalError).toBe(false);
  });

  /**
   * Sanity: ready-for-pickup → completed is valid.
   */
  test('ready-for-pickup → completed is a valid transition', () => {
    const result = isValidStatusTransition('ready-for-pickup', 'completed');
    expect(result.valid).toBe(true);
    expect(result.terminalError).toBe(false);
  });

  /**
   * Sanity: received → completed is invalid (skips steps).
   */
  test('received → completed is an invalid transition (skips steps)', () => {
    const result = isValidStatusTransition('received', 'completed');
    expect(result.valid).toBe(false);
    expect(result.terminalError).toBe(false);
  });

  /**
   * Sanity: completed → received is rejected with terminalError=true.
   */
  test('completed → received is rejected with terminalError=true', () => {
    const result = isValidStatusTransition('completed', 'received');
    expect(result.valid).toBe(false);
    expect(result.terminalError).toBe(true);
  });

  /**
   * Sanity: cancelled → in-progress is rejected with terminalError=true.
   */
  test('cancelled → in-progress is rejected with terminalError=true', () => {
    const result = isValidStatusTransition('cancelled', 'in-progress');
    expect(result.valid).toBe(false);
    expect(result.terminalError).toBe(true);
  });
});
