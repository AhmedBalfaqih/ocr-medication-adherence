import { NextRequest } from 'next/server';
import { afterAll, expect, test } from 'vitest';
import { GET as listRoute, POST as createRoute } from '@/app/api/medicines/route';
import {
  DELETE as deleteRoute,
  GET as readRoute,
  PATCH as updateRoute,
} from '@/app/api/medicines/[id]/route';
import { prisma } from '@/lib/prisma';
import { createMedicine, createPatient, loginAs, makeRequest, withParams } from '../helpers';

const OTHER_ORIGIN = 'https://other-site.example';
const MEDICINE_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Medicine not found.' } };
const BAD_ID = { error: { code: 'NOT_FOUND', message: 'Not found.' } };
const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You cannot do that.' } };
const BAD_ORIGIN = { error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' } };

afterAll(async () => {
  await prisma.$disconnect();
});

function listMedicines(cookie) {
  return listRoute(makeRequest('/api/medicines', { cookie }));
}

function addMedicine(body, cookie, origin) {
  return createRoute(makeRequest('/api/medicines', { method: 'POST', body, cookie, origin }));
}

function readMedicine(id, cookie) {
  return readRoute(makeRequest(`/api/medicines/${id}`, { cookie }), withParams({ id: String(id) }));
}

function updateMedicine(id, body, cookie, origin) {
  return updateRoute(
    makeRequest(`/api/medicines/${id}`, { method: 'PATCH', body, cookie, origin }),
    withParams({ id: String(id) }),
  );
}

function deleteMedicine(id, cookie, origin) {
  return deleteRoute(
    makeRequest(`/api/medicines/${id}`, { method: 'DELETE', cookie, origin }),
    withParams({ id: String(id) }),
  );
}

function textRequest(path, method) {
  return new NextRequest(new URL(path, process.env.APP_ORIGIN), {
    method,
    headers: { origin: process.env.APP_ORIGIN, 'content-type': 'text/plain' },
    body: 'name=Paracetamol',
  });
}

async function loggedInPatient() {
  const patient = await createPatient();
  const cookie = await loginAs(patient.email, patient.password);
  return { ...patient, cookie };
}

function storedMedicine(id) {
  return prisma.medicine.findUnique({ where: { id } });
}

test('a patient adds a medicine and gets it back with 201', async () => {
  const { user, cookie } = await loggedInPatient();

  const response = await addMedicine(
    { name: '  Paracetamol  ', dosage: ' 500 mg ', notes: '  After food  ' },
    cookie,
  );
  expect(response.status).toBe(201);
  const medicine = await response.json();
  expect(medicine).toEqual({
    id: expect.any(Number),
    name: 'Paracetamol',
    dosage: '500 mg',
    notes: 'After food',
    source: 'MANUAL',
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });

  const stored = await storedMedicine(medicine.id);
  expect(stored).toMatchObject({ userId: user.id, name: 'Paracetamol', source: 'MANUAL' });
});

test('blank or missing notes are saved as null', async () => {
  const { cookie } = await loggedInPatient();

  const blank = await addMedicine({ name: 'Paracetamol', dosage: '500 mg', notes: '   ' }, cookie);
  expect(blank.status).toBe(201);
  const blankMedicine = await blank.json();
  expect(blankMedicine.notes).toBeNull();
  expect((await storedMedicine(blankMedicine.id)).notes).toBeNull();

  const missing = await addMedicine({ name: 'Ibuprofen', dosage: '200 mg' }, cookie);
  expect(missing.status).toBe(201);
  expect((await missing.json()).notes).toBeNull();
});

test('the list holds only my medicines, newest first', async () => {
  const patientA = await loggedInPatient();
  const patientB = await createPatient();
  // Saved first but dated later, so the order must come from createdAt
  const newer = await createMedicine(patientA.user.id, {
    name: 'Evening Tablet',
    createdAt: new Date('2026-10-02T09:00:00Z'),
  });
  const older = await createMedicine(patientA.user.id, {
    name: 'Morning Tablet',
    createdAt: new Date('2026-10-01T09:00:00Z'),
  });
  await createMedicine(patientB.user.id, { name: 'Other Tablet' });

  const response = await listMedicines(patientA.cookie);
  expect(response.status).toBe(200);
  const medicines = await response.json();
  expect(medicines.map((medicine) => medicine.id)).toEqual([newer.id, older.id]);
  expect(medicines[0]).toEqual({
    id: newer.id,
    name: 'Evening Tablet',
    dosage: '500 mg',
    notes: null,
    source: 'MANUAL',
    createdAt: '2026-10-02T09:00:00.000Z',
    updatedAt: newer.updatedAt.toISOString(),
  });
});

test('a patient with no medicines gets an empty list', async () => {
  const { cookie } = await loggedInPatient();

  const response = await listMedicines(cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
});

test('a patient reads, edits and deletes their own medicine', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id, { notes: 'With water' });

  const read = await readMedicine(medicine.id, cookie);
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual({
    id: medicine.id,
    name: 'Test Medicine',
    dosage: '500 mg',
    notes: 'With water',
    source: 'MANUAL',
    createdAt: medicine.createdAt.toISOString(),
    updatedAt: medicine.updatedAt.toISOString(),
  });

  const updated = await updateMedicine(
    medicine.id,
    { name: ' Amoxicillin ', dosage: '250 mg', notes: 'After breakfast' },
    cookie,
  );
  expect(updated.status).toBe(200);
  expect(await updated.json()).toMatchObject({
    id: medicine.id,
    name: 'Amoxicillin',
    dosage: '250 mg',
    notes: 'After breakfast',
    source: 'MANUAL',
  });
  expect(await storedMedicine(medicine.id)).toMatchObject({
    userId: user.id,
    name: 'Amoxicillin',
    dosage: '250 mg',
    notes: 'After breakfast',
  });

  const deleted = await deleteMedicine(medicine.id, cookie);
  expect(deleted.status).toBe(204);
  expect(await deleted.text()).toBe('');
  expect(await storedMedicine(medicine.id)).toBeNull();

  const readAgain = await readMedicine(medicine.id, cookie);
  expect(readAgain.status).toBe(404);
  expect(await readAgain.json()).toEqual(MEDICINE_NOT_FOUND);

  const deleteAgain = await deleteMedicine(medicine.id, cookie);
  expect(deleteAgain.status).toBe(404);
  expect(await deleteAgain.json()).toEqual(MEDICINE_NOT_FOUND);
});

