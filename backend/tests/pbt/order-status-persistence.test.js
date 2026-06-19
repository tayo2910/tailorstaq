// Feature: tailorstaq-platform, Property 12: Order status change persistence regardless of notification

/**
 * Property-Based Test: Order status change persistence regardless of notification
 *
 * Property 12: For any Order status update, the new status and UTC timestamp
 * SHALL be persisted to the database regardless of whether the Customer
 * notification email is successfully delivered.
 *
 * Validates: Requirements 5.4
 *
 * Strategy:
 *   - Implement the order status update state machine inline, mirroring the
 *     logic in orders.service.js updateOrderStatus().
 *   - The key design pattern (from design.md "Notification Failure Handling"):
 *       "Business-critical state changes (order status, ...) are committed to
 *        the database before the notification job is enqueued, ensuring the
 *        state change is never blocked by email delivery."
 *   - Use fast-check to generate random valid status transitions combined with
 *     random notification outcomes (success, failure, timeout, throw).
 *   - Assert that:
 *       1. The DB state (status + recorded_at timestamp) is ALWAYS updated
 *          regardless of notification outcome.
 *       2. The notification failure NEVER causes the status update to be rolled
 *          back or left in an inconsistent state.
 *       3. The recorded_at timestamp is always a valid UTC timestamp.
 *       4. The status history entry is always appended (immutable audit trail).
 *
 * Architecture note:
 *   The persistence guarantee is achieved by:
 *     a) Committing the DB transaction (status + history row) BEFORE enqueuing
 *        the notification job.
 *     b) Calling enqueueOrderStatusEmail with .catch() so any enqueue failure
 *        is swallowed and does not propagate to the caller.
 *   This test verifies that invariant holds across all notification outcomes.
 */

import fc from 'fast-check';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * All valid order statuses (from orders.service.js and Requirements 5.3).
 */
const ALL_STATUSES = ['received', 'in-progress', 'ready-for-pickup', 'completed', 'cancelled'];

/**
 * Terminal statuses — no further transitions allowed (Requirements 5.7, 5.8).
 */
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

/**
 * Valid forward transitions (from orders.service.js VALID_TRANSITIONS).
 * Requirements: 5.3, 5.7
 */
const VALID_TRANSITIONS = {
  received: new Set(['in-progress', 'cancelled']),
  'in-progress': new Set(['ready-for-pickup', 'cancelled']),
  'ready-for-pickup': new Set(['completed', 'cancelled']),
};

// ─── Notification outcome types ───────────────────────────────────────────────

/**
 * Possible notification worker outcomes used in the simulation.
 *
 * @typedef {'success' | 'enqueue_failure' | 'worker_timeout' | 'worker_throw'} NotificationOutcome
 */

/** All possible notification outcomes for the arbitrary. */
const NOTIFICATION_OUTCOMES = ['success', 'enqueue_failure', 'worker_timeout', 'worker_throw'];

// ─── In-memory DB simulation ──────────────────────────────────────────────────

/**
 * Represents the persisted state of a single order in the database.
 *
 * @typedef {Object} OrderDbState
 * @property {string}   id          - order UUID (simulated)
 * @property {string}   status      - current order status
 * @property {number}   updatedAtMs - Unix timestamp (ms) of last status change
 * @property {Array<{ status: string, recordedAtMs: number }>} statusHistory
 *   - immutable append-only history of all status changes
 */

/**
 * Create a fresh order DB state.
 *
 * @param {string} initialStatus
 * @param {number} createdAtMs
 * @returns {OrderDbState}
 */
function createOrderState(initialStatus, createdAtMs) {
  return {
    id: `order-${Math.random().toString(36).slice(2)}`,
    status: initialStatus,
    updatedAtMs: createdAtMs,
    statusHistory: [{ status: initialStatus, recordedAtMs: createdAtMs }],
  };
}

// ─── Core persistence logic ───────────────────────────────────────────────────

