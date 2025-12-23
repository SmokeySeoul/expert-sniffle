import prisma from '../src/prisma';

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AIPatch","AIProposal","AIActionLog","Notification","NotificationPreference","AuditLog","Session","Subscription","Device","User" RESTART IDENTITY CASCADE;',
  );
}

export { prisma };
