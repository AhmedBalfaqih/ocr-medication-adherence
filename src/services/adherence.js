import { prisma } from '@/lib/prisma';

function countLogs(userId, status) {
  return prisma.doseLog.count({
    where: { status, schedule: { medicine: { userId } } },
  });
}

// FR12 Totals from DoseLog only; the rate is taken / (taken + missed + skipped)
export async function getTotals(userId) {
  const [taken, missed, skipped] = await Promise.all([
    countLogs(userId, 'TAKEN'),
    countLogs(userId, 'MISSED'),
    countLogs(userId, 'SKIPPED'),
  ]);
  const logged = taken + missed + skipped;
  // No rate before the first dose is logged, so a new patient never sees 0%
  if (logged === 0) return { taken, missed, skipped, rate: null };
  // Rounded down, so 100% means all were taken; times 100 first so 29 of 100 gives 29
  const rate = Math.floor((taken * 100) / logged);
  return { taken, missed, skipped, rate };
}

// FR12 DIR5 The patient's latest dose logs, newest first
export async function getHistory(userId, limit = 30) {
  const logs = await prisma.doseLog.findMany({
    where: { schedule: { medicine: { userId } } },
    orderBy: [{ date: 'desc' }, { time: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      status: true,
      date: true,
      time: true,
      schedule: { select: { medicine: { select: { name: true, dosage: true } } } },
    },
  });

  return logs.map((log) => ({
    id: log.id,
    medicineName: log.schedule.medicine.name,
    dosage: log.schedule.medicine.dosage,
    // A @db.Date comes back as UTC midnight, so this is the patient's local date
    date: log.date.toISOString().slice(0, 10),
    time: log.time,
    status: log.status,
  }));
}
