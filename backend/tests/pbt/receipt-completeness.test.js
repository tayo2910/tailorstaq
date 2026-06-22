// Feature: tailorstaq-platform, Property 6: Receipt completeness

/**
 * Property-Based Test: Receipt completeness
 *
 * Property 6: For any completed Order, the generated PDF receipt SHALL contain
 * all the following fields (or "Not provided" labels where the shop did not
 * provide optional contact information):
 *   - TAILORSTAQ brand title + "Receipt" subtitle
 *   - Shop logo placeholder (if logo_url is missing) or [TAILORSTAQ – Shop Logo]
 *   - Shop name, address, phone, contact email (or "Not provided" for missing)
 *   - Order reference, customer name, completion date
 *   - Product name, quantity, unit price, line total, order total
 *   - Footer: "Thank you for your order. For enquiries contact your shop."
 *
 * Validates: Requirements 6.2, 6.3, 6.7, 6.8
 *
 * Strategy:
 *   - Import `buildReceiptPdf` from the PDF worker.
 *   - Use fast-check to generate random receipt data objects with varying
 *     shop fields (including null/empty strings for optional fields).
 *   - Convert the generated PDF buffer to a UTF-8 string and assert that
 *     all required label/value strings appear in the output.
 *   - When optional fields are missing, assert that "Not provided" appears.
 */

import fc from 'fast-check';
import { buildReceiptPdf } from '../../src/queues/workers/pdf.worker.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_LABELS = [
  'TAILORSTAQ',
  'Receipt',
  'Order Reference:',
  'Customer Name:',
  'Completion Date:',
  'Product',
  'Qty',
  'Unit Price',
  'Line Total',
  'Order Total:',
  'Thank you for your order',
];

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generate a random non-empty string of printable ASCII characters.
 */
const nonEmptyStringArbitrary = fc.stringOf(
  fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 &\'-',
  ),
  { minLength: 1, maxLength: 50 },
);

/**
 * Generate a random positive integer as a string (e.g. quantity).
 */
const quantityArbitrary = fc.integer({ min: 1, max: 99 });

/**
 * Generate a random unit price as a number with up to 2 decimal places.
 */
const unitPriceArbitrary = fc.float({ min: 0.01, max: 999999.99, noDefaultInfinity: true, noNaN: true });

/**
 * Generate a random date string (ISO 8601).
 */
const dateArbitrary = fc.date({
  min: new Date('2024-01-01'),
  max: new Date('2026-12-31'),
});

/**
 * Generate an optional shop field value: either a non-empty string, null,
 * undefined, or an empty string — simulating all states the DB could return.
 */
const optionalFieldArbitrary = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(''),
);

/**
 * Generate a complete receipt data object as passed to buildReceiptPdf.
 * The shape matches what getReceiptData() returns from the DB join.
 */
const receiptDataArbitrary = fc.record({
  reference: nonEmptyStringArbitrary,
  customer_name: nonEmptyStringArbitrary,
  completion_date: dateArbitrary,
  product_name: nonEmptyStringArbitrary,
  quantity: quantityArbitrary,
  unit_price: unitPriceArbitrary,
  shop_name: nonEmptyStringArbitrary,
  shop_logo_url: optionalFieldArbitrary,
  shop_address: optionalFieldArbitrary,
  shop_phone: optionalFieldArbitrary,
  shop_contact_email: optionalFieldArbitrary,
});

/**
 * Generate a receipt data object where ALL optional fields are missing
 * (null/undefined/empty), to test the "Not provided" fallback path.
 */
const minimalReceiptDataArbitrary = fc.record({
  reference: nonEmptyStringArbitrary,
  customer_name: nonEmptyStringArbitrary,
  completion_date: dateArbitrary,
  product_name: nonEmptyStringArbitrary,
  quantity: quantityArbitrary,
  unit_price: unitPriceArbitrary,
  shop_name: nonEmptyStringArbitrary,
  shop_logo_url: fc.constant(null),
  shop_address: fc.constant(null),
  shop_phone: fc.constant(null),
  shop_contact_email: fc.constant(null),
});

// ─── Helper: extract text from PDF buffer ─────────────────────────────────────

/**
 * Extract printable text from a PDF buffer by reading parenthesised strings.
 * PDFKit emits text as `(text) Tj` or `(text) TJ` operators, so a simple
 * substring search over the decoded buffer is sufficient for assertion purposes.
 *
 * @param {Buffer} pdfBuffer
 * @returns {string}
 */
