import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../prisma';
import { SignJWT } from 'jose';
import { RecategorizeProposalItem } from '@substream/shared';

process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'test-access-secret-please-change-123456';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret-please-change-123456';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

let userCounter = 0;
async function createUser(aiEnabled: boolean) {
  userCounter += 1;
  return prisma.user.create({ data: { email: `user-${aiEnabled}-${userCounter}@test.com`, passwordHash: 'x', aiAssistEnabled: aiEnabled } });
}

describe('AI explain', () => {
  let app: Awaited<ReturnType<(typeof import('../index'))['buildServer']>>;
  let env: typeof import('../env')['env'];

  async function buildApp() {
    ({ env } = await import('../env'));
    const { buildServer } = await import('../index');
    return buildServer();
  }

  async function createAccessToken(userId: string, deviceId?: string, sessionId?: string) {
    const secret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);
    const jwt = await new SignJWT({ userId, deviceId, sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(secret);
    return `Bearer ${jwt}`;
  }

  beforeEach(async () => {
    await prisma.aIActionLog.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.device.deleteMany({});
    await prisma.user.deleteMany({});
  });

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication header', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/ai/explain', payload: { topic: 'duplicate' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Unauthorized' });
    const logCount = await prisma.aIActionLog.count();
    expect(logCount).toBe(0);
  });

  it('rejects malformed bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/explain',
      payload: { topic: 'duplicate' },
      headers: { authorization: 'Bearer not-a-token' }
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('does not allow x-user-id bypass', async () => {
    const user = await createUser(true);
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/explain',
      payload: { topic: 'duplicate' },
      headers: { 'x-user-id': user.id }
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('status requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ai/status' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when ai disabled', async () => {
    const user = await createUser(false);
    const token = await createAccessToken(user.id);
    const res = await app.inject({ method: 'POST', url: '/api/ai/explain', payload: { topic: 'duplicate' }, headers: { authorization: token } });
    expect(res.statusCode).toBe(403);
  });

  it('returns insights and logs when enabled', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    await prisma.subscription.create({ data: { userId: user.id, name: 'Netflix', amount: 10, currency: 'USD', billingInterval: 'monthly' } });
    const res = await app.inject({ method: 'POST', url: '/api/ai/explain', payload: { topic: 'duplicate' }, headers: { authorization: token } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThan(0);

    const log = await prisma.aIActionLog.findFirst({ where: { userId: user.id } });
    expect(log).toBeTruthy();
    expect((log as any).inputSummary).not.toEqual(null);
    expect(JSON.stringify(log?.inputSummary || {})).not.toMatch(/token/i);

    const audits = await prisma.auditLog.findMany({ where: { userId: user.id } });
    expect(audits.some((a) => a.action === 'ai.explain_requested')).toBe(true);
    expect(audits.some((a) => a.action === 'ai.explain_succeeded')).toBe(true);

    const logsRes = await app.inject({ method: 'GET', url: '/api/ai/logs', headers: { authorization: token } });
    expect(logsRes.statusCode).toBe(200);
    const logsBody = logsRes.json();
    expect(Array.isArray(logsBody.items)).toBe(true);
    expect(logsBody.items.length).toBeGreaterThan(0);
    const first = logsBody.items[0];
    expect(first).not.toHaveProperty('outputSummary');
    expect(first).not.toHaveProperty('inputSummary');
  });

  it('blocks access to other users subscriptions', async () => {
    const owner = await createUser(true);
    const other = await createUser(true);
    const otherToken = await createAccessToken(other.id);
    const sub = await prisma.subscription.create({ data: { userId: owner.id, name: 'Spotify', amount: 9.99, currency: 'USD', billingInterval: 'monthly' } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/explain',
      payload: { topic: 'duplicate', subscriptionIds: [sub.id] },
      headers: { authorization: otherToken }
    });
    expect(res.statusCode).toBe(404);
  });

  it('logs failure when provider rejects', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    await prisma.subscription.create({ data: { userId: user.id, name: 'FailMe', amount: 1, currency: 'USD', billingInterval: 'monthly' } });

    const providerModule = await import('../ai/provider');
    const provider = providerModule.getProvider();
    const spy = vi.spyOn(provider, 'explain').mockRejectedValue(new Error('Provider fail'));
    const getProviderSpy = vi.spyOn(providerModule, 'getProvider').mockReturnValue(provider);

    const res = await app.inject({ method: 'POST', url: '/api/ai/explain', payload: { topic: 'duplicate' }, headers: { authorization: token } });
    expect(res.statusCode).toBe(500);

    const log = await prisma.aIActionLog.findFirst({ where: { userId: user.id } });
    expect(log?.success).toBe(false);

    const audits = await prisma.auditLog.findMany({ where: { userId: user.id } });
    expect(audits.some((a) => a.action === 'ai.explain_requested')).toBe(true);
    expect(audits.some((a) => a.action === 'ai.explain_failed')).toBe(true);

    spy.mockRestore();
    getProviderSpy.mockRestore();
  });

  it('returns logs after explain and paginates', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    await prisma.subscription.create({ data: { userId: user.id, name: 'Disney+', amount: 12, currency: 'USD', billingInterval: 'monthly' } });
    await app.inject({ method: 'POST', url: '/api/ai/explain', payload: { topic: 'duplicate' }, headers: { authorization: token } });

    const firstPage = await app.inject({ method: 'GET', url: '/api/ai/logs?limit=1', headers: { authorization: token } });
    expect(firstPage.statusCode).toBe(200);
    const firstBody = firstPage.json();
    expect(firstBody.items.length).toBe(1);
    const cursor = firstBody.nextCursor;

    if (cursor) {
      const secondPage = await app.inject({ method: 'GET', url: `/api/ai/logs?cursor=${cursor}`, headers: { authorization: token } });
      expect(secondPage.statusCode).toBe(200);
      const secondBody = secondPage.json();
      expect(Array.isArray(secondBody.items)).toBe(true);
    }
  });

  it('mounts api prefix for health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('propose requires ai enabled', async () => {
    const user = await createUser(false);
    const token = await createAccessToken(user.id);
    const res = await app.inject({ method: 'POST', url: '/api/ai/propose', payload: { type: 'RECATEGORIZE' }, headers: { authorization: token } });
    expect(res.statusCode).toBe(403);
  });

  it('creates proposal, logs, audits, and lists only user proposals', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    await prisma.subscription.create({ data: { userId: user.id, name: 'Hulu', amount: 7, currency: 'USD', billingInterval: 'monthly' } });

    const res = await app.inject({ method: 'POST', url: '/api/ai/propose', payload: { type: 'RECATEGORIZE' }, headers: { authorization: token } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.proposalId).toBeTruthy();

    const proposal = await prisma.aIProposal.findUnique({ where: { id: body.proposalId } });
    expect(proposal).toBeTruthy();
    expect(proposal?.type).toBe('RECATEGORIZE');

    const actionLog = await prisma.aIActionLog.findFirst({ where: { userId: user.id, actionType: 'PROPOSE' as any } });
    expect(actionLog?.success).toBe(true);

    const audits = await prisma.auditLog.findMany({ where: { userId: user.id } });
    expect(audits.some((a) => a.action === 'ai.propose_requested')).toBe(true);
    expect(audits.some((a) => a.action === 'ai.propose_succeeded')).toBe(true);

    const listRes = await app.inject({ method: 'GET', url: '/api/ai/proposals', headers: { authorization: token } });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.items.some((p: any) => p.id === body.proposalId)).toBe(true);

    // cross-user should not see
    const other = await createUser(true);
    const otherToken = await createAccessToken(other.id);
    const otherList = await app.inject({ method: 'GET', url: '/api/ai/proposals', headers: { authorization: otherToken } });
    const otherBody = otherList.json();
    expect(otherBody.items.some((p: any) => p.id === body.proposalId)).toBe(false);

    // detail scoped
    const detailRes = await app.inject({ method: 'GET', url: `/api/ai/proposals/${body.proposalId}`, headers: { authorization: token } });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = detailRes.json();
    expect(detailBody.id).toBe(body.proposalId);

    const otherDetail = await app.inject({ method: 'GET', url: `/api/ai/proposals/${body.proposalId}`, headers: { authorization: otherToken } });
    expect(otherDetail.statusCode).toBe(404);
  });

  it('dismisses proposal and audits', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    await prisma.subscription.create({ data: { userId: user.id, name: 'Apple', amount: 5, currency: 'USD', billingInterval: 'monthly' } });
    const res = await app.inject({ method: 'POST', url: '/api/ai/propose', payload: { type: 'SAVINGS_LIST' }, headers: { authorization: token } });
    const proposalId = res.json().proposalId;

    const dismissRes = await app.inject({ method: 'POST', url: `/api/ai/proposals/${proposalId}/dismiss`, headers: { authorization: token } });
    expect(dismissRes.statusCode).toBe(200);
    const updated = dismissRes.json();
    expect(updated.status).toBe('DISMISSED');

    const audits = await prisma.auditLog.findMany({ where: { userId: user.id } });
    expect(audits.some((a) => a.action === 'ai.proposal_dismissed')).toBe(true);
  });

  it('rejects applying savings proposal', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    await prisma.subscription.create({ data: { userId: user.id, name: 'NYTimes', amount: 5, currency: 'USD', billingInterval: 'monthly' } });
    const res = await app.inject({ method: 'POST', url: '/api/ai/propose', payload: { type: 'SAVINGS_LIST' }, headers: { authorization: token } });
    const proposalId = res.json().proposalId;
    const applyRes = await app.inject({ method: 'POST', url: `/api/ai/proposals/${proposalId}/apply`, payload: { approved: true }, headers: { authorization: token } });
    expect(applyRes.statusCode).toBe(400);
  });

  it('applies recategorize proposal and creates patch', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    const sub = await prisma.subscription.create({ data: { userId: user.id, name: 'Dropbox', amount: 12, currency: 'USD', billingInterval: 'monthly', category: 'Work' } });

    // craft proposal payload directly for deterministic categories
    const proposal = await prisma.aIProposal.create({
      data: {
        userId: user.id,
        type: 'RECATEGORIZE',
        status: 'ACTIVE',
        title: 'Recategorize suggestions',
        summary: 'Bulk recategorize proposal',
        payload: {
          items: [
            {
              subscriptionId: sub.id,
              fromCategory: 'Work',
              toCategory: 'Cloud',
              rationale: 'Based on name',
              confidence: 0.8
            } as RecategorizeProposalItem
          ]
        },
        expiresAt: new Date(Date.now() + 3600 * 1000)
      }
    });

    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${proposal.id}/apply`,
      payload: { approved: true },
      headers: { authorization: token }
    });
    expect(applyRes.statusCode).toBe(200);
    const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(updated?.category).toBe('Cloud');

    const patch = await prisma.aIPatch.findFirst({ where: { proposalId: proposal.id } });
    expect(patch).toBeTruthy();
    expect(patch?.status).toBe('APPLIED');

    const proposalUpdated = await prisma.aIProposal.findUnique({ where: { id: proposal.id } });
    expect(proposalUpdated?.status).toBe('APPLIED');

    const audits = await prisma.auditLog.findMany({ where: { userId: user.id } });
    expect(audits.some((a) => a.action === 'ai.apply_requested')).toBe(true);
    expect(audits.some((a) => a.action === 'ai.apply_succeeded')).toBe(true);
  });

  it('rejects stale apply when category changed', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    const sub = await prisma.subscription.create({ data: { userId: user.id, name: 'Slack', amount: 8, currency: 'USD', billingInterval: 'monthly', category: 'Team' } });
    const proposal = await prisma.aIProposal.create({
      data: {
        userId: user.id,
        type: 'RECATEGORIZE',
        status: 'ACTIVE',
        title: 'Recategorize suggestions',
        summary: 'Bulk recategorize proposal',
        payload: { items: [{ subscriptionId: sub.id, fromCategory: 'Team', toCategory: 'Comms', rationale: 'Based on name', confidence: 0.7 }] },
        expiresAt: new Date(Date.now() + 3600 * 1000)
      }
    });
    await prisma.subscription.update({ where: { id: sub.id }, data: { category: 'Ops' } });
    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${proposal.id}/apply`,
      payload: { approved: true },
      headers: { authorization: token }
    });
    expect(applyRes.statusCode).toBe(409);
  });

  it('rolls back patch and restores category', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    const sub = await prisma.subscription.create({ data: { userId: user.id, name: 'Zoom', amount: 15, currency: 'USD', billingInterval: 'monthly', category: 'Meetings' } });
    const proposal = await prisma.aIProposal.create({
      data: {
        userId: user.id,
        type: 'RECATEGORIZE',
        status: 'ACTIVE',
        title: 'Recategorize suggestions',
        summary: 'Bulk recategorize proposal',
        payload: { items: [{ subscriptionId: sub.id, fromCategory: 'Meetings', toCategory: 'Comms', rationale: 'Based on name', confidence: 0.7 }] },
        expiresAt: new Date(Date.now() + 3600 * 1000)
      }
    });
    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${proposal.id}/apply`,
      payload: { approved: true },
      headers: { authorization: token }
    });
    const patchId = (await prisma.aIPatch.findFirst({ where: { proposalId: proposal.id } }))?.id as string;
    const rollbackRes = await app.inject({
      method: 'POST',
      url: `/api/ai/patches/${patchId}/rollback`,
      headers: { authorization: token }
    });
    expect(rollbackRes.statusCode).toBe(200);
    const subAfter = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(subAfter?.category).toBe('Meetings');
    const patchAfter = await prisma.aIPatch.findUnique({ where: { id: patchId } });
    expect(patchAfter?.status).toBe('ROLLED_BACK');

    const audits = await prisma.auditLog.findMany({ where: { userId: user.id } });
    expect(audits.some((a) => a.action === 'ai.rollback_requested')).toBe(true);
    expect(audits.some((a) => a.action === 'ai.rollback_succeeded')).toBe(true);
  });

  it('prevents cross-user patch access', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    const other = await createUser(true);
    const otherToken = await createAccessToken(other.id);
    const sub = await prisma.subscription.create({ data: { userId: user.id, name: 'Notion', amount: 5, currency: 'USD', billingInterval: 'monthly', category: 'Notes' } });
    const proposal = await prisma.aIProposal.create({
      data: {
        userId: user.id,
        type: 'RECATEGORIZE',
        status: 'ACTIVE',
        title: 'Recategorize suggestions',
        summary: 'Bulk recategorize proposal',
        payload: { items: [{ subscriptionId: sub.id, fromCategory: 'Notes', toCategory: 'Productivity', rationale: 'Based on name', confidence: 0.7 }] },
        expiresAt: new Date(Date.now() + 3600 * 1000)
      }
    });
    await app.inject({ method: 'POST', url: `/api/ai/proposals/${proposal.id}/apply`, payload: { approved: true }, headers: { authorization: token } });
    const patchId = (await prisma.aIPatch.findFirst({ where: { proposalId: proposal.id } }))?.id as string;
    const otherRes = await app.inject({ method: 'GET', url: `/api/ai/patches/${patchId}`, headers: { authorization: otherToken } });
    expect(otherRes.statusCode).toBe(404);
    const otherRollback = await app.inject({ method: 'POST', url: `/api/ai/patches/${patchId}/rollback`, headers: { authorization: otherToken } });
    expect(otherRollback.statusCode).toBe(404);
  });

  it('prevents double rollback', async () => {
    const user = await createUser(true);
    const token = await createAccessToken(user.id);
    const sub = await prisma.subscription.create({ data: { userId: user.id, name: 'Asana', amount: 10, currency: 'USD', billingInterval: 'monthly', category: 'PM' } });
    const proposal = await prisma.aIProposal.create({
      data: {
        userId: user.id,
        type: 'RECATEGORIZE',
        status: 'ACTIVE',
        title: 'Recategorize suggestions',
        summary: 'Bulk recategorize proposal',
        payload: { items: [{ subscriptionId: sub.id, fromCategory: 'PM', toCategory: 'Productivity', rationale: 'Based on name', confidence: 0.7 }] },
        expiresAt: new Date(Date.now() + 3600 * 1000)
      }
    });
    await app.inject({ method: 'POST', url: `/api/ai/proposals/${proposal.id}/apply`, payload: { approved: true }, headers: { authorization: token } });
    const patchId = (await prisma.aIPatch.findFirst({ where: { proposalId: proposal.id } }))?.id as string;
    await app.inject({ method: 'POST', url: `/api/ai/patches/${patchId}/rollback`, headers: { authorization: token } });
    const second = await app.inject({ method: 'POST', url: `/api/ai/patches/${patchId}/rollback`, headers: { authorization: token } });
    expect(second.statusCode).toBe(409);
  });
});