test('an edit without notes keeps them and blank notes clear them', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id, { notes: 'With water' });

  const kept = await updateMedicine(medicine.id, { name: 'Test Medicine', dosage: '1 g' }, cookie);
  expect(kept.status).toBe(200);
  expect(await kept.json()).toMatchObject({ dosage: '1 g', notes: 'With water' });

  const cleared = await updateMedicine(
    medicine.id,
    { name: 'Test Medicine', dosage: '1 g', notes: '' },
    cookie,
  );
  expect(cleared.status).toBe(200);
  expect(await cleared.json()).toMatchObject({ notes: null });
  expect((await storedMedicine(medicine.id)).notes).toBeNull();
});

test('deleting a medicine also removes its schedules, reminders and dose logs', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await prisma.schedule.create({
    data: { medicineId: medicine.id, time: '08:00', startDate: new Date('2026-11-01') },
  });
  const reminder = await prisma.reminder.create({
    data: { scheduleId: schedule.id, reminderTime: new Date('2026-11-01T06:00:00Z') },
  });
  await prisma.doseLog.create({
    data: {
      scheduleId: schedule.id,
      reminderId: reminder.id,
      status: 'TAKEN',
      date: new Date('2026-11-01'),
      time: '08:00',
    },
  });

  const response = await deleteMedicine(medicine.id, cookie);
  expect(response.status).toBe(204);
  expect(await prisma.schedule.count({ where: { id: schedule.id } })).toBe(0);
  expect(await prisma.reminder.count({ where: { id: reminder.id } })).toBe(0);
  expect(await prisma.doseLog.count({ where: { reminderId: reminder.id } })).toBe(0);
});

test('another patient gets 404 on my medicine and it stays the same', async () => {
  const patientA = await createPatient();
  const patientB = await loggedInPatient();
  const medicine = await createMedicine(patientA.user.id, { notes: 'With water' });

  const responses = [
    await readMedicine(medicine.id, patientB.cookie),
    await updateMedicine(
      medicine.id,
      { name: 'Changed', dosage: '1 g', notes: 'Changed' },
      patientB.cookie,
    ),
    await deleteMedicine(medicine.id, patientB.cookie),
  ];
  for (const response of responses) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(MEDICINE_NOT_FOUND);
  }
  expect(await storedMedicine(medicine.id)).toEqual(medicine);

  const listB = await listMedicines(patientB.cookie);
  expect(await listB.json()).toEqual([]);
});

test('an id that is not a number or is too large gets 404', async () => {
  const { cookie } = await loggedInPatient();

  for (const id of ['abc', '1.5', '2147483648']) {
    const responses = [
      await readMedicine(id, cookie),
      await updateMedicine(id, { name: 'Paracetamol', dosage: '500 mg' }, cookie),
      await deleteMedicine(id, cookie),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(BAD_ID);
    }
  }
});

test('every medicine route needs a session', async () => {
  const { user } = await createPatient();
  const medicine = await createMedicine(user.id);

  const responses = [
    await listMedicines(),
    await addMedicine({ name: 'Paracetamol', dosage: '500 mg' }),
    await readMedicine(medicine.id),
    await updateMedicine(medicine.id, { name: 'Changed', dosage: '1 g' }),
    await deleteMedicine(medicine.id),
  ];
  for (const response of responses) {
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(UNAUTHORIZED);
  }
  expect(await storedMedicine(medicine.id)).toEqual(medicine);
});

