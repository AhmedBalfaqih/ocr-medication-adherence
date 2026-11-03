import { config } from 'dotenv';

// Test files run in their own process, so they load .env.test too
config({ path: '.env.test', quiet: true });
if (process.env.DATABASE_SCHEMA !== 'test') {
  throw new Error('.env.test must point at the test schema.');
}
