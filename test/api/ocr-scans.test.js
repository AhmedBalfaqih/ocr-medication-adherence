import { NextRequest } from 'next/server';
import { afterAll, expect, test } from 'vitest';
import { POST as scanRoute } from '@/app/api/ocr-scans/route';
import { prisma } from '@/lib/prisma';
import { createMedicine, createPatient, loginAs, makeRequest } from '../helpers';

const LABEL_TEXT = 'TESTAMOL 500 mg\nTake one tablet twice a day';
const NO_TEXT = {
  error: { code: 'VALIDATION', message: 'We could not read any text on this label.' },
};
const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You cannot do that.' } };
const BAD_ORIGIN = { error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' } };

afterAll(async () => {
  await prisma.$disconnect();
});

function saveScan(body, cookie, origin) {
  return scanRoute(makeRequest('/api/ocr-scans', { method: 'POST', body, cookie, origin }));
}

async function loggedInPatient() {
  const patient = await createPatient();
  const cookie = await loginAs(patient.email, patient.password);
  return { ...patient, cookie };
}

function scansOf(userId) {
  return prisma.oCRScan.findMany({ where: { userId } });
}

test('a patient saves the label text and gets back only the scan id', async () => {
  const { user, cookie } = await loggedInPatient();

  const response = await saveScan({ extractedText: `  ${LABEL_TEXT}  ` }, cookie);
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body).toEqual({ id: expect.any(Number) });

  const scan = await prisma.oCRScan.findUnique({ where: { id: body.id } });
  expect(scan).toEqual({
    id: body.id,
    userId: user.id,
    medicineId: null,
    imagePath: null,
    extractedText: LABEL_TEXT,
    confirmedText: null,
    createdAt: expect.any(Date),
  });
});

test('an image, image path, user id or medicine id in the body is ignored', async () => {
  const patientA = await loggedInPatient();
  const patientB = await createPatient();
  const medicine = await createMedicine(patientA.user.id);

  const response = await saveScan(
    {
      extractedText: LABEL_TEXT,
      image: 'data:image/png;base64,AAAA',
      imagePath: '/uploads/label.png',
      userId: patientB.user.id,
      medicineId: medicine.id,
      confirmedText: 'Name: Changed',
    },
    patientA.cookie,
  );
  expect(response.status).toBe(201);
  const { id } = await response.json();

  const scan = await prisma.oCRScan.findUnique({ where: { id } });
  expect(scan).toMatchObject({
    userId: patientA.user.id,
    medicineId: null,
    imagePath: null,
    extractedText: LABEL_TEXT,
    confirmedText: null,
  });
  expect(await scansOf(patientB.user.id)).toEqual([]);
});

test('empty, blank or missing label text gets 400 and nothing is saved', async () => {
  const { user, cookie } = await loggedInPatient();

  for (const body of [{}, { extractedText: '' }, { extractedText: '  \n  ' }]) {
    const response = await saveScan(body, cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(NO_TEXT);
  }
  expect(await scansOf(user.id)).toEqual([]);
});

test('saving a scan needs a session', async () => {
  const before = await prisma.oCRScan.count();

  const response = await saveScan({ extractedText: LABEL_TEXT });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual(UNAUTHORIZED);
  expect(await prisma.oCRScan.count()).toBe(before);
});

test('the admin gets 403 when saving a scan', async () => {
  const adminCookie = await loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const before = await prisma.oCRScan.count();

  const response = await saveScan({ extractedText: LABEL_TEXT }, adminCookie);
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual(FORBIDDEN);
  expect(await prisma.oCRScan.count()).toBe(before);
});

test('a scan from another origin gets 403 and nothing is saved', async () => {
  const { user, cookie } = await loggedInPatient();

  const response = await saveScan(
    { extractedText: LABEL_TEXT },
    cookie,
    'https://other-site.example',
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual(BAD_ORIGIN);
  expect(await scansOf(user.id)).toEqual([]);
});

test('a scan that is not JSON gets 415', async () => {
  const request = new NextRequest(new URL('/api/ocr-scans', process.env.APP_ORIGIN), {
    method: 'POST',
    headers: { origin: process.env.APP_ORIGIN, 'content-type': 'text/plain' },
    body: LABEL_TEXT,
  });

  const response = await scanRoute(request);
  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({ error: { code: 'JSON_ONLY', message: 'Send JSON.' } });
});
