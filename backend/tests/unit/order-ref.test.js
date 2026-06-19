/**
 * Unit tests for src/utils/orderRef.js
 *
 * Covers:
 *  - generateRawReference produces strings of the correct length
 *  - generateRawReference only contains uppercase alphanumeric characters
 *  - generateRawReference throws for out-of-range lengths
 *  - generateOrderReference returns a string that passes format checks
 *  - generateOrderReference retries on collision and eventually succeeds
 *  - generateOrderReference throws after MAX_ATTEMPTS consecutive collisions
 *
 * Requirements: 5.2
 */

import { generateRawReference, generateOrderReference } from '../../src/utils/orderRef.js';

const UPPERCASE_ALPHANUMERIC = /^[A-Z0-9]+$/;

// ─── generateRawReference ────────────────────────────────────────────────────

describe('generateRawReference', () => {
  test('returns a string of exactly the requested length (8)', () => {
    const ref = generateRawReference(8);
    expect(ref).toHaveLength(8);
  });

  test('returns a string of exactly the requested length (12)', () => {
    const ref = generateRawReference(12);
    expect(ref).toHaveLength(12);
  });

  test('returns a string of exactly the requested length (10)', () => {
    const ref = generateRawReference(10);
    expect(ref).toHaveLength(10);
  });

  test('contains only uppercase letters and digits', () => {
    for (let len = 8; len <= 12; len++) {
      const ref = generateRawReference(len);
      expect(ref).toMatch(UPPERCASE_ALPHANUMERIC);
    }
  });

  test('produces different values on successive calls (randomness check)', () => {
    // Generate 20 references of length 10; they should not all be identical
    const refs = new Set(Array.from({ length: 20 }, () => generateRawReference(10)));
    // With 36^10 ≈ 3.7 × 10^15 possibilities, duplicates are astronomically unlikely
    expect(refs.size).toBeGreaterThan(1);
  });

  test('throws RangeError for length below minimum (7)', () => {
    expect(() => generateRawReference(7)).toThrow(RangeError);
  });

  test('throws RangeError for length above maximum (13)', () => {
    expect(() => generateRawReference(13)).toThrow(RangeError);
  });

  test('throws RangeError for length 0', () => {
    expect(() => generateRawReference(0)).toThrow(RangeError);
  });

  test('throws RangeError for negative length', () => {
    expect(() => generateRawReference(-1)).toThrow(RangeError);
  });
});

// ─── generateOrderReference ──────────────────────────────────────────────────

describe('generateOrderReference', () => {
  test('returns a string between 8 and 12 characters', async () => {
    // Inject a db checker that always reports no collision
    const ref = await generateOrderReference({ db: async () => false });
    expect(ref.length).toBeGreaterThanOrEqual(8);
    expect(ref.length).toBeLessThanOrEqual(12);
  });

  test('returned reference contains only uppercase alphanumeric characters', async () => {
    const ref = await generateOrderReference({ db: async () => false });
    expect(ref).toMatch(UPPERCASE_ALPHANUMERIC);
  });

  test('retries when the first candidate collides and returns the second', async () => {
    let callCount = 0;
    // First call → collision; second call → no collision
    const db = async () => {
      callCount++;
      return callCount === 1; // true = exists (collision) on first call
    };

    const ref = await generateOrderReference({ db });
    expect(callCount).toBe(2);
    expect(ref).toMatch(UPPERCASE_ALPHANUMERIC);
  });

  test('throws after 10 consecutive collisions', async () => {
    // Always report a collision
    const db = async () => true;
    await expect(generateOrderReference({ db })).rejects.toThrow(
      /Failed to generate a unique order reference after 10 attempts/,
    );
  });

  test('generates distinct references across multiple calls (no-collision scenario)', async () => {
    const db = async () => false; // no collisions
    const refs = await Promise.all(
      Array.from({ length: 50 }, () => generateOrderReference({ db })),
    );
    const unique = new Set(refs);
    // With 36^8 ≈ 2.8 × 10^12 possibilities, 50 collisions are astronomically unlikely
    expect(unique.size).toBe(50);
  });
});
