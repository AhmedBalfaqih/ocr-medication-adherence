import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import pg from 'pg';

export default async function setup() {
  config({ path: '.env.test', quiet: true });
  // Refuse to run against anything but the test schema
  if (process.env.DATABASE_SCHEMA !== 'test' || !process.env.DIRECT_URL?.includes('schema=test')) {
    throw new Error('.env.test must point at the test schema.');
  }
  execSync('npx prisma@7 migrate deploy', { stdio: 'inherit', env: process.env });

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    "select tablename from pg_tables where schemaname = 'test' and tablename <> '_prisma_migrations'",
  );
  const tables = rows.map((row) => `"test"."${row.tablename}"`).join(', ');
  if (tables) await client.query(`truncate table ${tables} restart identity cascade`);
  await client.end();

  // The demo patient and admin from .env.test
  execSync('node prisma/seed.js', { stdio: 'inherit', env: process.env });
}
