'use strict';

/**
 * Unit tests for the PDF receipt worker (task 9.1).
 *
 * Tests cover:
 *  - buildReceiptPdf produces a valid PDF buffer
 *  - Shop logo fallback when logo_url is null (Req 6.7)
 *  - "Not provided" labels for missing shop fields (Req 6.8)
 *  - All required receipt fields are present in the PDF text (Req 6.2, 6.3)
 *
 * PDFKit encodes text as hex strings in TJ operators, e.g.
 * [<4e4520436c6f746869657273> 0] TJ  → "NE Clothiers"
 * We extract all hex blocks and decode them to verify field presence.
 *
 * Requirements: 6.2, 6.3, 6.7, 6.8
 */

import { buildReceiptPdf } from '../../src/queues/workers/pdf.worker.js';

// ─── Test data factories ──────────────────────────────────────────────────────

function fullReceiptData() {
  return {
    order_id: 'order-uuid-001',
    reference: 'ABCD1234',
    quantity: 2,
    unit_price: '50.00',
    line_total: '100.00',
    order_total: '100.00',
    completion_date: new Date('2025-01-15T10:00:00Z'),
    customer_id: 'customer-uuid-001',
    customer_name: 'Jane Doe',
    customer_email: 'jane@example.com',
    tenant_id: 'tenant-uuid-001',
    shop_id: 'shop-uuid-001',
    shop_name: 'NE Clothiers',
    shop_logo_url: null,
    shop_address: '10 High Street, London',
    shop_phone: '+44 20 1234 5678',
    shop_contact_email: 'contact@neclothiers.com',
    product_name: 'Bespoke Suit',
    product_price: '50.00',
  };
}

function minimalReceiptData() {
  return {
    ...fullReceiptData(),
    shop_logo_url: null,
    shop_address: null,
    shop_phone: null,
    shop_contact_email: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a PDF with compression disabled so the content stream is readable.
 */
async function buildUncompressed(data) {
  return buildReceiptPdf(data, { compress: false });
}

/**
 * Extract all human-readable text from a PDFKit-generated PDF buffer.
 *
 * PDFKit represents text as hex strings inside TJ operators:
 *   [<hex1> <num> <hex2> ...] TJ
 * Each <hexN> is a sequence of hex byte pairs that encode Latin-1 characters.
 *
 * This function:
 *   1. Converts the buffer to a latin-1 string.
 *   2. Finds all <hexstring> blocks.
 *   3. Decodes each hex block to a string and concatenates them.
 *
 * @param {Buffer} pdfBuffer
 * @returns {string} — all text content decoded from the PDF
 */
function extractTextFromPdf(pdfBuffer) {
  const raw = pdfBuffer.toString('latin1');

  // Match all hex strings inside angle brackets: <4e4520...>
  const hexPattern = /<([0-9a-fA-F]+)>/g;
  let allText = '';
  let match;

  while ((match = hexPattern.exec(raw)) !== null) {
    const hex = match[1];
    // Decode pairs of hex digits to characters
    for (let i = 0; i < hex.length - 1; i += 2) {
      const charCode = parseInt(hex.slice(i, i + 2), 16);
      allText += String.fromCharCode(charCode);
    }
  }

  return allText;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildReceiptPdf', () => {
  it('returns a Buffer', async () => {
    const pdf = await buildReceiptPdf(fullReceiptData());
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
  });

  it('produces a valid PDF (starts with %%PDF- signature)', async () => {
    const pdf = await buildReceiptPdf(fullReceiptData());
    expect(pdf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('includes the shop name (Req 6.2)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    expect(extractTextFromPdf(pdf)).toContain('NE Clothiers');
  });

  it('includes the order reference number (Req 6.3)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    expect(extractTextFromPdf(pdf)).toContain('ABCD1234');
  });

  it('includes the customer name (Req 6.3)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    expect(extractTextFromPdf(pdf)).toContain('Jane Doe');
  });

  it('includes the product name (Req 6.3)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    expect(extractTextFromPdf(pdf)).toContain('Bespoke Suit');
  });

  it('includes the quantity (Req 6.3)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    // Quantity 2 is in the line items row
    expect(extractTextFromPdf(pdf)).toContain('2');
  });

  it('includes the unit price (Req 6.3)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    expect(extractTextFromPdf(pdf)).toContain('50.00');
  });

  it('includes the line total (Req 6.3)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    // 2 × 50.00 = 100.00
    expect(extractTextFromPdf(pdf)).toContain('100.00');
  });

  it('includes the TAILORSTAQ brand name (Req 6.7)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    expect(extractTextFromPdf(pdf)).toContain('TAILORSTAQ');
  });

  it('shows TAILORSTAQ placeholder when shop_logo_url is null (Req 6.7)', async () => {
    const pdf = await buildUncompressed({ ...fullReceiptData(), shop_logo_url: null });
    expect(extractTextFromPdf(pdf)).toContain('TAILORSTAQ');
  });

  it('uses "Not provided" for missing shop address (Req 6.8)', async () => {
    const pdf = await buildUncompressed({ ...fullReceiptData(), shop_address: null });
    expect(extractTextFromPdf(pdf)).toContain('Not provided');
  });

  it('uses "Not provided" for missing shop phone (Req 6.8)', async () => {
    const pdf = await buildUncompressed({ ...fullReceiptData(), shop_phone: null });
    expect(extractTextFromPdf(pdf)).toContain('Not provided');
  });

  it('uses "Not provided" for missing shop contact email (Req 6.8)', async () => {
    const pdf = await buildUncompressed({ ...fullReceiptData(), shop_contact_email: null });
    expect(extractTextFromPdf(pdf)).toContain('Not provided');
  });

  it('includes shop address when provided (Req 6.2)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    expect(extractTextFromPdf(pdf)).toContain('10 High Street, London');
  });

  it('includes shop phone when provided (Req 6.2)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    expect(extractTextFromPdf(pdf)).toContain('+44 20 1234 5678');
  });

  it('includes shop contact email when provided (Req 6.2)', async () => {
    const pdf = await buildUncompressed(fullReceiptData());
    expect(extractTextFromPdf(pdf)).toContain('contact@neclothiers.com');
  });

  it('handles all null optional shop fields gracefully', async () => {
    await expect(buildReceiptPdf(minimalReceiptData())).resolves.toBeInstanceOf(Buffer);
  });

  it('handles a minimal unit price gracefully', async () => {
    const data = { ...fullReceiptData(), unit_price: '0.01', quantity: 1 };
    await expect(buildReceiptPdf(data)).resolves.toBeInstanceOf(Buffer);
  });
});
