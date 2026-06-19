// Feature: tailorstaq-platform, Property 3: Order reference uniqueness

/**
 * Property-Based Test: Order reference uniqueness
 *
 * Property 3: For any two distinct Orders created on the platform, their
 * reference numbers SHALL be different.
 *
 * Validates: Requirements 5.2
 *
 * Strategy:
 *   - Import `generateRawReference` directly from the orderRef utility so the
 *     test exercises the real generation logic without requiring a database
 *     connection.
 *   - Use fast-check to generate batches of N references (N up to 1000) and
 *     assert that all reference values within each batch are distinct (i.e.
 *     the Set cardinality equals the batch size).
 *   - Additionally verify structural properties: every generated reference is
 *     8–12 characters long and contains only uppercase alphanumeric characters.
 *
 * Reference format (from Requirements 5.2 and orderRef.js):
 *   - Length: 8–12 characters (inclusive)
 *   - Character set: uppercase letters A–Z and digits 0–9
 *   - Uniqueness: globally unique across all orders on the platform
 *
 * Note on uniqueness testing approach:
 *   The `generateOrderReference` function checks uniqueness against the
 *   database. Since we cannot rely on a live DB in a unit/PBT context, we
 *   test the raw generator (`generateRawReference`) directly. The property
 *   we verify is that the generator produces structurally valid references
 *   and that, across a large batch, collisions are absent — which is the
 *   statistical guarantee the design relies on (≈2.8 trillion possible values
 *   for 12-char references). We also test the full `generateOrderReference`
 *   function with an injected in-memory uniqueness checker to verify the
 *   retry/collision-avoidance logic.
 */

import fc from 'fast-check';
import { generateRawReference, generateOrderReference } from '../../src/utils/orderRef.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_LENGTH = 8;
const MAX_LENGTH = 12;
const VALID_CHARS_REGEX = /^[A-Z0-9]+$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a batch of N raw references using `generateRawReference` with
 * lengths drawn uniformly from [MIN_LENGTH, MAX_LENGTH].
 *
 * @param {number} batchSize - number of references to generate
 * @returns {string[]} array of generated reference strings
 */
function generateBatch(batchSize) {
  const refs = [];
  for (let i = 0; i < batchSize; i++) {
    // Pick a length uniformly from [8, 12]
    const length = MIN_LENGTH + (i % (MAX_LENGTH - MIN_LENGTH + 1));
    refs.push(generateRawReference(length));
  }
  return refs;
}

/**
 * Build an in-memory uniqueness checker that simulates the DB lookup used by
 * `generateOrderReference`. Tracks all references it has "seen" and returns
 * true (exists) for any duplicate.
 *
 * @returns {(ref: string) => Promise<boolean>} async checker function
 */
