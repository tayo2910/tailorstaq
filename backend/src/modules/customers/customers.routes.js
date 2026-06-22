'use strict';

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { updateProfile } from './customers.service.js';

const router = Router();

router.patch('/profile', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { full_name, email } = req.body;
    const result = await updateProfile(userId, { fullName: full_name, email });
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred.',
      },
    });
  }
});

export default router;
