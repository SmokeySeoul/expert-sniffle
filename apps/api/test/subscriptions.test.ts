import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/index';
import { prisma, resetDatabase } from './helpers';

const credentials = {
  email: 'owner@example.com',
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

describe('subscriptions and insights', () => {
  it('requires authentication for subscription access', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'GET',
      url: '/api/subscriptions',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });

    await app.close();
  });

  it('supports CRUD operations on subscriptions', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);

    const create = await app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Pro Plan',
        amount: 25,
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date().toISOString(),
        category: 'work',
      },
    });

    expect(create.statusCode).toBe(201);
    const created = create.json() as { subscription: { id: string; name: string; active: boolean } };
    expect(created.subscription.active).toBe(true);

    const list = await app.inject({
      method: 'GET',
      url: '/api/subscriptions',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const listed = list.json() as { subscriptions: Array<{ id: string }> };
    expect(listed.subscriptions).toHaveLength(1);

    const updatedName = 'Pro Plus';
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/subscriptions/${created.subscription.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: updatedName },
    });
    const updated = update.json() as { subscription: { name: string } };
    expect(update.statusCode).toBe(200);
    expect(updated.subscription.name).toBe(updatedName);

    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/subscriptions/${created.subscription.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(remove.statusCode).toBe(200);
    const deleted = remove.json() as { subscription: { active: boolean } };
    expect(deleted.subscription.active).toBe(false);

    await app.close();
  });

  it('returns deterministic totals', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);
    const authHeader = { authorization: `Bearer ${accessToken}` };
    const now = new Date().toISOString();

    await app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      headers: authHeader,
      payload: {
        name: 'Music',
        amount: 10,
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: now,
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      headers: authHeader,
      payload: {
        name: 'Cloud Storage',
        amount: 120,
        currency: 'USD',
        billingInterval: 'YEARLY',
        nextBillingDate: now,
      },
    });

    const totals = await app.inject({
      method: 'GET',
      url: '/api/insights/totals',
      headers: authHeader,
    });

    expect(totals.statusCode).toBe(200);
    expect(totals.json()).toEqual({ monthlyTotal: 10, yearlyTotal: 120 });

    await app.close();
  });
});