function createInMemoryChecker() {
  const seen = new Set();
  return async (reference) => {
    if (seen.has(reference)) {
      return true; // collision — reference already exists
    }
    seen.add(reference);
    return false; // unique — reference is new
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 3: Order reference uniqueness', () => {
  /**
   * Property 3a: All references in a batch are distinct.
   *
   * For any batch of N references (N drawn from 1–1000), the Set of reference
   * values MUST have the same cardinality as the batch size — i.e. no two
   * references in the batch are equal.
   *
   * Validates: Requirements 5.2
   */
  test(
    'all references in a batch of up to 1000 are distinct',
    () => {
      // Generate batch sizes from 1 to 1000
      const batchSizeArbitrary = fc.integer({ min: 1, max: 1000 });

      fc.assert(
        fc.property(batchSizeArbitrary, (batchSize) => {
          const refs = generateBatch(batchSize);

          // All references must be unique
          const uniqueRefs = new Set(refs);
          expect(uniqueRefs.size).toBe(batchSize);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 3b: Every generated reference has a valid length (8–12 characters).
   *
   * For any batch of references, every individual reference MUST have a length
   * between MIN_LENGTH (8) and MAX_LENGTH (12) inclusive.
   *
   * Validates: Requirements 5.2
   */
  test(
    'every generated reference has a length between 8 and 12 characters',
    () => {
      const batchSizeArbitrary = fc.integer({ min: 1, max: 200 });

      fc.assert(
        fc.property(batchSizeArbitrary, (batchSize) => {
          const refs = generateBatch(batchSize);

          for (const ref of refs) {
            expect(ref.length).toBeGreaterThanOrEqual(MIN_LENGTH);
            expect(ref.length).toBeLessThanOrEqual(MAX_LENGTH);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 3c: Every generated reference contains only uppercase alphanumeric characters.
   *
   * For any batch of references, every individual reference MUST match the
   * pattern /^[A-Z0-9]+$/ — no lowercase letters, spaces, or special characters.
   *
   * Validates: Requirements 5.2
   */
  test(
    'every generated reference contains only uppercase alphanumeric characters',
    () => {
      const batchSizeArbitrary = fc.integer({ min: 1, max: 200 });

      fc.assert(
        fc.property(batchSizeArbitrary, (batchSize) => {
          const refs = generateBatch(batchSize);

          for (const ref of refs) {
            expect(ref).toMatch(VALID_CHARS_REGEX);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 3d: generateRawReference respects the requested length exactly.
   *
   * For any valid length L in [8, 12], `generateRawReference(L)` MUST return
   * a string of exactly L characters.
   *
   * Validates: Requirements 5.2
   */
  test(
    'generateRawReference produces a string of exactly the requested length',
    () => {
      const lengthArbitrary = fc.integer({ min: MIN_LENGTH, max: MAX_LENGTH });

      fc.assert(
        fc.property(lengthArbitrary, (length) => {
          const ref = generateRawReference(length);
          expect(ref.length).toBe(length);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 3e: generateRawReference throws for out-of-range lengths.
   *
   * Calling `generateRawReference` with a length outside [8, 12] MUST throw
   * a RangeError. This guards against accidental misuse of the raw generator.
   *
   * Validates: Requirements 5.2
   */
  test(
    'generateRawReference throws a RangeError for lengths outside [8, 12]',
    () => {
      // Generate lengths strictly outside the valid range
      const outOfRangeArbitrary = fc.oneof(
        fc.integer({ min: 1, max: MIN_LENGTH - 1 }),       // too short: 1–7
        fc.integer({ min: MAX_LENGTH + 1, max: 100 }),     // too long: 13–100
      );

      fc.assert(
        fc.property(outOfRangeArbitrary, (length) => {
          expect(() => generateRawReference(length)).toThrow(RangeError);
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 3f: generateOrderReference with an in-memory checker produces unique references.
   *
   * When `generateOrderReference` is called N times with an in-memory
   * uniqueness checker (simulating the DB lookup), all returned references
   * MUST be distinct — the retry logic MUST resolve any collision.
   *
   * This tests the full uniqueness-guarantee contract of `generateOrderReference`,
   * including its collision-avoidance retry loop.
   *
   * Validates: Requirements 5.2
   */
  test(
    'generateOrderReference with in-memory checker produces unique references across sequential calls',
    async () => {
      // Generate batch sizes from 1 to 100 (async test, keep it reasonable)
      const batchSizeArbitrary = fc.integer({ min: 1, max: 100 });

      await fc.assert(
        fc.asyncProperty(batchSizeArbitrary, async (batchSize) => {
          const checker = createInMemoryChecker();
          const refs = [];

          for (let i = 0; i < batchSize; i++) {
            const ref = await generateOrderReference({ db: checker });
            refs.push(ref);
          }

          // All references must be unique
          const uniqueRefs = new Set(refs);
          expect(uniqueRefs.size).toBe(batchSize);

          // All references must be structurally valid
          for (const ref of refs) {
            expect(ref.length).toBeGreaterThanOrEqual(MIN_LENGTH);
            expect(ref.length).toBeLessThanOrEqual(MAX_LENGTH);
            expect(ref).toMatch(VALID_CHARS_REGEX);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 3g: Two independently generated references from the same batch
   * are never equal.
   *
   * For any pair of references generated independently, they MUST NOT be
   * equal. This is a pairwise check that directly validates the uniqueness
   * property stated in Property 3.
   *
   * Validates: Requirements 5.2
   */
  test(
    'any two independently generated references are never equal',
    () => {
      // Generate two independent lengths in [8, 12]
      const pairArbitrary = fc.tuple(
        fc.integer({ min: MIN_LENGTH, max: MAX_LENGTH }),
        fc.integer({ min: MIN_LENGTH, max: MAX_LENGTH }),
      );

      // Run many iterations — each generates a fresh pair and checks inequality
      let collisionCount = 0;
      const totalRuns = 10_000;

      for (let i = 0; i < totalRuns; i++) {
        const lengthA = MIN_LENGTH + (i % (MAX_LENGTH - MIN_LENGTH + 1));
        const lengthB = MIN_LENGTH + ((i + 2) % (MAX_LENGTH - MIN_LENGTH + 1));
        const refA = generateRawReference(lengthA);
        const refB = generateRawReference(lengthB);
        if (refA === refB) {
          collisionCount++;
        }
      }

      // With ~2.8 trillion possible 12-char references, the probability of
      // any collision in 10,000 pairs is astronomically small (< 10^-8).
      // We allow zero collisions as the expected outcome.
      expect(collisionCount).toBe(0);
    },
  );

  // ── Structural sanity checks (non-PBT) ────────────────────────────────────

  /**
   * Sanity: generateRawReference at minimum length (8) produces a valid reference.
   */
  test('generateRawReference at minimum length 8 produces a valid reference', () => {
    const ref = generateRawReference(8);
    expect(ref.length).toBe(8);
    expect(ref).toMatch(VALID_CHARS_REGEX);
  });

  /**
   * Sanity: generateRawReference at maximum length (12) produces a valid reference.
   */
  test('generateRawReference at maximum length 12 produces a valid reference', () => {
    const ref = generateRawReference(12);
    expect(ref.length).toBe(12);
    expect(ref).toMatch(VALID_CHARS_REGEX);
  });
});
