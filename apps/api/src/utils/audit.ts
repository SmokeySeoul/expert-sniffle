import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

interface AuditParams {
  userId: string;
  action: string;
  deviceId?: string;
  sessionId?: string;
  metadata?: Prisma.InputJsonValue;
}

export async function recordAuditLog({
  userId,
  action,
  deviceId,
  sessionId,
  metadata,
}: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      deviceId,
      sessionId,
      action,
      metadata: metadata ?? {},
    },
  });
}
