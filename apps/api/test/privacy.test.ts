import fs from 'fs/promises';
import path from 'path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/index';
import { prisma, resetDatabase } from './helpers';

const baseCredentials = {
  email: 'privacy@example.com',
  password: 'Password123!',
};

const EXPORT_DIR = path.join(process.cwd(), 'tmp-exports');

async function register(
  app: ReturnType<typeof buildServer>,
  email: string = baseCredentials.email,
): Promise<{ accessToken: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { ...baseCredentials, email, deviceName: 'Laptop' },
  });

  expect(response.statusCode).toBe(201);
  const body = response.json() as { accessToken: string };
  return { accessToken: body.accessToken };
}

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.INLINE_PRIVACY_WORKER = 'true';
  process.env.SKIP_PRIVACY_QUEUE = '';
  process.env.EXPORT_DIR = EXPORT_DIR;
  process.env.EXPORT_TTL_HOURS = '1';
  await fs.rm(EXPORT_DIR, { recursive: true, force: true });
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('privacy jobs', () => {
  it('creates an export job and processes inline', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);

    const exportResp = await app.inject({
      method: 'POST',
      url: '/api/privacy/export',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(exportResp.statusCode).toBe(202);
    const { jobId } = exportResp.json() as { jobId: string };
    expect(jobId).toBeDefined();

    const job = await prisma.privacyJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('SUCCEEDED');
    expect(job.filePath).toBeTruthy();
    expect(job.expiresAt).toBeTruthy();
    expect(job.startedAt).toBeTruthy();
    expect(job.completedAt).toBeTruthy();

    await app.close();
  });

  it('rejects download before export completion', async () => {
    process.env.INLINE_PRIVACY_WORKER = 'false';
    process.env.SKIP_PRIVACY_QUEUE = 'true';
    const app = buildServer();
    const { accessToken } = await register(app);

    const exportResp = await app.inject({
      method: 'POST',
      url: '/api/privacy/export',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(exportResp.statusCode).toBe(202);
    const { jobId } = exportResp.json() as { jobId: string };
    expect(jobId).toBeDefined();

    const download = await app.inject({
      method: 'GET',
      url: `/api/privacy/jobs/${jobId}/download`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(download.statusCode).toBe(404);
    await app.close();
  });

  it('requires delete confirmation', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);

    const deleteResp = await app.inject({
      method: 'POST',
      url: '/api/privacy/delete',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { confirm: 'nope' },
    });

    expect(deleteResp.statusCode).toBe(400);
    await app.close();
  });

  it('deletes user-owned data via delete job', async () => {
    const app = buildServer();
    const { accessToken } = await register(app);
    const user = await prisma.user.findFirstOrThrow();

    await prisma.subscription.create({
      data: {
        userId: user.id,
        name: 'Test Sub',
        amount: 10,
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(),
      },
    });

    const deleteResp = await app.inject({
      method: 'POST',
      url: '/api/privacy/delete',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { confirm: 'DELETE' },
    });

    expect(deleteResp.statusCode).toBe(202);
    const { jobId } = deleteResp.json() as { jobId: string };

    const job = await prisma.privacyJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('SUCCEEDED');

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.subscription.count()).toBe(0);
    expect(await prisma.device.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);

    await app.close();
  });

  it('prevents cross-user access to jobs and downloads', async () => {
    const app = buildServer();
    const { accessToken: ownerToken } = await register(app);

    const exportResp = await app.inject({
      method: 'POST',
      url: '/api/privacy/export',
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    const { jobId } = exportResp.json() as { jobId: string };
    const other = await register(app, 'privacy-2@example.com');

    const otherJob = await app.inject({
      method: 'GET',
      url: `/api/privacy/jobs/${jobId}`,
      headers: { authorization: `Bearer ${other.accessToken}` },
    });
    expect(otherJob.statusCode).toBe(404);

    const download = await app.inject({
      method: 'GET',
      url: `/api/privacy/jobs/${jobId}/download`,
      headers: { authorization: `Bearer ${other.accessToken}` },
    });
    expect(download.statusCode).toBe(404);

    await app.close();
  });
});
