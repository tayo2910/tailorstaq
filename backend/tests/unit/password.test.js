/**
 * Unit tests for src/utils/password.js
 *
 * Covers:
 *  - hashPassword returns a bcrypt hash string
 *  - hashPassword produces different hashes for the same input (salt randomness)
 *  - verifyPassword returns true for a matching password
 *  - verifyPassword returns false for a non-matching password
 *  - verifyPassword returns false for empty/null inputs
 *  - hashPassword throws for empty/null input
 */

import { hashPassword, verifyPassword } from '../../src/utils/password.js';

describe('hashPassword', () => {
  test('returns a non-empty string', async () => {
    const hash = await hashPassword('MyP@ssw0rd!');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  test('returns a bcrypt hash (starts with $2b$)', async () => {
    const hash = await hashPassword('MyP@ssw0rd!');
    expect(hash).toMatch(/^\$2b\$/);
  });

  test('produces different hashes for the same plaintext (random salt)', async () => {
    const hash1 = await hashPassword('SamePassword1!');
    const hash2 = await hashPassword('SamePassword1!');
    expect(hash1).not.toBe(hash2);
  });

  test('throws when plain is empty string', async () => {
    await expect(hashPassword('')).rejects.toThrow('plain password is required');
  });

  test('throws when plain is null', async () => {
    await expect(hashPassword(null)).rejects.toThrow('plain password is required');
  });

  test('throws when plain is undefined', async () => {
    await expect(hashPassword(undefined)).rejects.toThrow('plain password is required');
  });
});

describe('verifyPassword', () => {
  test('returns true when plain matches the hash', async () => {
    const plain = 'CorrectHorse#99';
    const hash = await hashPassword(plain);
    const result = await verifyPassword(plain, hash);
    expect(result).toBe(true);
  });

  test('returns false when plain does not match the hash', async () => {
    const hash = await hashPassword('CorrectHorse#99');
    const result = await verifyPassword('WrongPassword!1', hash);
    expect(result).toBe(false);
  });

  test('returns false when plain is empty string', async () => {
    const hash = await hashPassword('SomePassword1!');
    const result = await verifyPassword('', hash);
    expect(result).toBe(false);
  });

  test('returns false when hash is empty string', async () => {
    const result = await verifyPassword('SomePassword1!', '');
    expect(result).toBe(false);
  });

  test('returns false when plain is null', async () => {
    const hash = await hashPassword('SomePassword1!');
    const result = await verifyPassword(null, hash);
    expect(result).toBe(false);
  });

  test('returns false when hash is null', async () => {
    const result = await verifyPassword('SomePassword1!', null);
    expect(result).toBe(false);
  });
});
