import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

function createClient() {
  const schema = process.env.DATABASE_SCHEMA;
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    schema ? { schema } : undefined,
  );
  return new PrismaClient({ adapter });
}

// One client per server instance; dev reloads reuse it
export const prisma = globalThis.prisma ?? createClient();
if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;
