import { Prisma } from '@prisma/client';
import { RecategorizeProposalPayload } from '../src/ai/types';
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

describe('ai proposal endpoints', () => {
  it('returns 403 when aiAssistEnabled is false', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'proposal-disabled@example.com');

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
      url: '/api/ai/propose',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'RECATEGORIZE', subscriptionIds: [subscription.id] },
    });

    expect(response.statusCode).toBe(403);

    const actionLogs = await prisma.aIActionLog.findMany({ where: { userId } });
    expect(actionLogs).toHaveLength(1);
    expect(actionLogs[0]?.success).toBe(false);
    expect(actionLogs[0]?.actionType).toBe('PROPOSE');

    const auditLogs = await prisma.auditLog.findMany({ where: { userId, action: 'ai.propose_failed' } });
    expect(auditLogs.length).toBeGreaterThan(0);

    await app.close();
  });

  it('creates a proposal and logs action + audit entries', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'proposal-enabled@example.com');
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
      url: '/api/ai/propose',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'SAVINGS_LIST', subscriptionIds: [subscription.id] },
    });

    expect(response.statusCode).toBe(200);

    const proposal = response.json() as { id: string; status: string; type: string; expiresAt: string };
    expect(proposal.type).toBe('SAVINGS_LIST');
    expect(proposal.status).toBe('ACTIVE');
    expect(new Date(proposal.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const auditLogs = await prisma.auditLog.findMany({
      where: { userId, action: { in: ['ai.propose_requested', 'ai.propose_succeeded'] } },
    });
    expect(auditLogs.some((log) => log.action === 'ai.propose_requested')).toBe(true);
    expect(auditLogs.some((log) => log.action === 'ai.propose_succeeded')).toBe(true);

    const aiLogs = await prisma.aIActionLog.findMany({ where: { userId } });
    expect(aiLogs).toHaveLength(1);
    expect(aiLogs[0]?.success).toBe(true);
    expect(aiLogs[0]?.actionType).toBe('PROPOSE');

    const proposals = await prisma.aIProposal.findMany({ where: { userId } });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.status).toBe('ACTIVE');

    await app.close();
  });

  it('prevents cross-user access', async () => {
    const app = buildServer();
    const { token: ownerToken, userId } = await registerUser(app, 'proposal-owner@example.com');
    await prisma.user.update({ where: { id: userId }, data: { aiAssistEnabled: true } });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: 'OwnerService',
        amount: new Prisma.Decimal(5),
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(),
      },
    });

    const creation = await app.inject({
      method: 'POST',
      url: '/api/ai/propose',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { type: 'RECATEGORIZE', subscriptionIds: [subscription.id] },
    });

    const created = creation.json() as { id: string };

    const other = await registerUser(app, 'proposal-other@example.com');
    await prisma.user.update({ where: { id: other.userId }, data: { aiAssistEnabled: true } });

    const response = await app.inject({
      method: 'GET',
      url: `/api/ai/proposals/${created.id}`,
      headers: { authorization: `Bearer ${other.token}` },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('dismisses a proposal and records audit', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'proposal-dismiss@example.com');
    await prisma.user.update({ where: { id: userId }, data: { aiAssistEnabled: true } });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: 'TempService',
        amount: new Prisma.Decimal(9.99),
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(),
      },
    });

    const creation = await app.inject({
      method: 'POST',
      url: '/api/ai/propose',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'RECATEGORIZE', subscriptionIds: [subscription.id] },
    });

    const created = creation.json() as { id: string };

    const response = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${created.id}/dismiss`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);

    const proposal = await prisma.aIProposal.findUniqueOrThrow({ where: { id: created.id } });
    expect(proposal.status).toBe('DISMISSED');

    const auditLogs = await prisma.auditLog.findMany({ where: { userId, action: 'ai.proposal.dismissed' } });
    expect(auditLogs.length).toBeGreaterThan(0);

    await app.close();
  });
});

describe('ai apply and patch endpoints', () => {
  it('applies recategorize proposals and creates patches with logs', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'apply@example.com');
    await prisma.user.update({ where: { id: userId }, data: { aiAssistEnabled: true } });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: 'StreamingPlus',
        amount: new Prisma.Decimal(14.99),
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(),
        category: 'entertainment',
      },
    });

    const creation = await app.inject({
      method: 'POST',
      url: '/api/ai/propose',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'RECATEGORIZE', subscriptionIds: [subscription.id] },
    });

    const proposal = creation.json() as { id: string; payload: RecategorizeProposalPayload };
    const recommendation = proposal.payload.recommendations[0];

    const response = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${proposal.id}/apply`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);

    const patch = response.json() as {
      id: string;
      status: string;
      forwardPatch: { recommendations: { subscriptionId: string; toCategory: string }[] };
    };

    expect(patch.status).toBe('APPLIED');
    expect(patch.forwardPatch.recommendations[0]?.toCategory).toBe(recommendation.toCategory);

    const updatedSubscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(updatedSubscription.category).toBe(recommendation.toCategory);

    const storedProposal = await prisma.aIProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(storedProposal.status).toBe('APPLIED');

    const storedPatch = await prisma.aIPatch.findUniqueOrThrow({ where: { id: patch.id } });
    expect(storedPatch.forwardPatch).toBeDefined();

    const auditLogs = await prisma.auditLog.findMany({
      where: { userId, action: { in: ['ai.apply_requested', 'ai.apply_succeeded'] } },
    });
    expect(auditLogs.some((log) => log.action === 'ai.apply_requested')).toBe(true);
    expect(auditLogs.some((log) => log.action === 'ai.apply_succeeded')).toBe(true);

    const actionLogs = await prisma.aIActionLog.findMany({ where: { userId, actionType: 'APPLY' } });
    expect(actionLogs.length).toBeGreaterThan(0);
    expect(actionLogs[0]?.success).toBe(true);

    await app.close();
  });

  it('returns 409 when categories are stale', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'stale@example.com');
    await prisma.user.update({ where: { id: userId }, data: { aiAssistEnabled: true } });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: 'CloudBox',
        amount: new Prisma.Decimal(6.5),
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(),
        category: 'storage',
      },
    });

    const creation = await app.inject({
      method: 'POST',
      url: '/api/ai/propose',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'RECATEGORIZE', subscriptionIds: [subscription.id] },
    });

    const proposal = creation.json() as { id: string };

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { category: 'modified' },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${proposal.id}/apply`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(409);

    const patchCount = await prisma.aIPatch.count({ where: { userId } });
    expect(patchCount).toBe(0);

    await app.close();
  });

  it('rejects applying savings proposals', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'savings-apply@example.com');
    await prisma.user.update({ where: { id: userId }, data: { aiAssistEnabled: true } });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: 'SavingsSub',
        amount: new Prisma.Decimal(12.5),
        currency: 'USD',
        billingInterval: 'YEARLY',
        nextBillingDate: new Date(),
      },
    });

    const creation = await app.inject({
      method: 'POST',
      url: '/api/ai/propose',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'SAVINGS_LIST', subscriptionIds: [subscription.id] },
    });

    const proposal = creation.json() as { id: string };

    const response = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${proposal.id}/apply`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);

    const storedProposal = await prisma.aIProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(storedProposal.status).toBe('ACTIVE');

    await app.close();
  });

  it('rolls back patches and restores categories', async () => {
    const app = buildServer();
    const { token, userId } = await registerUser(app, 'rollback@example.com');
    await prisma.user.update({ where: { id: userId }, data: { aiAssistEnabled: true } });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: 'RollService',
        amount: new Prisma.Decimal(4.99),
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(),
        category: 'tools',
      },
    });

    const creation = await app.inject({
      method: 'POST',
      url: '/api/ai/propose',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'RECATEGORIZE', subscriptionIds: [subscription.id] },
    });

    const proposal = creation.json() as { id: string; payload: RecategorizeProposalPayload };
    const recommendation = proposal.payload.recommendations[0];

    const applyResponse = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${proposal.id}/apply`,
      headers: { authorization: `Bearer ${token}` },
    });

    const patch = applyResponse.json() as { id: string };

    const rollbackResponse = await app.inject({
      method: 'POST',
      url: `/api/ai/patches/${patch.id}/rollback`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(rollbackResponse.statusCode).toBe(200);

    const updatedSubscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(updatedSubscription.category).toBe(recommendation.fromCategory);

    const updatedPatch = await prisma.aIPatch.findUniqueOrThrow({ where: { id: patch.id } });
    expect(updatedPatch.status).toBe('ROLLED_BACK');
    expect(updatedPatch.rolledBackAt).not.toBeNull();

    const updatedProposal = await prisma.aIProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updatedProposal.status).toBe('ROLLED_BACK');

    const auditLogs = await prisma.auditLog.findMany({
      where: { userId, action: { in: ['ai.rollback_requested', 'ai.rollback_succeeded'] } },
    });
    expect(auditLogs.some((log) => log.action === 'ai.rollback_requested')).toBe(true);
    expect(auditLogs.some((log) => log.action === 'ai.rollback_succeeded')).toBe(true);

    const actionLogs = await prisma.aIActionLog.findMany({ where: { userId, actionType: 'ROLLBACK' } });
    expect(actionLogs.length).toBeGreaterThan(0);
    expect(actionLogs[0]?.success).toBe(true);

    await app.close();
  });

  it('prevents cross-user apply and rollback access', async () => {
    const app = buildServer();
    const { token: ownerToken, userId } = await registerUser(app, 'owner-apply@example.com');
    await prisma.user.update({ where: { id: userId }, data: { aiAssistEnabled: true } });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: 'OwnerApply',
        amount: new Prisma.Decimal(8),
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: new Date(),
        category: 'entertainment',
      },
    });

    const creation = await app.inject({
      method: 'POST',
      url: '/api/ai/propose',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { type: 'RECATEGORIZE', subscriptionIds: [subscription.id] },
    });

    const proposal = creation.json() as { id: string };

    const other = await registerUser(app, 'other-apply@example.com');
    await prisma.user.update({ where: { id: other.userId }, data: { aiAssistEnabled: true } });

    const applyResponse = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${proposal.id}/apply`,
      headers: { authorization: `Bearer ${other.token}` },
    });

    expect(applyResponse.statusCode).toBe(404);

    const applyOwner = await app.inject({
      method: 'POST',
      url: `/api/ai/proposals/${proposal.id}/apply`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    const patch = applyOwner.json() as { id: string };

    const rollbackResponse = await app.inject({
      method: 'POST',
      url: `/api/ai/patches/${patch.id}/rollback`,
      headers: { authorization: `Bearer ${other.token}` },
    });

    expect(rollbackResponse.statusCode).toBe(404);

    await app.close();
  });
});
