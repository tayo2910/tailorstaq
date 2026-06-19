/**
 * Unit tests for the receipt download endpoint.
 *
 * Covers:
 *  - returns 404 when no receipt exists or pdf_url is missing
 *  - returns 502 when storage fetch fails
 *  - streams PDF response successfully on valid receipt
 */

import { jest } from '@jest/globals';

const mockGetReceiptForCustomer = jest.fn();

jest.unstable_mockModule('../../src/modules/receipts/receipts.service.js', () => ({
  getReceiptForCustomer: mockGetReceiptForCustomer,
}));

const { getReceiptHandler } = await import(
  '../../src/modules/receipts/receipts.routes.js'
);

describe('getReceiptHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  function makeReq(options = {}) {
    return {
      params: { id: options.orderId || 'order-uuid-1' },
      user: { userId: options.customerId || 'customer-uuid-1' },
    };
  }

  function makeRes() {
    const res = {
      headers: {},
      _status: null,
      _body: null,
      status(code) {
        this._status = code;
        return this;
      },
      json(body) {
        this._body = body;
        return this;
      },
      setHeader(key, value) {
        this.headers[key] = value;
      },
      end: jest.fn(),
    };
    return res;
  }

  test('returns 404 when receipt does not exist', async () => {
    mockGetReceiptForCustomer.mockResolvedValue(null);

    const req = makeReq();
    const res = makeRes();

    await getReceiptHandler(req, res);

    expect(res._status).toBe(404);
    expect(res._body.error.code).toBe('NOT_FOUND');
  });

  test('returns 404 when receipt exists but pdf_url is missing', async () => {
    mockGetReceiptForCustomer.mockResolvedValue({ id: 'receipt-uuid-1', pdf_url: null });

    const req = makeReq();
    const res = makeRes();

    await getReceiptHandler(req, res);

    expect(res._status).toBe(404);
    expect(res._body.error.code).toBe('NOT_FOUND');
  });

  test('returns 502 when storage fetch returns bad response', async () => {
    mockGetReceiptForCustomer.mockResolvedValue({ id: 'receipt-uuid-1', pdf_url: 'https://example.com/receipt.pdf' });

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    const req = makeReq();
    const res = makeRes();

    await getReceiptHandler(req, res);

    expect(res._status).toBe(502);
    expect(res._body.error.code).toBe('BAD_GATEWAY');
  });

  test('streams PDF response successfully when receipt is available', async () => {
    const body = {
      pipe: jest.fn(),
      on: jest.fn((event, callback) => {
        if (event === 'error') {
          // no-op
        }
      }),
    };

    mockGetReceiptForCustomer.mockResolvedValue({
      id: 'receipt-uuid-1',
      pdf_url: 'https://example.com/receipt.pdf',
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: true, body });

    const req = makeReq();
    const res = makeRes();

    await getReceiptHandler(req, res);

    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toBe(
      `attachment; filename="receipt-${req.params.id}.pdf"`,
    );
    expect(body.pipe).toHaveBeenCalledWith(res);
  });
});
