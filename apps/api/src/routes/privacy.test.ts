import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../index';
import { prisma } from '../prisma';
import { SignJWT } from 'jose';
import { runPrivacyExportJob, runPrivacyDeleteJob } from '../jobs/privacy';

process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'test-access-secret-please-change-123456';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret-please-change-123456';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

let counter = 0;
async function createUser(aiEnabled = true) {
  counter += 1;
  return prisma.user.create({ data: { email: `privacy-${counter}@test.com`, passwordHash: 'x', aiAssistEnabled: aiEnabled } });
}

async function createAccessToken(userId: string) {
  const secret = new TextEncoder().encode(process.env.ACCESS_TOKEN_SECRET);
  const jwt = await new SignJWT({ userId }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('15m').sign(secret);
  return `Bearer ${jwt}`;
}

describe('Privacy workflows', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.aIPatch.deleteMany({});
    await prisma.aIProposal.deleteMany({});
    await prisma.aIActionLog.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.privacyJob.deleteMany({});
    await prisma.detectedSubscription.deleteMany({});
    await prisma.connection.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.device.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it('creates export job and allows download after processing', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    await prisma.subscription.create({ data: { userId: user.id, name: 'ExportMe', amount: 1, currency: 'USD', billingInterval: 'monthly' } });

    const res = await app.inject({ method: 'POST', url: '/api/privacy/export', headers: { authorization: token } });
    expect(res.statusCode).toBe(200);
    const jobId = res.json().jobId;
    expect(jobId).toBeTruthy();

    await runPrivacyExportJob(jobId);

    const statusRes = await app.inject({ method: 'GET', url: `/api/privacy/export/${jobId}`, headers: { authorization: token } });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().status).toBe('SUCCEEDED');

    const downloadRes = await app.inject({ method: 'GET', url: `/api/privacy/export/${jobId}/download`, headers: { authorization: token } });
    expect(downloadRes.statusCode).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('application/zip');
  });

  it('delete requires confirm', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    const res = await app.inject({ method: 'POST', url: '/api/privacy/delete', headers: { authorization: token }, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('delete job removes user data', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    await prisma.subscription.create({ data: { userId: user.id, name: 'Del', amount: 2, currency: 'USD', billingInterval: 'monthly' } });
    await prisma.aIActionLog.create({
      data: { userId: user.id, actionType: 'EXPLAIN', topic: 't', inputSummary: {}, outputSummary: {}, provider: 'mock', latencyMs: 1, success: true }
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/privacy/delete',
      headers: { authorization: token },
      payload: { confirm: 'DELETE' }
    });
    expect(res.statusCode).toBe(200);
    const jobId = res.json().jobId;
    await runPrivacyDeleteJob(jobId);

    const remainingSubs = await prisma.subscription.count({ where: { userId: user.id } });
    expect(remainingSubs).toBe(0);
    const remainingLogs = await prisma.aIActionLog.count({ where: { userId: user.id } });
    expect(remainingLogs).toBe(0);
    const userExists = await prisma.user.findUnique({ where: { id: user.id } });
    expect(userExists).toBeNull();
  });

  it('cross user job access is forbidden', async () => {
    const user = await createUser(true);
    const other = await createUser(true);
    const token = await createAccessToken(user.id);
    const otherToken = await createAccessToken(other.id);

    const res = await app.inject({ method: 'POST', url: '/api/privacy/export', headers: { authorization: token } });
    const jobId = res.json().jobId;
    const otherStatus = await app.inject({ method: 'GET', url: `/api/privacy/export/${jobId}`, headers: { authorization: otherToken } });
    expect(otherStatus.statusCode).toBe(404);
  });
});