function pdfTextContent(pdfBuffer) {
  return pdfBuffer.toString('utf8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 6: Receipt completeness', () => {
  /**
   * Property 6a: Every generated PDF contains all required labels.
   *
   * For any valid receipt data, the PDF output MUST contain every string
   * in REQUIRED_LABELS (brand title, field headers, footer), regardless of
   * which optional shop fields are present or missing.
   *
   * Validates: Requirements 6.2, 6.3, 6.7, 6.8
   */
  test(
    'every generated PDF contains all required labels',
    async () => {
      await fc.assert(
        fc.asyncProperty(receiptDataArbitrary, async (data) => {
          const pdfBuffer = await buildReceiptPdf(data, { compress: false });
          const text = pdfTextContent(pdfBuffer);

          for (const label of REQUIRED_LABELS) {
            expect(text).toContain(label);
          }
        }),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 6b: The shop name and order reference appear in the PDF.
   *
   * For any receipt data, the generated PDF MUST contain the exact
   * shop_name and reference values provided.
   *
   * Validates: Requirements 6.2, 6.3
   */
  test(
    'the PDF contains the shop name and order reference values',
    async () => {
      await fc.assert(
        fc.asyncProperty(receiptDataArbitrary, async (data) => {
          const pdfBuffer = await buildReceiptPdf(data, { compress: false });
          const text = pdfTextContent(pdfBuffer);

          expect(text).toContain(data.shop_name);
          expect(text).toContain(data.reference);
        }),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 6c: Missing optional fields display "Not provided".
   *
   * For any receipt data where shop_address, shop_phone, or shop_contact_email
   * is null/undefined/empty, the PDF MUST contain "Not provided" in place of
   * the missing value.
   *
   * Validates: Requirement 6.8
   */
  test(
    'missing optional fields display "Not provided"',
    async () => {
      const data = {
        reference: 'REF-001',
        customer_name: 'Jane Doe',
        completion_date: new Date('2025-06-15'),
        product_name: 'Tailored Suit',
        quantity: 2,
        unit_price: 150.00,
        shop_name: 'Elite Tailors',
        shop_logo_url: null,
        shop_address: null,
        shop_phone: null,
        shop_contact_email: null,
      };

      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      // Should show "Not provided" for address, phone, email
      const notProvidedCount = (text.match(/Not provided/g) || []).length;
      expect(notProvidedCount).toBeGreaterThanOrEqual(3);
    },
  );

  /**
   * Property 6d: The logo placeholder appears when logo_url is missing.
   *
   * For receipt data without a shop_logo_url, the PDF MUST show the
   * TAILORSTAQ placeholder: "[TAILORSTAQ – Shop Logo]".
   *
   * Validates: Requirement 6.7
   */
  test(
    'logo placeholder appears when shop_logo_url is missing',
    async () => {
      await fc.assert(
        fc.asyncProperty(minimalReceiptDataArbitrary, async (data) => {
          const pdfBuffer = await buildReceiptPdf(data, { compress: false });
          const text = pdfTextContent(pdfBuffer);

          expect(text).toContain('TAILORSTAQ');
          expect(text).toContain('Shop Logo');
        }),
        { numRuns: 30 },
      );
    },
  );

  /**
   * Property 6e: The PDF buffer is non-empty and contains PDF header.
   *
   * For any valid receipt data, buildReceiptPdf MUST return a Buffer whose
   * first few bytes are the PDF magic number (%PDF-).
   *
   * Validates: Requirement 6.1
   */
  test(
    'the PDF buffer is non-empty and starts with the PDF magic number',
    async () => {
      await fc.assert(
        fc.asyncProperty(receiptDataArbitrary, async (data) => {
          const pdfBuffer = await buildReceiptPdf(data, { compress: false });

          expect(pdfBuffer).toBeInstanceOf(Buffer);
          expect(pdfBuffer.length).toBeGreaterThan(0);
          expect(pdfBuffer.subarray(0, 5).toString()).toBe('%PDF-');
        }),
        { numRuns: 30 },
      );
    },
  );

  /**
   * Property 6f: The customer name appears in the PDF.
   *
   * Validates: Requirement 6.3
   */
  test(
    'the PDF contains the customer name',
    async () => {
      await fc.assert(
        fc.asyncProperty(receiptDataArbitrary, async (data) => {
          const pdfBuffer = await buildReceiptPdf(data, { compress: false });
          const text = pdfTextContent(pdfBuffer);

          expect(text).toContain(data.customer_name);
        }),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 6g: The line total and order total are computed and appear.
   *
   * For any valid receipt data with quantity Q and unit_price U, the PDF
   * MUST contain the computed value Q × U formatted to 2 decimal places.
   *
   * Validates: Requirement 6.3
   */
  test(
    'the PDF contains the computed line total and order total',
    async () => {
      await fc.assert(
        fc.asyncProperty(receiptDataArbitrary, async (data) => {
          const pdfBuffer = await buildReceiptPdf(data, { compress: false });
          const text = pdfTextContent(pdfBuffer);

          const lineTotal = (data.quantity * data.unit_price).toFixed(2);
          expect(text).toContain(lineTotal);
        }),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 6h: The product name and quantity appear in the PDF.
   *
   * Validates: Requirement 6.3
   */
  test(
    'the PDF contains the product name and quantity',
    async () => {
      await fc.assert(
        fc.asyncProperty(receiptDataArbitrary, async (data) => {
          const pdfBuffer = await buildReceiptPdf(data, { compress: false });
          const text = pdfTextContent(pdfBuffer);

          expect(text).toContain(data.product_name);
          expect(text).toContain(String(data.quantity));
        }),
        { numRuns: 50 },
      );
    },
  );

  /**
   * Property 6i: The unit price appears in the PDF.
   *
   * Validates: Requirement 6.3
   */
  test(
    'the PDF contains the unit price',
    async () => {
      await fc.assert(
        fc.asyncProperty(receiptDataArbitrary, async (data) => {
          const pdfBuffer = await buildReceiptPdf(data, { compress: false });
          const text = pdfTextContent(pdfBuffer);

          expect(text).toContain(data.unit_price.toFixed(2));
        }),
        { numRuns: 50 },
      );
    },
  );
});
