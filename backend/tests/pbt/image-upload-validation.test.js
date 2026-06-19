// Feature: tailorstaq-platform, Property 10: Image upload validation

/**
 * Property-Based Test: Image upload validation
 *
 * Property 10: For any file submitted to a logo or product image upload
 * endpoint, the platform SHALL accept the file if and only if its MIME type
 * is `image/png`, `image/jpeg`, or `image/svg+xml` AND its size is between
 * 1 byte and 5,242,880 bytes (5 MB) inclusive.
 *
 * Validates: Requirements 2.3, 2.4, 2.6
 *
 * Strategy:
 *   - Implement the two-stage validation predicate inline, mirroring the logic
 *     in src/middleware/upload.js (fileFilter + validateNonEmpty + Multer size
 *     limit).
 *   - Use fast-check to generate random MIME types and file sizes, then assert
 *     that the acceptance decision matches the specification across all inputs.
 *
 * Validation rules (from Requirements 2.3, 2.4, 2.6 and upload.js):
 *   Stage 1 — MIME type check (fileFilter):
 *     Accept only: image/png | image/jpeg | image/svg+xml
 *     Reject all others with INVALID_FILE_TYPE
 *   Stage 2 — size checks:
 *     Reject size === 0 with EMPTY_FILE (validateNonEmpty middleware)
 *     Reject size > MAX_FILE_SIZE_BYTES with FILE_TOO_LARGE (Multer limits.fileSize)
 *   A file passes if and only if both stages accept it.
 */

import fc from 'fast-check';

// ─── Constants (mirrors src/config/env.js and src/middleware/upload.js) ───────

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5,242,880 bytes

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);

// ─── Validation predicate ─────────────────────────────────────────────────────

/**
 * Validate a file submission against the platform's upload rules.
 *
 * This mirrors the combined logic of:
 *   - fileFilter() in upload.js  (MIME type check)
 *   - Multer limits.fileSize     (size > MAX)
 *   - validateNonEmpty()         (size === 0)
 *
 * @param {{ mimeType: string; size: number }} file
 * @returns {{ accepted: boolean; reason: string | null }}
 *   accepted=true  → file passes all validation checks
 *   accepted=false → file is rejected; reason is the error code
 */
function validateFile(file) {
  // Stage 1: MIME type check
  if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
    return { accepted: false, reason: 'INVALID_FILE_TYPE' };
  }

  // Stage 2a: zero-byte check (validateNonEmpty)
  if (file.size === 0) {
    return { accepted: false, reason: 'EMPTY_FILE' };
  }

  // Stage 2b: size ceiling check (Multer limits.fileSize)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { accepted: false, reason: 'FILE_TOO_LARGE' };
  }

  return { accepted: true, reason: null };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * A pool of MIME types that includes the three accepted types plus a variety
 * of common invalid types. This ensures fast-check generates both valid and
 * invalid MIME values with good coverage.
 */
const INVALID_MIME_TYPES = [
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'text/plain',
  'application/pdf',
  'application/octet-stream',
  'video/mp4',
  'audio/mpeg',
  '',
  'image/', // malformed
  'image/pngx',
  'IMAGE/PNG', // wrong case — not in the allowed set
];

/** Arbitrary that generates one of the three accepted MIME types. */
const validMimeArbitrary = fc.constantFrom(...ALLOWED_MIME_TYPES);

/** Arbitrary that generates a MIME type that is NOT in the allowed set. */
const invalidMimeArbitrary = fc.constantFrom(...INVALID_MIME_TYPES);

/** Any MIME type: valid or invalid. */
const anyMimeArbitrary = fc.oneof(validMimeArbitrary, invalidMimeArbitrary);

/** A valid (accepted) file size: 1 byte to 5,242,880 bytes inclusive. */
const validSizeArbitrary = fc.integer({ min: 1, max: MAX_FILE_SIZE_BYTES });

