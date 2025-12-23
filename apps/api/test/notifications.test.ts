import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/index';
import {
  ensureNotificationPreference,
  generateUpcomingNotifications,
  sendDueNotifications,
} from '../src/notifications/service';
import { prisma, resetDatabase } from './helpers';

const credentials = {
  email: 'notifications@example.com',
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

describe('notifications', () => {
  it('creates default preferences on first access', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications/preferences',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      preference: {
        timezone: string;
        quietHoursEnabled: boolean;
        digestMode: string;
        channels: { email: boolean; push: boolean };
      };
    };

    expect(body.preference.timezone).toBe('UTC');
    expect(body.preference.quietHoursEnabled).toBe(true);
    expect(body.preference.digestMode).toBe('WEEKLY');
    expect(body.preference.channels).toEqual({ email: true, push: false });

    await app.close();
  });

  it('defers notifications to quiet hours end', async () => {
    const now = new Date('2024-01-01T02:00:00Z');
    const afterQuietHours = new Date('2024-01-01T09:00:00Z');

    const app = buildServer();
    const { accessToken } = await register(app);
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } })).id;

    await ensureNotificationPreference(prisma, userId);

    await app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Trial Plan',
        amount: 10,
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
        isTrial: true,
      },
    });

    const created = await generateUpcomingNotifications(prisma, now);
    expect(created).toBe(1);

    const notification = await prisma.notification.findFirstOrThrow({ where: { userId } });
    expect(new Date(notification.scheduledFor).toISOString()).toBe('2024-01-01T08:00:00.000Z');

    await app.close();
  });

  it('prevents duplicate notifications for the same subscription and billing date', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } })).id;

    await app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Pro',
        amount: 10,
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    await generateUpcomingNotifications(prisma);
    const createdSecondPass = await generateUpcomingNotifications(prisma);
    expect(createdSecondPass).toBe(0);

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);

    await app.close();
  });

  it('lists and reads notifications', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } })).id;

    const notification = await prisma.notification.create({
      data: {
        userId,
        type: 'RENEWAL_UPCOMING',
        title: 'Upcoming',
        body: 'Your plan renews soon',
        priority: 'INFO',
        metadata: { subscriptionId: 'sub-1', nextBillingDate: new Date().toISOString() },
        scheduledFor: new Date(),
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/api/notifications?unread=true',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    const listed = list.json() as { notifications: Array<{ id: string }> };
    expect(listed.notifications).toHaveLength(1);

    const read = await app.inject({
      method: 'POST',
      url: `/api/notifications/${notification.id}/read`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(read.statusCode).toBe(200);
    const body = read.json() as { notification: { readAt: string | null } };
    expect(body.notification.readAt).not.toBeNull();

    const unreadAfter = await app.inject({
      method: 'GET',
      url: '/api/notifications?unread=true',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const listedAfter = unreadAfter.json() as { notifications: Array<{ id: string }> };
    expect(listedAfter.notifications).toHaveLength(0);

    await app.close();
  });

  it('records audit logs when generating and sending notifications', async () => {
    const now = new Date('2024-01-01T02:00:00Z');
    const afterQuietHours = new Date('2024-01-01T09:00:00Z');

    const app = buildServer();
    const { accessToken } = await register(app);
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } })).id;

    await app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Annual',
        amount: 120,
        currency: 'USD',
        billingInterval: 'YEARLY',
        nextBillingDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    await generateUpcomingNotifications(prisma, now);
    await sendDueNotifications(prisma, afterQuietHours);

    const logs = await prisma.auditLog.findMany({ where: { userId } });
    const actions = logs.map((log) => log.action);
    expect(actions).toContain('notifications.generated');
    expect(actions).toContain('notifications.sent');

    await app.close();
  });
});
