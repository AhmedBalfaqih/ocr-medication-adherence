import { prisma } from '@/lib/prisma';

// FR15 Save a system event; messages never hold patient data, emails or passwords
export async function recordEvent(type, message, userId = null) {
  try {
    await prisma.systemEvent.create({ data: { type, message, userId } });
  } catch (error) {
    // A lost event must never break the request; log only the error kind (DR5)
    console.error('Event not saved:', error.name);
  }
}