test('the admin gets 403 on every medicine route', async () => {
  const adminCookie = await loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const { user } = await createPatient();
  const medicine = await createMedicine(user.id);

  const responses = [
    await listMedicines(adminCookie),
    await addMedicine({ name: 'Paracetamol', dosage: '500 mg' }, adminCookie),
    await readMedicine(medicine.id, adminCookie),
    await updateMedicine(medicine.id, { name: 'Changed', dosage: '1 g' }, adminCookie),
    await deleteMedicine(medicine.id, adminCookie),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN);
  }
  expect(await storedMedicine(medicine.id)).toEqual(medicine);

  const admin = await prisma.user.findUnique({
    where: { email: process.env.SEED_ADMIN_EMAIL.toLowerCase() },
    select: { id: true },
  });
  expect(await prisma.medicine.count({ where: { userId: admin.id } })).toBe(0);
});

test('a missing name or dose gets 400 with a plain message', async () => {
  const { user, cookie } = await loggedInPatient();

  const noName = await addMedicine({ dosage: '500 mg' }, cookie);
  expect(noName.status).toBe(400);
  expect(await noName.json()).toEqual({
    error: { code: 'VALIDATION', message: 'Please enter the medicine name.' },
  });

  const blankDose = await addMedicine({ name: 'Paracetamol', dosage: '   ' }, cookie);
  expect(blankDose.status).toBe(400);
  expect(await blankDose.json()).toEqual({
    error: { code: 'VALIDATION', message: 'Please enter the dose, for example 500 mg.' },
  });
  expect(await prisma.medicine.count({ where: { userId: user.id } })).toBe(0);

  const medicine = await createMedicine(user.id);
  const badEdit = await updateMedicine(medicine.id, { name: '', dosage: '1 g' }, cookie);
  expect(badEdit.status).toBe(400);
  expect(await badEdit.json()).toEqual({
    error: { code: 'VALIDATION', message: 'Please enter the medicine name.' },
  });
  expect(await storedMedicine(medicine.id)).toEqual(medicine);
});

test('a user id or medicine id in the body is ignored', async () => {
  const patientA = await loggedInPatient();
  const patientB = await createPatient();

  const response = await addMedicine(
    { name: 'Paracetamol', dosage: '500 mg', id: 999999, userId: patientB.user.id },
    patientA.cookie,
  );
  expect(response.status).toBe(201);
  const medicine = await response.json();
  expect(medicine.id).not.toBe(999999);
  expect(await storedMedicine(medicine.id)).toMatchObject({ userId: patientA.user.id });
  expect(await prisma.medicine.count({ where: { userId: patientB.user.id } })).toBe(0);

  const edited = await updateMedicine(
    medicine.id,
    { name: 'Paracetamol', dosage: '1 g', userId: patientB.user.id },
    patientA.cookie,
  );
  expect(edited.status).toBe(200);
  expect(await storedMedicine(medicine.id)).toMatchObject({
    userId: patientA.user.id,
    dosage: '1 g',
  });
  expect(await prisma.medicine.count({ where: { userId: patientB.user.id } })).toBe(0);
});

test('an OCR medicine without the confirm step gets 400 and nothing is saved', async () => {
  const { user, cookie } = await loggedInPatient();
  const refused = {
    error: { code: 'VALIDATION', message: 'Please confirm the scanned details before saving.' },
  };

  const added = await addMedicine({ name: 'Paracetamol', dosage: '500 mg', source: 'OCR' }, cookie);
  expect(added.status).toBe(400);
  expect(await added.json()).toEqual(refused);
  expect(await prisma.medicine.count({ where: { userId: user.id } })).toBe(0);

  const medicine = await createMedicine(user.id);
  const edited = await updateMedicine(
    medicine.id,
    { name: 'Paracetamol', dosage: '1 g', source: 'OCR' },
    cookie,
  );
  expect(edited.status).toBe(400);
  expect(await edited.json()).toEqual(refused);
  expect(await storedMedicine(medicine.id)).toEqual(medicine);
});

test('a medicine change from another origin gets 403 and changes nothing', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);

  const responses = [
    await addMedicine({ name: 'Paracetamol', dosage: '500 mg' }, cookie, OTHER_ORIGIN),
    await updateMedicine(medicine.id, { name: 'Changed', dosage: '1 g' }, cookie, OTHER_ORIGIN),
    await deleteMedicine(medicine.id, cookie, OTHER_ORIGIN),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(BAD_ORIGIN);
  }
  expect(await storedMedicine(medicine.id)).toEqual(medicine);
  expect(await prisma.medicine.count({ where: { userId: user.id } })).toBe(1);
});

test('a medicine add or edit that is not JSON gets 415', async () => {
  const responses = [
    await createRoute(textRequest('/api/medicines', 'POST')),
    await updateRoute(textRequest('/api/medicines/1', 'PATCH'), withParams({ id: '1' })),
  ];
  for (const response of responses) {
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: { code: 'JSON_ONLY', message: 'Send JSON.' } });
  }
});
