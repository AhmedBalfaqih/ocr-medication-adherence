import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { registerInput } from '../src/lib/schemas/auth.js';

const REQUIRED = [
  'DATABASE_URL',
  'SEED_PATIENT_EMAIL',
  'SEED_PATIENT_PASSWORD',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
];

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Seed stopped. Please set ${missing.join(', ')}.`);
  process.exit(1);
}

// The demo logins follow the same rules as the register form
function readAccount(name, role, emailName, passwordName) {
  const result = registerInput.safeParse({
    name,
    email: process.env[emailName],
    password: process.env[passwordName],
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    const variable = issue.path[0] === 'email' ? emailName : passwordName;
    console.error(`Seed stopped. ${variable} is not valid. ${issue.message}`);
    process.exit(1);
  }
  return { ...result.data, role, emailName };
}

// Fictional demo accounts only, never a real person (DR5)
const accounts = [
  readAccount('Demo Patient', 'PATIENT', 'SEED_PATIENT_EMAIL', 'SEED_PATIENT_PASSWORD'),
  readAccount('Site Admin', 'ADMIN', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD'),
];

const schema = process.env.DATABASE_SCHEMA;
const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  schema ? { schema } : undefined,
);
const prisma = new PrismaClient({ adapter });

// An email someone registered first must never be given another role
async function findRoleConflict() {
  for (const account of accounts) {
    const existing = await prisma.user.findUnique({
      where: { email: account.email },
      select: { role: true },
    });
    if (existing && existing.role !== account.role) return account.emailName;
  }
  return null;
}

async function seed() {
  const conflict = await findRoleConflict();
  if (conflict) {
    console.error(`Seed stopped. ${conflict} belongs to an account with another role.`);
    process.exitCode = 1;
    return;
  }
  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    // Running the seed again resets the name, password and status, never the role
    await prisma.user.upsert({
      where: { email: account.email },
      update: { name: account.name, passwordHash, status: 'ACTIVE' },
      create: { name: account.name, email: account.email, passwordHash, role: account.role },
      select: { id: true },
    });
  }
  console.log(`Seeded ${accounts.length} accounts`);
}

try {
  await seed();
} catch (error) {
  // Show only the error kind, never emails, passwords or connection details
  const reason = error.meta?.driverAdapterError?.cause?.kind ?? error.code ?? error.name;
  console.error(`Seed failed: ${reason}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
