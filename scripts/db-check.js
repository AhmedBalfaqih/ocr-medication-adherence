import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

const connectionString = process.env.DATABASE_URL;
const schema = process.env.DATABASE_SCHEMA;

if (!connectionString) {
  console.error('Database check failed: DATABASE_URL is not set.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
const prisma = new PrismaClient({ adapter });

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('Database ok');
} catch (error) {
  // Show only the error kind, never the connection details
  const reason = error.meta?.driverAdapterError?.cause?.kind ?? error.code ?? error.name;
  console.error(`Database check failed: ${reason}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
