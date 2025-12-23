import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/index';
import { prisma, resetDatabase } from './helpers';

const baseCredentials = {
  email: 'user@example.com',
  password: 'Password123!',
};

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret';
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('auth endpoints', () => {
  it('registers and logs in a user', async () => {
    const app = buildServer();

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...baseCredentials, deviceName: 'Laptop' },
    });

    expect(register.statusCode).toBe(201);
    const registered = register.json() as { accessToken: string; refreshToken: string };
    expect(registered.accessToken).toBeDefined();
    expect(registered.refreshToken).toBeDefined();

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: baseCredentials,
    });

    expect(login.statusCode).toBe(200);
    const loggedIn = login.json() as { accessToken: string; refreshToken: string };
    expect(loggedIn.accessToken).toBeDefined();
    expect(loggedIn.refreshToken).toBeDefined();

    await app.close();
  });

  it('rotates refresh tokens and invalidates old ones', async () => {
    const app = buildServer();
    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...baseCredentials, deviceName: 'Tablet' },
    });
    const initial = register.json() as { refreshToken: string; accessToken: string };

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: initial.refreshToken },
    });

    expect(refresh.statusCode).toBe(200);
    const rotated = refresh.json() as { refreshToken: string; accessToken: string };
    expect(rotated.refreshToken).not.toEqual(initial.refreshToken);

    const reuseOld = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: initial.refreshToken },
    });

    expect(reuseOld.statusCode).toBe(401);

    await app.close();
  });
});
