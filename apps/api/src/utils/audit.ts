import { prisma } from '../prisma';

export async function audit({ userId, deviceId, sessionId, action, metadata }: { userId: string; deviceId?: string; sessionId?: string; action: string; metadata?: Record<string, unknown> }) {
  await prisma.auditLog.create({ data: { userId, deviceId, sessionId, action, metadata } });
}
