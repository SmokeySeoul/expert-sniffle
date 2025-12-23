import prisma from '../src/prisma';

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Notification","NotificationPreference","AuditLog","Session","Subscription","Device","User" RESTART IDENTITY CASCADE;',
  );
}

export { prisma };
