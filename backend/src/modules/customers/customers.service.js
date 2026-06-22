'use strict';

import { query } from '../../db/queries/base.js';

export async function updateProfile(userId, { fullName, email }) {
  const updates = [];
  const params = [];
  let idx = 1;

  if (fullName !== undefined) {
    if (typeof fullName !== 'string' || fullName.trim().length === 0) {
      const err = new Error('Full name must be a non-empty string.');
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (fullName.trim().length > 100) {
      const err = new Error('Full name must be no more than 100 characters.');
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    updates.push(`full_name = $${idx++}`);
    params.push(fullName.trim());
  }

  if (email !== undefined) {
    const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
    if (!emailRegex.test(email.trim())) {
      const err = new Error('Email must be a valid RFC 5321 format.');
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.trim(), userId]);
    if (existing.rows.length > 0) {
      const err = new Error('Email is already in use.');
      err.status = 409;
      err.code = 'DUPLICATE_EMAIL';
      throw err;
    }

    updates.push(`email = $${idx++}`);
    params.push(email.trim());

    updates.push(`account_status = 'pending_verification'`);
  }

  if (updates.length === 0) {
    const err = new Error('No fields to update.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  params.push(userId);
  const result = await query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, full_name, email, role, account_status, created_at`,
    params,
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return { user: result.rows[0] };
}
