import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';
import { hashPassword } from '../utils/password.js';

const { Pool } = pg;

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
});

async function seed() {
  const adminEmail = 'admin@tailorstaq.com';
  const adminPassword = 'Admin123!';

  const passwordHash = await hashPassword(adminPassword);

  await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role, account_status, failed_attempts)
     VALUES ($1, $2, $3, 'platform_admin', 'active', 0)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           account_status = 'active',
           failed_attempts = 0,
           locked_until = NULL`,
    ['Platform Admin', adminEmail, passwordHash],
  );

  console.log('Admin user ready:');
  console.log(`  Email:    ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);
  console.log('\nLogin at /admin/approvals to approve tailor registrations.');
  await pool.end();
}

export { seed };

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  seed().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
}
