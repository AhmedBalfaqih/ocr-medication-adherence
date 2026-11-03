import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { NextRequest } from 'next/server';
import { POST as login } from '@/app/api/auth/login/route';
import { prisma } from '@/lib/prisma';

export function makeRequest(
  path,
  { method = 'GET', body, cookie, origin = process.env.APP_ORIGIN } = {},
) {
  const headers = { origin };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return new NextRequest(new URL(path, process.env.APP_ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function withParams(params) {
  return { params: Promise.resolve(params) };
}

// Logs in through the real handler and returns the cookie for later requests
export async function loginAs(email, password) {
  const response = await login(
    makeRequest('/api/auth/login', { method: 'POST', body: { email, password } }),
  );
  const token = response.cookies.get('session')?.value;
  if (!token) throw new Error(`Login failed with status ${response.status}.`);
  return `session=${token}`;
}

// A new active patient with a unique email, so test files never share users
export async function createPatient() {
  const email = `patient-${randomUUID()}@example.com`;
  const password = 'test-password-123';
  // A low cost keeps tests fast; bcrypt.compare works with any cost
  const passwordHash = await bcrypt.hash(password, 4);
  const user = await prisma.user.create({
    data: { name: 'Test Patient', email, passwordHash, role: 'PATIENT', status: 'ACTIVE' },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  return { user, email, password };
}

// Straight to the database, so a test sets up only what it checks
export async function createMedicine(userId, fields = {}) {
  return prisma.medicine.create({
    data: { userId, name: 'Test Medicine', dosage: '500 mg', ...fields },
  });
}

// A daily 08:00 schedule from today; a @db.Date is stored as UTC midnight
export async function createSchedule(medicineId, fields = {}) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const data = { medicineId, time: '08:00', frequency: 'DAILY', startDate: today, ...fields };
  // Saved at UTC midnight of its start date, so the tick counts every dose after that moment
  return prisma.schedule.create({ data: { updatedAt: data.startDate, ...data } });
}

// A reminder the tick has already sent, due now unless the test says otherwise
export async function createReminder(scheduleId, fields = {}) {
  const now = new Date();
  return prisma.reminder.create({
    data: { scheduleId, reminderTime: now, status: 'SENT', sentAt: now, ...fields },
  });
}

// A scan that is not yet linked to a medicine, with made up label text
export async function createOcrScan(userId, fields = {}) {
  return prisma.oCRScan.create({
    data: { userId, extractedText: 'TESTAMOL 500 mg\nTake one tablet twice a day', ...fields },
  });
}
