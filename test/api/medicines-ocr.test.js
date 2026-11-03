import { afterAll, expect, test } from 'vitest';
import { POST as createRoute } from '@/app/api/medicines/route';
import { DELETE as deleteRoute } from '@/app/api/medicines/[id]/route';
import { prisma } from '@/lib/prisma';
import { createOcrScan, createPatient, loginAs, makeRequest, withParams } from '../helpers';

const NOT_CONFIRMED = {
  error: { code: 'VALIDATION', message: 'Please confirm the scanned details before saving.' },
};
const SCAN_NOT_USABLE = {
  error: { code: 'VALIDATION', message: 'This scan cannot be used. Please scan the label again.' },
};
const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You cannot do that.' } };
const BAD_ORIGIN = { error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' } };

afterAll(async () => {
  await prisma.$disconnect();
});

function addMedicine(body, cookie, origin) {
  return createRoute(makeRequest('/api/medicines', { method: 'POST', body, cookie, origin }));
}

// What the review form sends after the patient presses Confirm and save
function confirmedBody(scanId, fields = {}) {
  return {
    name: 'Testamol',
    dosage: '500 mg',
    notes: 'Take one tablet twice a day',
    source: 'OCR',
    ocrScanId: scanId,
    confirmed: true,
    ...fields,
  };
}

async function loggedInPatient() {
  const patient = await createPatient();
  const cookie = await loginAs(patient.email, patient.password);
  return { ...patient, cookie };
}

function storedScan(id) {
  return prisma.oCRScan.findUnique({ where: { id } });
}

function medicineCount(userId) {
  return prisma.medicine.count({ where: { userId } });
}

test('a confirmed scan saves an OCR medicine and links the scan to it', async () => {
  const { user, cookie } = await loggedInPatient();
  const scan = await createOcrScan(user.id);

  // The patient corrected the name and the dose before confirming
  const response = await addMedicine(
    confirmedBody(scan.id, { name: '  Testamol Plus  ', dosage: ' 250 mg ' }),
    cookie,
  );
  expect(response.status).toBe(201);
  const medicine = await response.json();
  expect(medicine).toEqual({
    id: expect.any(Number),
    name: 'Testamol Plus',
    dosage: '250 mg',
    notes: 'Take one tablet twice a day',
    source: 'OCR',
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });

  expect(await prisma.medicine.findUnique({ where: { id: medicine.id } })).toMatchObject({
    userId: user.id,
    name: 'Testamol Plus',
    dosage: '250 mg',
    source: 'OCR',
  });
  expect(await storedScan(scan.id)).toEqual({
    ...scan,
    medicineId: medicine.id,
    confirmedText: 'Name: Testamol Plus\nDose: 250 mg\nNotes: Take one tablet twice a day',
  });
});

test('a confirmed scan with blank notes saves no notes', async () => {
  const { user, cookie } = await loggedInPatient();
  const scan = await createOcrScan(user.id);

  const response = await addMedicine(confirmedBody(scan.id, { notes: '  ' }), cookie);
  expect(response.status).toBe(201);
  const medicine = await response.json();
  expect(medicine).toMatchObject({ notes: null, source: 'OCR' });
  expect(await storedScan(scan.id)).toMatchObject({
    medicineId: medicine.id,
    confirmedText: 'Name: Testamol\nDose: 500 mg',
    extractedText: scan.extractedText,
  });
});

test('an OCR medicine without confirmed true gets 400 and nothing changes', async () => {
  const { user, cookie } = await loggedInPatient();
  const scan = await createOcrScan(user.id);

  for (const confirmed of [undefined, false, 'true']) {
    const response = await addMedicine(confirmedBody(scan.id, { confirmed }), cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(NOT_CONFIRMED);
  }
  expect(await medicineCount(user.id)).toBe(0);
  expect(await storedScan(scan.id)).toEqual(scan);
});

test('an OCR medicine without a scan id gets 400 and nothing is saved', async () => {
  const { user, cookie } = await loggedInPatient();
  const scan = await createOcrScan(user.id);

  for (const ocrScanId of [undefined, null, String(scan.id)]) {
    const response = await addMedicine(confirmedBody(ocrScanId), cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(NOT_CONFIRMED);
  }
  expect(await medicineCount(user.id)).toBe(0);
  expect(await storedScan(scan.id)).toEqual(scan);
});

test("another patient's scan or a scan that does not exist gets 400", async () => {
  const patientA = await createPatient();
  const patientB = await loggedInPatient();
  const scanA = await createOcrScan(patientA.user.id);

  for (const scanId of [scanA.id, 2147483647]) {
    const response = await addMedicine(confirmedBody(scanId), patientB.cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(SCAN_NOT_USABLE);
  }
  expect(await storedScan(scanA.id)).toEqual(scanA);
  expect(await medicineCount(patientA.user.id)).toBe(0);
  expect(await medicineCount(patientB.user.id)).toBe(0);
});

test('a scan already used for a medicine gets 400 the second time', async () => {
  const { user, cookie } = await loggedInPatient();
  const scan = await createOcrScan(user.id);

  const first = await addMedicine(confirmedBody(scan.id), cookie);
  expect(first.status).toBe(201);
  const medicine = await first.json();
  const usedScan = await storedScan(scan.id);

  const second = await addMedicine(confirmedBody(scan.id, { name: 'Other Tablet' }), cookie);
  expect(second.status).toBe(400);
  expect(await second.json()).toEqual(SCAN_NOT_USABLE);

  expect(await medicineCount(user.id)).toBe(1);
  expect(usedScan.medicineId).toBe(medicine.id);
  expect(await storedScan(scan.id)).toEqual(usedScan);
});

test('a scan stays used after its medicine is deleted', async () => {
  const { user, cookie } = await loggedInPatient();
  const scan = await createOcrScan(user.id);

  const first = await addMedicine(confirmedBody(scan.id), cookie);
  expect(first.status).toBe(201);
  const medicine = await first.json();

  const deleted = await deleteRoute(
    makeRequest(`/api/medicines/${medicine.id}`, { method: 'DELETE', cookie }),
    withParams({ id: String(medicine.id) }),
  );
  expect(deleted.status).toBe(204);
  const scanAfterDelete = await storedScan(scan.id);
  expect(scanAfterDelete).toMatchObject({
    medicineId: null,
    confirmedText: 'Name: Testamol\nDose: 500 mg\nNotes: Take one tablet twice a day',
  });

  const again = await addMedicine(confirmedBody(scan.id, { name: 'Other Tablet' }), cookie);
  expect(again.status).toBe(400);
  expect(await again.json()).toEqual(SCAN_NOT_USABLE);
  expect(await medicineCount(user.id)).toBe(0);
  expect(await storedScan(scan.id)).toEqual(scanAfterDelete);
});

test('two confirms of one scan at the same time save only one medicine', async () => {
  const { user, cookie } = await loggedInPatient();
  const scan = await createOcrScan(user.id);

  const responses = await Promise.all([
    addMedicine(confirmedBody(scan.id, { name: 'First Tablet' }), cookie),
    addMedicine(confirmedBody(scan.id, { name: 'Second Tablet' }), cookie),
  ]);
  const statuses = responses.map((response) => response.status).sort();
  expect(statuses).toEqual([201, 400]);

  const saved = responses.find((response) => response.status === 201);
  const medicine = await saved.json();
  expect(await medicineCount(user.id)).toBe(1);
  expect(await storedScan(scan.id)).toMatchObject({
    medicineId: medicine.id,
    confirmedText: `Name: ${medicine.name}\nDose: 500 mg\nNotes: Take one tablet twice a day`,
  });
});

test('a body without source OCR is still saved as a manual medicine', async () => {
  const { user, cookie } = await loggedInPatient();
  const scan = await createOcrScan(user.id);

  const response = await addMedicine(
    { name: ' Paracetamol ', dosage: '500 mg', ocrScanId: scan.id, confirmed: true },
    cookie,
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    id: expect.any(Number),
    name: 'Paracetamol',
    dosage: '500 mg',
    notes: null,
    source: 'MANUAL',
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });

  const manual = await addMedicine(
    { name: 'Ibuprofen', dosage: '200 mg', source: 'MANUAL' },
    cookie,
  );
  expect(manual.status).toBe(201);
  expect(await manual.json()).toMatchObject({ source: 'MANUAL' });

  expect(await medicineCount(user.id)).toBe(2);
  expect(await storedScan(scan.id)).toEqual(scan);
});

test('a lowercase ocr source gets 400 and nothing is saved', async () => {
  const { user, cookie } = await loggedInPatient();
  const scan = await createOcrScan(user.id);

  const response = await addMedicine(confirmedBody(scan.id, { source: 'ocr' }), cookie);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual(NOT_CONFIRMED);
  expect(await medicineCount(user.id)).toBe(0);
  expect(await storedScan(scan.id)).toEqual(scan);
});

test('a confirmed scan still needs a patient session and the app origin', async () => {
  const patient = await loggedInPatient();
  const scan = await createOcrScan(patient.user.id);
  const adminCookie = await loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  const noSession = await addMedicine(confirmedBody(scan.id));
  expect(noSession.status).toBe(401);
  expect(await noSession.json()).toEqual(UNAUTHORIZED);

  const admin = await addMedicine(confirmedBody(scan.id), adminCookie);
  expect(admin.status).toBe(403);
  expect(await admin.json()).toEqual(FORBIDDEN);

  const otherOrigin = await addMedicine(
    confirmedBody(scan.id),
    patient.cookie,
    'https://other-site.example',
  );
  expect(otherOrigin.status).toBe(403);
  expect(await otherOrigin.json()).toEqual(BAD_ORIGIN);

  expect(await medicineCount(patient.user.id)).toBe(0);
  expect(await storedScan(scan.id)).toEqual(scan);
});