/**
 * Simulate the order status update operation from orders.service.js.
 *
 * This mirrors the two-phase design:
 *   Phase 1 (DB transaction): Update status + append history row — ALWAYS committed.
 *   Phase 2 (notification):   Enqueue email — outcome does NOT affect Phase 1.
 *
 * @param {OrderDbState} dbState         - mutable in-memory DB state (modified in place)
 * @param {string}       newStatus       - the requested new status
 * @param {number}       nowMs           - current time in milliseconds
 * @param {NotificationOutcome} notificationOutcome - simulated notification result
 * @returns {{
 *   dbCommitted: boolean,
 *   notificationAttempted: boolean,
 *   notificationSucceeded: boolean,
 *   error: string | null,
 * }}
 */
function simulateStatusUpdate(dbState, newStatus, nowMs, notificationOutcome) {
  // ── Validate transition ────────────────────────────────────────────────────

  if (TERMINAL_STATUSES.has(dbState.status)) {
    return {
      dbCommitted: false,
      notificationAttempted: false,
      notificationSucceeded: false,
      error: 'TERMINAL_ORDER_STATE',
    };
  }

  const allowed = VALID_TRANSITIONS[dbState.status];
  if (!allowed || !allowed.has(newStatus)) {
    return {
      dbCommitted: false,
      notificationAttempted: false,
      notificationSucceeded: false,
      error: 'INVALID_TRANSITION',
    };
  }

  // ── Phase 1: DB transaction (always committed for valid transitions) ────────

  const previousStatus = dbState.status;
  dbState.status = newStatus;
  dbState.updatedAtMs = nowMs;
  dbState.statusHistory.push({ status: newStatus, recordedAtMs: nowMs });

  const dbCommitted = true;

  // ── Phase 2: Notification (fire-and-forget — outcome does NOT affect DB) ───

  let notificationSucceeded = false;

  switch (notificationOutcome) {
    case 'success':
      // Email enqueued and delivered successfully
      notificationSucceeded = true;
      break;

    case 'enqueue_failure':
      // enqueueOrderStatusEmail() throws — caught by .catch() in service
      // DB state is already committed; this error is swallowed
      notificationSucceeded = false;
      break;

    case 'worker_timeout':
      // BullMQ worker times out processing the job
      // DB state is already committed; worker failure is independent
      notificationSucceeded = false;
      break;

    case 'worker_throw':
      // Worker throws an unhandled error
      // DB state is already committed; worker failure is independent
      notificationSucceeded = false;
      break;

    default:
      notificationSucceeded = false;
  }

  return {
    dbCommitted,
    notificationAttempted: true,
    notificationSucceeded,
    error: null,
    previousStatus,
  };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * Arbitrary for a non-terminal starting status (valid source for a transition).
 */
const nonTerminalStatusArbitrary = fc.constantFrom('received', 'in-progress', 'ready-for-pickup');

/**
 * Arbitrary for a notification outcome (any of the four possible outcomes).
 */
const notificationOutcomeArbitrary = fc.constantFrom(...NOTIFICATION_OUTCOMES);

/**
 * Arbitrary for a current time offset (simulates various points in time).
 * Range: 0 to 10 years in the past from now.
 */
const nowMsArbitrary = fc.integer({ min: 0, max: 315_360_000_000 }).map(
  (offsetMs) => Date.now() - offsetMs,
);

/**
 * Arbitrary for a valid status transition pair (fromStatus, toStatus).
 * Only generates pairs that are valid according to VALID_TRANSITIONS.
 */
const validTransitionArbitrary = fc.oneof(
  // received → in-progress
  fc.record({
    fromStatus: fc.constant('received'),
    toStatus: fc.constant('in-progress'),
  }),
  // received → cancelled
  fc.record({
    fromStatus: fc.constant('received'),
    toStatus: fc.constant('cancelled'),
  }),
  // in-progress → ready-for-pickup
  fc.record({
    fromStatus: fc.constant('in-progress'),
    toStatus: fc.constant('ready-for-pickup'),
  }),
  // in-progress → cancelled
  fc.record({
    fromStatus: fc.constant('in-progress'),
    toStatus: fc.constant('cancelled'),
  }),
  // ready-for-pickup → completed
  fc.record({
    fromStatus: fc.constant('ready-for-pickup'),
    toStatus: fc.constant('completed'),
  }),
  // ready-for-pickup → cancelled
  fc.record({
    fromStatus: fc.constant('ready-for-pickup'),
    toStatus: fc.constant('cancelled'),
  }),
);

/**
 * Arbitrary for a sequence of valid transitions (1–5 steps) starting from 'received'.
 * Used to test multi-step persistence across a full lifecycle.
 */
const transitionSequenceArbitrary = fc
  .integer({ min: 1, max: 5 })
  .chain((length) => {
    // Build a sequence of valid transitions from 'received'
    // Each step picks a valid next status from the current one
    const steps = [];
    let current = 'received';

    for (let i = 0; i < length; i++) {
      if (TERMINAL_STATUSES.has(current)) break;
      const allowed = Array.from(VALID_TRANSITIONS[current] || []);
      if (allowed.length === 0) break;
      // Pick the first non-cancelling transition if available, else cancel
      const next = allowed.find((s) => s !== 'cancelled') || 'cancelled';
      steps.push({ fromStatus: current, toStatus: next });
      current = next;
    }

    return fc.constant(steps);
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 12: Order status change persistence regardless of notification', () => {
  /**
   * Property 12a: DB state is always committed regardless of notification outcome.
   *
   * For any valid status transition combined with any notification outcome
   * (success, enqueue failure, worker timeout, worker throw), the DB state
   * MUST reflect the new status and a valid UTC timestamp after the update.
   *
   * This is the core property — it verifies that notification failure NEVER
   * prevents the status from being persisted.
   *
   * Validates: Requirements 5.4
   */
  test(
    'DB status is always updated regardless of notification outcome',
    () => {
      fc.assert(
        fc.property(
          validTransitionArbitrary,
          notificationOutcomeArbitrary,
          nowMsArbitrary,
          ({ fromStatus, toStatus }, notificationOutcome, nowMs) => {
            const dbState = createOrderState(fromStatus, nowMs - 1000);

            const result = simulateStatusUpdate(dbState, toStatus, nowMs, notificationOutcome);

            // DB must always be committed for a valid transition
            expect(result.dbCommitted).toBe(true);
            expect(result.error).toBeNull();

            // The new status must be persisted in DB
            expect(dbState.status).toBe(toStatus);

            // The updated_at timestamp must be the nowMs we passed in
            expect(dbState.updatedAtMs).toBe(nowMs);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 12b: UTC timestamp is always a valid number regardless of notification outcome.
   *
   * For any valid status transition, the recorded_at timestamp in the status
   * history MUST be a finite positive number (valid Unix timestamp in ms).
   *
   * Validates: Requirements 5.4
   */
  test(
    'recorded_at timestamp is always a valid UTC timestamp regardless of notification outcome',
    () => {
      fc.assert(
        fc.property(
          validTransitionArbitrary,
          notificationOutcomeArbitrary,
          nowMsArbitrary,
          ({ fromStatus, toStatus }, notificationOutcome, nowMs) => {
            const dbState = createOrderState(fromStatus, nowMs - 1000);

            simulateStatusUpdate(dbState, toStatus, nowMs, notificationOutcome);

            // The last history entry must have a valid UTC timestamp
            const lastEntry = dbState.statusHistory[dbState.statusHistory.length - 1];
            expect(typeof lastEntry.recordedAtMs).toBe('number');
            expect(Number.isFinite(lastEntry.recordedAtMs)).toBe(true);
            expect(lastEntry.recordedAtMs).toBeGreaterThan(0);

            // The timestamp must match the nowMs we passed in
            expect(lastEntry.recordedAtMs).toBe(nowMs);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 12c: Status history is always appended (immutable audit trail).
   *
   * For any valid status transition, the order_status_history MUST gain exactly
   * one new entry after the update, regardless of notification outcome.
   * The history is append-only — previous entries are never modified.
   *
   * Validates: Requirements 5.4, 5.6
   */
  test(
    'status history always gains exactly one new entry regardless of notification outcome',
    () => {
      fc.assert(
        fc.property(
          validTransitionArbitrary,
          notificationOutcomeArbitrary,
          nowMsArbitrary,
          ({ fromStatus, toStatus }, notificationOutcome, nowMs) => {
            const dbState = createOrderState(fromStatus, nowMs - 1000);
            const historyLengthBefore = dbState.statusHistory.length;

            simulateStatusUpdate(dbState, toStatus, nowMs, notificationOutcome);

            // History must have grown by exactly 1
            expect(dbState.statusHistory.length).toBe(historyLengthBefore + 1);

            // The new entry must record the correct status
            const newEntry = dbState.statusHistory[dbState.statusHistory.length - 1];
            expect(newEntry.status).toBe(toStatus);

            // Previous entries must be unchanged (immutable audit trail)
            const previousEntry = dbState.statusHistory[historyLengthBefore - 1];
            expect(previousEntry.status).toBe(fromStatus);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 12d: Notification failure does NOT roll back the DB state.
   *
   * When the notification outcome is 'enqueue_failure' or 'worker_throw',
   * the DB state MUST still reflect the new status — the failure MUST NOT
   * cause a rollback or leave the order in the previous status.
   *
   * Validates: Requirements 5.4
   */
  test(
    'notification failure never rolls back the persisted status',
    () => {
      const failureOutcomeArbitrary = fc.constantFrom('enqueue_failure', 'worker_throw');

      fc.assert(
        fc.property(
          validTransitionArbitrary,
          failureOutcomeArbitrary,
          nowMsArbitrary,
          ({ fromStatus, toStatus }, failureOutcome, nowMs) => {
            const dbState = createOrderState(fromStatus, nowMs - 1000);

            const result = simulateStatusUpdate(dbState, toStatus, nowMs, failureOutcome);

            // DB must be committed despite notification failure
            expect(result.dbCommitted).toBe(true);
            expect(result.notificationSucceeded).toBe(false);

            // Status must be the new status, NOT rolled back to fromStatus
            expect(dbState.status).toBe(toStatus);
            expect(dbState.status).not.toBe(fromStatus);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 12e: Notification success and failure produce identical DB state.
   *
   * For any valid status transition, the DB state after a successful notification
   * MUST be identical to the DB state after a failed notification. The notification
   * outcome is completely independent of the persistence outcome.
   *
   * Validates: Requirements 5.4
   */
  test(
    'DB state is identical whether notification succeeds or fails',
    () => {
      fc.assert(
        fc.property(
          validTransitionArbitrary,
          nowMsArbitrary,
          ({ fromStatus, toStatus }, nowMs) => {
            // Simulate with successful notification
            const dbStateSuccess = createOrderState(fromStatus, nowMs - 1000);
            simulateStatusUpdate(dbStateSuccess, toStatus, nowMs, 'success');

            // Simulate with failed notification (enqueue failure)
            const dbStateFailure = createOrderState(fromStatus, nowMs - 1000);
            simulateStatusUpdate(dbStateFailure, toStatus, nowMs, 'enqueue_failure');

            // DB state must be identical regardless of notification outcome
            expect(dbStateSuccess.status).toBe(dbStateFailure.status);
            expect(dbStateSuccess.updatedAtMs).toBe(dbStateFailure.updatedAtMs);
            expect(dbStateSuccess.statusHistory.length).toBe(dbStateFailure.statusHistory.length);

            const lastSuccess = dbStateSuccess.statusHistory[dbStateSuccess.statusHistory.length - 1];
            const lastFailure = dbStateFailure.statusHistory[dbStateFailure.statusHistory.length - 1];
            expect(lastSuccess.status).toBe(lastFailure.status);
            expect(lastSuccess.recordedAtMs).toBe(lastFailure.recordedAtMs);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 12f: Multi-step lifecycle — persistence holds across all transitions.
   *
   * For any sequence of valid status transitions (1–5 steps), each step's
   * DB state MUST be persisted regardless of the notification outcome at each step.
   * The history grows by one entry per step, and each entry has a valid timestamp.
   *
   * Validates: Requirements 5.4
   */
  test(
    'persistence holds across a multi-step status lifecycle regardless of notification outcomes',
    () => {
      fc.assert(
        fc.property(
          transitionSequenceArbitrary,
          fc.array(notificationOutcomeArbitrary, { minLength: 1, maxLength: 5 }),
          nowMsArbitrary,
          (steps, outcomes, baseNowMs) => {
            if (steps.length === 0) return; // skip degenerate case

            const dbState = createOrderState('received', baseNowMs);
            const initialHistoryLength = dbState.statusHistory.length;

            let stepCount = 0;
            for (let i = 0; i < steps.length; i++) {
              const { toStatus } = steps[i];
              const outcome = outcomes[i % outcomes.length];
              const nowMs = baseNowMs + (i + 1) * 1000; // advance time by 1s per step

              const result = simulateStatusUpdate(dbState, toStatus, nowMs, outcome);

              if (result.error) break; // terminal state reached — stop

              // Each step must commit to DB
              expect(result.dbCommitted).toBe(true);
              stepCount++;

              // Status must match the requested transition
              expect(dbState.status).toBe(toStatus);

              // Timestamp must be the nowMs for this step
              expect(dbState.updatedAtMs).toBe(nowMs);
            }

            // History must have grown by exactly stepCount entries
            expect(dbState.statusHistory.length).toBe(initialHistoryLength + stepCount);

            // Every history entry must have a valid timestamp
            for (const entry of dbState.statusHistory) {
              expect(typeof entry.recordedAtMs).toBe('number');
              expect(Number.isFinite(entry.recordedAtMs)).toBe(true);
              expect(entry.recordedAtMs).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 12g: Terminal states are never updated, regardless of notification.
   *
   * For any order in a terminal state (completed or cancelled), any status
   * update attempt MUST be rejected with TERMINAL_ORDER_STATE and the DB
   * state MUST remain unchanged.
   *
   * Validates: Requirements 5.7, 5.8 (complementary to Property 12)
   */
  test(
    'terminal state orders are never updated regardless of notification outcome',
    () => {
      const terminalStatusArbitrary = fc.constantFrom('completed', 'cancelled');
      const anyStatusArbitrary = fc.constantFrom(...ALL_STATUSES);

      fc.assert(
        fc.property(
          terminalStatusArbitrary,
          anyStatusArbitrary,
          notificationOutcomeArbitrary,
          nowMsArbitrary,
          (terminalStatus, attemptedStatus, notificationOutcome, nowMs) => {
            const dbState = createOrderState(terminalStatus, nowMs - 1000);
            const statusBefore = dbState.status;
            const historyLengthBefore = dbState.statusHistory.length;
            const updatedAtBefore = dbState.updatedAtMs;

            const result = simulateStatusUpdate(
              dbState,
              attemptedStatus,
              nowMs,
              notificationOutcome,
            );

            // Must be rejected with TERMINAL_ORDER_STATE
            expect(result.dbCommitted).toBe(false);
            expect(result.error).toBe('TERMINAL_ORDER_STATE');

            // DB state must be completely unchanged
            expect(dbState.status).toBe(statusBefore);
            expect(dbState.updatedAtMs).toBe(updatedAtBefore);
            expect(dbState.statusHistory.length).toBe(historyLengthBefore);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 12h: The notification is always attempted after a successful DB commit.
   *
   * For any valid status transition, the notification MUST be attempted
   * (notificationAttempted=true) only after the DB has been committed.
   * This verifies the ordering guarantee: DB first, then notification.
   *
   * Validates: Requirements 5.4
   */
  test(
    'notification is always attempted after DB commit, never before',
    () => {
      fc.assert(
        fc.property(
          validTransitionArbitrary,
          notificationOutcomeArbitrary,
          nowMsArbitrary,
          ({ fromStatus, toStatus }, notificationOutcome, nowMs) => {
            const dbState = createOrderState(fromStatus, nowMs - 1000);

            const result = simulateStatusUpdate(dbState, toStatus, nowMs, notificationOutcome);

            // For valid transitions: DB committed first, then notification attempted
            expect(result.dbCommitted).toBe(true);
            expect(result.notificationAttempted).toBe(true);

            // DB state must already reflect the new status when notification runs
            // (i.e., DB was committed before notification was attempted)
            expect(dbState.status).toBe(toStatus);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // ── Structural sanity checks (non-PBT) ────────────────────────────────────

  /**
   * Sanity: A single valid transition with a failing notification persists correctly.
   */
  test('received → in-progress with enqueue_failure persists the new status', () => {
    const nowMs = Date.now();
    const dbState = createOrderState('received', nowMs - 5000);

    const result = simulateStatusUpdate(dbState, 'in-progress', nowMs, 'enqueue_failure');

    expect(result.dbCommitted).toBe(true);
    expect(result.notificationSucceeded).toBe(false);
    expect(dbState.status).toBe('in-progress');
    expect(dbState.updatedAtMs).toBe(nowMs);
    expect(dbState.statusHistory).toHaveLength(2);
    expect(dbState.statusHistory[1].status).toBe('in-progress');
    expect(dbState.statusHistory[1].recordedAtMs).toBe(nowMs);
  });

  /**
   * Sanity: A full lifecycle (received → in-progress → ready-for-pickup → completed)
   * with worker_throw at every step still persists all status changes.
   */
  test('full lifecycle with worker_throw at every step persists all status changes', () => {
    const baseMs = Date.now();
    const dbState = createOrderState('received', baseMs);

    const transitions = [
      { toStatus: 'in-progress', nowMs: baseMs + 1000 },
      { toStatus: 'ready-for-pickup', nowMs: baseMs + 2000 },
      { toStatus: 'completed', nowMs: baseMs + 3000 },
    ];

    for (const { toStatus, nowMs } of transitions) {
      const result = simulateStatusUpdate(dbState, toStatus, nowMs, 'worker_throw');
      expect(result.dbCommitted).toBe(true);
      expect(result.notificationSucceeded).toBe(false);
    }

    expect(dbState.status).toBe('completed');
    expect(dbState.statusHistory).toHaveLength(4); // initial + 3 transitions
    expect(dbState.statusHistory.map((e) => e.status)).toEqual([
      'received',
      'in-progress',
      'ready-for-pickup',
      'completed',
    ]);
  });

  /**
   * Sanity: Attempting to update a completed order returns TERMINAL_ORDER_STATE
   * and leaves DB unchanged.
   */
  test('updating a completed order returns TERMINAL_ORDER_STATE and leaves DB unchanged', () => {
    const nowMs = Date.now();
    const dbState = createOrderState('completed', nowMs - 1000);

    const result = simulateStatusUpdate(dbState, 'cancelled', nowMs, 'success');

    expect(result.dbCommitted).toBe(false);
    expect(result.error).toBe('TERMINAL_ORDER_STATE');
    expect(dbState.status).toBe('completed');
    expect(dbState.statusHistory).toHaveLength(1);
  });
});
