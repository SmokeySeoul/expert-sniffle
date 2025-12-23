import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

const SENSITIVE_KEYS = ['password', 'passwordHash', 'token', 'refreshToken', 'accessToken', 'email'];

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

export function redactMetadata(metadata: Prisma.JsonValue): Prisma.JsonValue {
  if (metadata === null || typeof metadata !== 'object') {
    return metadata;
  }

  if (Array.isArray(metadata)) {
    return metadata.map((item) => redactMetadata(item)) as Prisma.JsonValue;
  }

  return Object.entries(metadata).reduce<Record<string, Prisma.JsonValue>>((acc, [key, value]) => {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      acc[key] = '[REDACTED]';
    } else {
      acc[key] = redactMetadata(value as Prisma.JsonValue);
    }
    return acc;
  }, {});
}
