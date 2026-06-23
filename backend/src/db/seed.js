import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db/queries/base.js';
import { hashPassword } from '../utils/password.js';

const ADMIN_EMAIL = 'admin@tailorstaq.com';
const ADMIN_PASSWORD = 'Admin123!';

export async function seed() {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  await query(
    `INSERT INTO users (full_name, email, password_hash, role, account_status, failed_attempts)
     VALUES ($1, $2, $3, 'platform_admin', 'active', 0)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           account_status = 'active',
           failed_attempts = 0,
           locked_until = NULL`,
    ['Platform Admin', ADMIN_EMAIL, passwordHash],
  );

  console.log('Admin user ready:');
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log('\nLogin at /admin/approvals to approve tailor registrations.');
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  seed().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
}
