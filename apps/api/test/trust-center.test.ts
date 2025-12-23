import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src';
import { prisma, resetDatabase } from './helpers';

const credentials = {
  email: 'trust@example.com',
  password: 'Password123!',
};

async function register(app: ReturnType<typeof buildServer>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { ...credentials, deviceName: 'Test Device' },
  });

  return response.json() as { accessToken: string; refreshToken: string };
}

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret';
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('trust center permissions', () => {
  it('defaults all permissions to false for new users', async () => {
    const app = buildServer();
    await register(app);

    const user = await prisma.user.findUnique({ where: { email: credentials.email } });
    expect(user?.bankConnectionsEnabled).toBe(false);
    expect(user?.emailParsingEnabled).toBe(false);
    expect(user?.aiAssistEnabled).toBe(false);
    expect(user?.autopilotEnabled).toBe(false);

    await app.close();
  });

  it('allows toggling a permission and writes an audit log', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);
    const authHeader = { authorization: `Bearer ${accessToken}` };

    const toggle = await app.inject({
      method: 'PATCH',
      url: '/api/trust-center',
      headers: authHeader,
      payload: { aiAssistEnabled: true },
    });

    expect(toggle.statusCode).toBe(200);
    const body = toggle.json() as {
      permissions: Record<string, { enabled: boolean }>;
    };
    expect(body.permissions.aiAssistEnabled.enabled).toBe(true);

    const user = await prisma.user.findUnique({ where: { email: credentials.email } });
    expect(user?.aiAssistEnabled).toBe(true);

    const auditLogs = await prisma.auditLog.findMany({
      where: { userId: user?.id, action: 'trust.permission.updated' },
    });
    expect(auditLogs).toHaveLength(1);
    const metadata = auditLogs[0].metadata as Record<string, unknown>;
    expect(metadata.flag).toBe('aiAssistEnabled');
    expect(metadata.oldValue).toBe(false);
    expect(metadata.newValue).toBe(true);

    await app.close();
  });

  it('blocks AI assistance until enabled', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);
    const authHeader = { authorization: `Bearer ${accessToken}` };

    const denied = await app.inject({
      method: 'POST',
      url: '/api/ai/assist',
      headers: authHeader,
    });

    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: 'AI assistance disabled' });

    await app.inject({
      method: 'PATCH',
      url: '/api/trust-center',
      headers: authHeader,
      payload: { aiAssistEnabled: true },
    });

    const allowed = await app.inject({
      method: 'POST',
      url: '/api/ai/assist',
      headers: authHeader,
    });

    expect(allowed.statusCode).toBe(200);
    const payload = allowed.json() as { message: string };
    expect(payload.message).toContain('enabled');

    await app.close();
  });

  it('redacts sensitive metadata in audit responses', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);
    const authHeader = { authorization: `Bearer ${accessToken}` };

    const auditResponse = await app.inject({
      method: 'GET',
      url: '/api/audit',
      headers: authHeader,
    });

    expect(auditResponse.statusCode).toBe(200);
    const payload = auditResponse.json() as {
      logs: Array<{ metadata: Record<string, unknown> }>;
    };
    expect(payload.logs.length).toBeGreaterThan(0);
    expect(payload.logs[0].metadata.email).toBe('[REDACTED]');

    await app.close();
  });
});