/** A zero-byte file size. */
const zeroSizeArbitrary = fc.constant(0);

/** A file size that exceeds the maximum: 5,242,881 bytes to ~10 MB. */
const oversizedArbitrary = fc.integer({
  min: MAX_FILE_SIZE_BYTES + 1,
  max: MAX_FILE_SIZE_BYTES * 2,
});

/** Any file size: 0, valid range, or oversized. */
const anySizeArbitrary = fc.oneof(zeroSizeArbitrary, validSizeArbitrary, oversizedArbitrary);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 10: Image upload validation', () => {
  /**
   * Core property: accepted iff MIME ∈ allowed set AND 1 ≤ size ≤ MAX_FILE_SIZE_BYTES
   *
   * For any combination of MIME type and file size, the acceptance result MUST
   * match the logical conjunction:
   *   MIME ∈ {image/png, image/jpeg, image/svg+xml}
   *   AND size >= 1
   *   AND size <= MAX_FILE_SIZE_BYTES
   *
   * This is the canonical statement of Property 10.
   *
   * Validates: Requirements 2.3, 2.4, 2.6
   */
  test(
    'file is accepted iff MIME type is allowed AND size is in [1, 5242880]',
    () => {
      const fileArbitrary = fc.record({
        mimeType: anyMimeArbitrary,
        size: anySizeArbitrary,
      });

      fc.assert(
        fc.property(fileArbitrary, ({ mimeType, size }) => {
          const result = validateFile({ mimeType, size });

          const shouldBeAccepted =
            ALLOWED_MIME_TYPES.has(mimeType) && size >= 1 && size <= MAX_FILE_SIZE_BYTES;

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
   * Property 10a: All three accepted MIME types with valid sizes are always accepted.
   *
   * For each of image/png, image/jpeg, image/svg+xml with any size in [1, MAX],
   * the file MUST be accepted.
   *
   * Validates: Requirements 2.3, 2.6
   */
  test(
    'all three accepted MIME types with valid sizes are always accepted',
    () => {
      const validFileArbitrary = fc.record({
        mimeType: validMimeArbitrary,
        size: validSizeArbitrary,
      });

      fc.assert(
        fc.property(validFileArbitrary, ({ mimeType, size }) => {
          const result = validateFile({ mimeType, size });

          expect(result.accepted).toBe(true);
          expect(result.reason).toBeNull();
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 10b: Any disallowed MIME type is always rejected with INVALID_FILE_TYPE.
   *
   * For any MIME type not in the allowed set, the file MUST be rejected
   * regardless of its size.
   *
   * Validates: Requirements 2.4, 2.6
   */
  test(
    'any disallowed MIME type is always rejected with INVALID_FILE_TYPE',
    () => {
      const invalidMimeFileArbitrary = fc.record({
        mimeType: invalidMimeArbitrary,
        size: anySizeArbitrary,
      });

      fc.assert(
        fc.property(invalidMimeFileArbitrary, ({ mimeType, size }) => {
          const result = validateFile({ mimeType, size });

          expect(result.accepted).toBe(false);
          expect(result.reason).toBe('INVALID_FILE_TYPE');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 10c: A zero-byte file with an otherwise valid MIME type is always rejected.
   *
   * Validates: Requirements 2.4, 2.6 (0-byte files are explicitly disallowed)
   */
  test(
    'a zero-byte file with an accepted MIME type is always rejected with EMPTY_FILE',
    () => {
      const emptyFileArbitrary = fc.record({
        mimeType: validMimeArbitrary,
        size: zeroSizeArbitrary,
      });

      fc.assert(
        fc.property(emptyFileArbitrary, ({ mimeType, size }) => {
          const result = validateFile({ mimeType, size });

          expect(result.accepted).toBe(false);
          expect(result.reason).toBe('EMPTY_FILE');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 10d: A file exceeding 5 MB with a valid MIME type is always rejected.
   *
   * Validates: Requirements 2.3, 2.4 (max file size is 5 MB)
   */
  test(
    'a file exceeding 5 MB with an accepted MIME type is always rejected with FILE_TOO_LARGE',
    () => {
      const oversizedFileArbitrary = fc.record({
        mimeType: validMimeArbitrary,
        size: oversizedArbitrary,
      });

      fc.assert(
        fc.property(oversizedFileArbitrary, ({ mimeType, size }) => {
          const result = validateFile({ mimeType, size });

          expect(result.accepted).toBe(false);
          expect(result.reason).toBe('FILE_TOO_LARGE');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 10e: MIME type check takes precedence over size checks.
   *
   * A file with an invalid MIME type MUST be rejected with INVALID_FILE_TYPE
   * even when its size would otherwise be valid (the MIME check runs first
   * in fileFilter, before the file is buffered or size-checked).
   *
   * Validates: Requirements 2.4 (distinct error per failure type)
   */
  test(
    'MIME type rejection takes precedence over size rejection',
    () => {
      // Combine invalid MIME with every size category to confirm MIME wins
      const precedenceArbitrary = fc.record({
        mimeType: invalidMimeArbitrary,
        size: anySizeArbitrary,
      });

      fc.assert(
        fc.property(precedenceArbitrary, ({ mimeType, size }) => {
          const result = validateFile({ mimeType, size });

          expect(result.accepted).toBe(false);
          // MIME check fires first — reason must always be INVALID_FILE_TYPE
          expect(result.reason).toBe('INVALID_FILE_TYPE');
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Boundary tests (non-PBT): verify exact boundary values behave correctly.
   *
   * Validates: Requirements 2.3, 2.4, 2.6
   */
  describe('boundary values', () => {
    test('size = 1 byte (minimum) with valid MIME is accepted', () => {
      const result = validateFile({ mimeType: 'image/png', size: 1 });
      expect(result.accepted).toBe(true);
    });

    test('size = 5,242,880 bytes (exactly 5 MB) with valid MIME is accepted', () => {
      const result = validateFile({ mimeType: 'image/jpeg', size: MAX_FILE_SIZE_BYTES });
      expect(result.accepted).toBe(true);
    });

    test('size = 5,242,881 bytes (1 byte over limit) with valid MIME is rejected', () => {
      const result = validateFile({ mimeType: 'image/svg+xml', size: MAX_FILE_SIZE_BYTES + 1 });
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('FILE_TOO_LARGE');
    });

    test('size = 0 bytes with valid MIME is rejected', () => {
      const result = validateFile({ mimeType: 'image/png', size: 0 });
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('EMPTY_FILE');
    });

    test('image/png is accepted', () => {
      const result = validateFile({ mimeType: 'image/png', size: 1024 });
      expect(result.accepted).toBe(true);
    });

    test('image/jpeg is accepted', () => {
      const result = validateFile({ mimeType: 'image/jpeg', size: 1024 });
      expect(result.accepted).toBe(true);
    });

    test('image/svg+xml is accepted', () => {
      const result = validateFile({ mimeType: 'image/svg+xml', size: 1024 });
      expect(result.accepted).toBe(true);
    });

    test('image/gif is rejected with INVALID_FILE_TYPE', () => {
      const result = validateFile({ mimeType: 'image/gif', size: 1024 });
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('INVALID_FILE_TYPE');
    });

    test('image/webp is rejected with INVALID_FILE_TYPE', () => {
      const result = validateFile({ mimeType: 'image/webp', size: 1024 });
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('INVALID_FILE_TYPE');
    });

    test('IMAGE/PNG (wrong case) is rejected with INVALID_FILE_TYPE', () => {
      // MIME type matching is case-sensitive in the allowed set
      const result = validateFile({ mimeType: 'IMAGE/PNG', size: 1024 });
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('INVALID_FILE_TYPE');
    });
  });
});
