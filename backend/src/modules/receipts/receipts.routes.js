'use strict';

import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { getReceiptForCustomer } from './receipts.service.js';

const router = Router();

router.use(authenticate, requireRole('customer'));

export async function getReceiptHandler(req, res) {
  try {
    const { userId: customerId } = req.user;
    const { id: orderId } = req.params;

    const receipt = await getReceiptForCustomer(orderId, customerId);

    if (!receipt || !receipt.pdf_url) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Receipt not found.',
          details: [],
        },
      });
    }

    const response = await fetch(receipt.pdf_url);

    if (!response.ok || !response.body) {
      return res.status(502).json({
        error: {
          code: 'BAD_GATEWAY',
          message: 'Unable to retrieve receipt file from storage.',
          details: [],
        },
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${orderId}.pdf"`,
    );

    response.body.pipe(res);
    response.body.on('error', (err) => {
      console.error('[receipts.routes] Error streaming receipt:', err.message);
      res.end();
    });
  } catch (err) {
    console.error('[receipts.routes] Unexpected error:', err.message);
    return res.status(err.status || 500).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred.',
        details: err.details || [],
      },
    });
  }
}

router.get('/:id/receipt', getReceiptHandler);

export default router;
