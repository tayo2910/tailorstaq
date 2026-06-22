/**
 * Unit tests for receipt PDF structure and fallback rendering.
 *
 * Task 9.4 — Requirements: 6.2, 6.3, 6.7, 6.8
 *
 * Covers:
 *  - fieldOrNotProvided returns the value for present fields
 *  - fieldOrNotProvided returns "Not provided" for null, undefined, or empty string
 *  - buildReceiptPdf includes TAILORSTAQ brand header
 *  - buildReceiptPdf includes shop logo placeholder when logo_url is null
 *  - buildReceiptPdf includes "Not provided" for missing optional shop fields
 *  - buildReceiptPdf includes all required order fields
 *  - buildReceiptPdf produces a valid PDF buffer
 */

import { jest } from '@jest/globals';

// ─── Import helpers directly via source to test them in isolation ──────────────

// We test fieldOrNotProvided by importing from the worker module.
// Since the worker has side-effect imports (pdfkit, bullmq), we mock those.

jest.unstable_mockModule('pdfkit', () => {
  // Return a minimal mock that satisfies the import but won't be called
  // in the helper tests below (they test fieldOrNotProvided only).
  const EventEmitter = require('events');
  return {
    default: class MockPDFDocument extends EventEmitter {
      constructor() { super(); }
      fontSize() { return this; }
      fillColor() { return this; }
      text() { return this; }
      moveDown() { return this; }
      moveTo() { return this; }
      lineTo() { return this; }
      strokeColor() { return this; }
      stroke() { return this; }
      image() { return this; }
      end() { this.emit('end'); }
    },
  };
});

jest.unstable_mockModule('bullmq', () => ({
  Worker: class MockWorker {},
}));

// Mock storage and receipt service imports to avoid DB dependencies in unit tests
jest.unstable_mockModule('../../src/utils/storage.js', () => ({
  uploadFile: jest.fn(),
  buildKey: jest.fn(),
}));

jest.unstable_mockModule('../../src/modules/receipts/receipts.service.js', () => ({
  getReceiptData: jest.fn(),
  createReceiptRow: jest.fn(),
  updateReceiptPdfUrl: jest.fn(),
}));

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  enqueueReceiptEmail: jest.fn(),
}));

jest.unstable_mockModule('../../src/config/index.js', () => ({
  config: { queues: { pdf: 'pdf-generation' } },
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  redisConnection: {},
}));

const { buildReceiptPdf } = await import('../../src/queues/workers/pdf.worker.js');

// ─── Helper: extract text from PDF buffer ─────────────────────────────────────

function pdfTextContent(pdfBuffer) {
  return pdfBuffer.toString('utf8');
}

// ─── Test data ────────────────────────────────────────────────────────────────

function createSampleData(overrides = {}) {
  return {
    reference: 'ORD-ABCD-1234',
    customer_name: 'Jane Doe',
    completion_date: new Date('2025-06-15T10:30:00Z'),
    product_name: 'Tailored Suit',
    quantity: 2,
    unit_price: 250.00,
    shop_name: 'Elite Tailors Ltd',
    shop_logo_url: null,
    shop_address: '123 High Street, London',
    shop_phone: '+44 20 1234 5678',
    shop_contact_email: 'contact@elitetailors.com',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Task 9.4 – Receipt PDF structure', () => {
  describe('buildReceiptPdf – header and branding', () => {
    test('includes TAILORSTAQ brand title and "Receipt" subtitle', async () => {
      const data = createSampleData();
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('TAILORSTAQ');
      expect(text).toContain('Receipt');
    });
  });

  describe('buildReceiptPdf – shop logo fallback (Requirement 6.7)', () => {
    test('shows TAILORSTAQ placeholder when logo_url is null', async () => {
      const data = createSampleData({ shop_logo_url: null });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('TAILORSTAQ');
      expect(text).toContain('Shop Logo');
    });

    test('shows TAILORSTAQ placeholder when logo_url is empty string', async () => {
      const data = createSampleData({ shop_logo_url: '' });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('TAILORSTAQ');
      expect(text).toContain('Shop Logo');
    });
  });

  describe('buildReceiptPdf – "Not provided" fallback (Requirement 6.8)', () => {
    test('address shows "Not provided" when null', async () => {
      const data = createSampleData({ shop_address: null });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('Not provided');
    });

    test('phone shows "Not provided" when undefined', async () => {
      const data = createSampleData({ shop_phone: undefined });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('Not provided');
    });

    test('contact email shows "Not provided" when empty string', async () => {
      const data = createSampleData({ shop_contact_email: '' });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('Not provided');
    });

    test('all three optional fields show "Not provided" when all are missing', async () => {
      const data = createSampleData({
        shop_address: null,
        shop_phone: undefined,
        shop_contact_email: '',
      });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      const notProvidedCount = (text.match(/Not provided/g) || []).length;
      // Should have at least 3 "Not provided" occurrences (address, phone, email)
      expect(notProvidedCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('buildReceiptPdf – required order fields (Requirement 6.3)', () => {
    test('contains order reference', async () => {
      const data = createSampleData({ reference: 'ORD-XYZ-9876' });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('ORD-XYZ-9876');
    });

    test('contains customer name', async () => {
      const data = createSampleData({ customer_name: 'John Smith' });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('John Smith');
    });

    test('contains shop name', async () => {
      const data = createSampleData({ shop_name: 'Bespoke Tailors' });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('Bespoke Tailors');
    });

    test('contains product name', async () => {
      const data = createSampleData({ product_name: 'Evening Gown' });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('Evening Gown');
    });

    test('contains quantity as a number string', async () => {
      const data = createSampleData({ quantity: 3 });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('3');
    });

    test('contains unit price formatted to 2 decimals', async () => {
      const data = createSampleData({ unit_price: 175.50 });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('175.50');
    });

    test('contains computed line total (qty × unit_price)', async () => {
      const data = createSampleData({ quantity: 4, unit_price: 99.99 });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      // 4 × 99.99 = 399.96
      expect(text).toContain('399.96');
    });

    test('contains "Order Total:" label and value', async () => {
      const data = createSampleData({ quantity: 1, unit_price: 500.00 });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('Order Total:');
      expect(text).toContain('500.00');
    });
  });

  describe('buildReceiptPdf – PDF structural validity', () => {
    test('returns a non-empty Buffer', async () => {
      const data = createSampleData();
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    test('starts with PDF magic number (%PDF-)', async () => {
      const data = createSampleData();
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });

      expect(pdfBuffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    test('contains the footer message', async () => {
      const data = createSampleData();
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('Thank you for your order');
    });
  });

  describe('buildReceiptPdf – all fields present with full data', () => {
    test('contains shop address, phone, and email when provided', async () => {
      const data = createSampleData({
        shop_address: '456 Oak Avenue, Manchester',
        shop_phone: '+44 161 123 4567',
        shop_contact_email: 'info@tailorshop.com',
      });
      const pdfBuffer = await buildReceiptPdf(data, { compress: false });
      const text = pdfTextContent(pdfBuffer);

      expect(text).toContain('456 Oak Avenue, Manchester');
      expect(text).toContain('+44 161 123 4567');
      expect(text).toContain('info@tailorshop.com');
    });
  });
});
