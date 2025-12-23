import { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/index';
import { prisma, resetDatabase } from './helpers';

const basePassword = 'Password123!';

async function registerUser(app: ReturnType<typeof buildServer>, email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: basePassword, deviceName: 'Laptop' },
  });

  const payload = response.json() as { accessToken: string };
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  return { token: payload.accessToken, userId: user.id };
}

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret';
  delete process.env.OPENAI_API_KEY;
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ai explain endpoints', () => {
  it('returns 403 when aiAssistEnabled is false', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'user@example.com');

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: 'StreamCo',
        amount: new Prisma.Decimal(12),
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/explain',
      headers: { authorization: `Bearer ${token}` },
      payload: { topic: 'duplicate', subscriptionIds: [subscription.id] },
    });

    expect(response.statusCode).toBe(403);

    const actionLogs = await prisma.aIActionLog.findMany({ where: { userId } });
    expect(actionLogs).toHaveLength(1);
    expect(actionLogs[0]?.success).toBe(false);

    const auditLogs = await prisma.auditLog.findMany({ where: { userId, action: 'ai.explain_failed' } });
    expect(auditLogs.length).toBeGreaterThan(0);

    await app.close();
  });

  it('returns explanations when enabled', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'enabled@example.com');
    await prisma.user.update({ where: { id: userId }, data: { aiAssistEnabled: true } });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: 'CloudDrive',
        amount: new Prisma.Decimal(7.5),
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date('2024-12-15T00:00:00.000Z'),
        category: 'storage',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/explain',
      headers: { authorization: `Bearer ${token}` },
      payload: { topic: 'duplicate', subscriptionIds: [subscription.id] },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as { items: { subscriptionId: string; summary: string }[]; confidence?: number };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.subscriptionId).toBe(subscription.id);
    expect(body.items[0]?.summary.length).toBeGreaterThan(0);
    expect(body.confidence).toBeDefined();

    const auditLogs = await prisma.auditLog.findMany({
      where: { userId, action: { in: ['ai.explain_requested', 'ai.explain_succeeded'] } },
    });
    expect(auditLogs.some((log) => log.action === 'ai.explain_requested')).toBe(true);
    expect(auditLogs.some((log) => log.action === 'ai.explain_succeeded')).toBe(true);

    const aiLogs = await prisma.aIActionLog.findMany({ where: { userId } });
    expect(aiLogs).toHaveLength(1);
    expect(aiLogs[0]?.success).toBe(true);
    expect(aiLogs[0]?.actionType).toBe('EXPLAIN');
    expect(aiLogs[0]?.outputSummary.length).toBeLessThanOrEqual(500);

    await app.close();
  });

  it('returns 404 when subscription belongs to another user', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'owner@example.com');
    await prisma.user.update({ where: { id: userId }, data: { aiAssistEnabled: true } });

    const other = await registerUser(app, 'other@example.com');
    const foreignSubscription = await prisma.subscription.create({
      data: {
        userId: other.userId,
        name: 'ForeignStream',
        amount: new Prisma.Decimal(15),
        currency: 'USD',
        billingInterval: 'YEARLY',
        nextBillingDate: new Date(),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/explain',
      headers: { authorization: `Bearer ${token}` },
      payload: { topic: 'yearly_vs_monthly', subscriptionIds: [foreignSubscription.id] },
    });

    expect(response.statusCode).toBe(404);

    const aiLogs = await prisma.aIActionLog.findMany({ where: { userId } });
    expect(aiLogs).toHaveLength(1);
    expect(aiLogs[0]?.success).toBe(false);

    const auditLogs = await prisma.auditLog.findMany({ where: { userId, action: 'ai.explain_failed' } });
    expect(auditLogs.length).toBeGreaterThan(0);

    await app.close();
  });
});
