/**
 * Database migration runner.
 *
 * Usage:
 *   node src/db/migrate.js
 *
 * Reads all *.sql files from src/db/migrations/ in lexicographic order,
 * tracks applied migrations in a `schema_migrations` table, and runs
 * only the ones that have not yet been applied.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function runMigrations() {
  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations. Database is up to date.');
      return;
    }

    for (const filename of pending) {
      const filePath = join(MIGRATIONS_DIR, filename);
      const sql = await readFile(filePath, 'utf8');

      console.log(`Applying migration: ${filename}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`  ✓ ${filename} applied successfully`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${filename} failed: ${err.message}`);
        throw err;
      }
    }

    console.log(`\nMigrations complete. Applied ${pending.length} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration runner failed:', err.message);
  process.exit(1);
});
