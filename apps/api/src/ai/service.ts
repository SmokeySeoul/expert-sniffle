import { prisma } from '../prisma';
import { audit } from '../utils/audit';
import { env } from '../env';
import { getProvider, redactSubscriptions, ExplainTopic, RedactedSubscriptionWithMeta, RecategorizeProposalItem, SavingsProposalItem } from './provider';
import { performance } from 'perf_hooks';
import { AIActionType, AIProposalStatus, AIProposalType, AIPatchStatus } from '@prisma/client';
import { RecategorizePatch } from '@substream/shared';

export async function explainAI({ userId, deviceId, sessionId, topic, subscriptionIds }: { userId: string; deviceId?: string; sessionId?: string; topic: ExplainTopic; subscriptionIds?: string[] }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.aiAssistEnabled) {
    const err: any = new Error('AI assistance disabled');
    err.statusCode = 403;
    throw err;
  }

  const subs = await prisma.subscription.findMany({
    where: {
      userId,
      ...(subscriptionIds?.length ? { id: { in: subscriptionIds } } : {})
    }
  });

  if (subscriptionIds?.length && subs.length !== subscriptionIds.length) {
    const err: any = new Error('Subscription not found');
    err.statusCode = 404;
    throw err;
  }

  const redacted = redactSubscriptions(subs);
  const provider = getProvider();

  const start = performance.now();
  await audit({ userId, deviceId, sessionId, action: 'ai.explain_requested', metadata: { topic, provider: env.AI_PROVIDER, subscriptionCount: subs.length } });

  try {
    const items = await Promise.race([
      provider.explain(topic, redacted),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), env.AI_TIMEOUT_MS))
    ]);
    const latencyMs = Math.round(performance.now() - start);
    await prisma.aIActionLog.create({
      data: {
        userId,
        deviceId,
        sessionId,
        actionType: 'EXPLAIN',
        topic,
        inputSummary: { topic, subscriptionCount: subs.length },
        outputSummary: items.map((i) => ({ title: i.title, confidence: i.confidence })),
        provider: env.AI_PROVIDER,
        latencyMs,
        success: true
      }
    });
    await audit({ userId, deviceId, sessionId, action: 'ai.explain_succeeded', metadata: { topic, provider: env.AI_PROVIDER, subscriptionCount: subs.length } });
    return items;
  } catch (error: any) {
    const latencyMs = Math.round(performance.now() - start);
    await prisma.aIActionLog.create({
      data: {
        userId,
        deviceId,
        sessionId,
        actionType: 'EXPLAIN',
        topic,
        inputSummary: { topic, subscriptionCount: subs.length },
        outputSummary: [],
        provider: env.AI_PROVIDER,
        latencyMs,
        success: false
      }
    });
    await audit({ userId, deviceId, sessionId, action: 'ai.explain_failed', metadata: { topic, provider: env.AI_PROVIDER } });
    if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      const err: any = new Error('AI provider unavailable');
      err.statusCode = 503;
      throw err;
    }
    error.statusCode = error.statusCode || 500;
    throw error;
  }
}

function toRedactedSubsWithMeta(subs: any[]): RedactedSubscriptionWithMeta[] {
  return subs.map((s) => ({
    ...redactSubscriptions([s])[0],
    id: s.id,
    fromCategory: s.category || null
  }));
}

export async function proposeAI({
  userId,
  deviceId,
  sessionId,
  type,
  subscriptionIds
}: {
  userId: string;
  deviceId?: string;
  sessionId?: string;
  type: AIProposalType;
  subscriptionIds?: string[];
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.aiAssistEnabled) {
    const err: any = new Error('AI assistance disabled');
    err.statusCode = 403;
    throw err;
  }

  const subs = await prisma.subscription.findMany({
    where: {
      userId,
      ...(subscriptionIds?.length ? { id: { in: subscriptionIds } } : {})
    }
  });

  if (subscriptionIds?.length && subs.length !== subscriptionIds.length) {
    const err: any = new Error('Subscription not found');
    err.statusCode = 404;
    throw err;
  }

  const redacted = toRedactedSubsWithMeta(subs);
  const provider = getProvider();
  const start = performance.now();
  await audit({
    userId,
    deviceId,
    sessionId,
    action: 'ai.propose_requested',
    metadata: { type, provider: env.AI_PROVIDER, subscriptionCount: subs.length }
  });

  try {
    let items: RecategorizeProposalItem[] | SavingsProposalItem[] = [];
    if (type === AIProposalType.RECATEGORIZE) {
      items = await Promise.race([
        provider.proposeRecategorize(redacted),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), env.AI_TIMEOUT_MS))
      ]);
    } else {
      const raw = await Promise.race([
        provider.proposeSavingsList(redacted),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), env.AI_TIMEOUT_MS))
      ]);
      items = raw.map((item) => {
        const sub = subs.find((s) => s.id === item.subscriptionId);
        const amount = sub?.amount ?? 0;
        const delta = Number((amount * 12 * 0.1).toFixed(2));
        return { ...item, potentialAnnualDelta: delta };
      });
    }

    const latencyMs = Math.round(performance.now() - start);
    const avgConfidence =
      items.length > 0 ? Number((items.reduce((sum, i: any) => sum + (i.confidence ?? 0), 0) / items.length).toFixed(2)) : null;

    const proposal = await prisma.aIProposal.create({
      data: {
        userId,
        deviceId,
        sessionId,
        type,
        status: AIProposalStatus.ACTIVE,
        title: type === AIProposalType.RECATEGORIZE ? 'Recategorize suggestions' : 'Savings candidates',
        summary: type === AIProposalType.RECATEGORIZE ? 'Bulk recategorize proposal' : 'Savings candidate list',
        payload: { items },
        confidence: avgConfidence,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.aIActionLog.create({
      data: {
        userId,
        deviceId,
        sessionId,
        actionType: AIActionType.PROPOSE,
        topic: type,
        inputSummary: { type, subscriptionCount: subs.length },
        outputSummary: { itemCount: items.length },
        provider: env.AI_PROVIDER,
        latencyMs,
        success: true
      }
    });
    await audit({
      userId,
      deviceId,
      sessionId,
      action: 'ai.propose_succeeded',
      metadata: { type, provider: env.AI_PROVIDER, subscriptionCount: subs.length }
    });

    return { proposalId: proposal.id, proposal };
  } catch (error: any) {
    const latencyMs = Math.round(performance.now() - start);
    await prisma.aIActionLog.create({
      data: {
        userId,
        deviceId,
        sessionId,
        actionType: AIActionType.PROPOSE,
        topic: type,
        inputSummary: { type, subscriptionCount: subs.length },
        outputSummary: [],
        provider: env.AI_PROVIDER,
        latencyMs,
        success: false
      }
    });
    await audit({ userId, deviceId, sessionId, action: 'ai.propose_failed', metadata: { type, provider: env.AI_PROVIDER } });
    if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      const err: any = new Error('AI provider unavailable');
      err.statusCode = 503;
      throw err;
    }
    error.statusCode = error.statusCode || 500;
    throw error;
  }
}

function buildRecategorizePatch(items: RecategorizeProposalItem[]): RecategorizePatch {
  return {
    type: 'RECATEGORIZE',
    changes: items.map((i) => ({
      subscriptionId: i.subscriptionId,
      fromCategory: i.fromCategory ?? null,
      toCategory: i.toCategory ?? null
    }))
  };
}

export async function applyProposal({
  userId,
  deviceId,
  sessionId,
  proposalId
}: {
  userId: string;
  deviceId?: string;
  sessionId?: string;
  proposalId: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.aiAssistEnabled) {
    const err: any = new Error('AI assistance disabled');
    err.statusCode = 403;
    throw err;
  }

  const proposal = await prisma.aIProposal.findFirst({ where: { id: proposalId, userId } });
  if (!proposal) {
    const err: any = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  if (proposal.status !== AIProposalStatus.ACTIVE) {
    const err: any = new Error('Proposal not active');
    err.statusCode = 409;
    throw err;
  }
  if (proposal.type !== AIProposalType.RECATEGORIZE) {
    const err: any = new Error('Proposal type not applicable');
    err.statusCode = 400;
    throw err;
  }
  if (proposal.expiresAt.getTime() < Date.now()) {
    const err: any = new Error('Proposal expired');
    err.statusCode = 409;
    throw err;
  }

  const payload = proposal.payload as any;
  const items: RecategorizeProposalItem[] = (payload?.items ?? []) as RecategorizeProposalItem[];
  const patch = buildRecategorizePatch(items);
  const subscriptionIds = patch.changes.map((c) => c.subscriptionId);
  const subs = await prisma.subscription.findMany({ where: { id: { in: subscriptionIds }, userId } });
  if (subs.length !== subscriptionIds.length) {
    const err: any = new Error('Subscription not found');
    err.statusCode = 404;
    throw err;
  }

  // validate fromCategory matches current
  const mismatches = patch.changes.filter((change) => {
    const sub = subs.find((s) => s.id === change.subscriptionId)!;
    const current = sub.category ?? null;
    return current !== change.fromCategory;
  });
  if (mismatches.length > 0) {
    const err: any = new Error('Subscriptions changed since proposal');
    err.statusCode = 409;
    throw err;
  }

  const inversePatch: RecategorizePatch = {
    type: 'RECATEGORIZE',
    changes: patch.changes.map((c) => ({
      subscriptionId: c.subscriptionId,
      fromCategory: c.toCategory ?? null,
      toCategory: c.fromCategory ?? null
    }))
  };

  await audit({ userId, deviceId, sessionId, action: 'ai.apply_requested', metadata: { proposalId, changeCount: patch.changes.length } });
  const start = performance.now();

  try {
    const result = await prisma.$transaction(async (tx) => {
      for (const change of patch.changes) {
        await tx.subscription.update({
          where: { id: change.subscriptionId },
          data: { category: change.toCategory }
        });
      }
      const createdPatch = await tx.aIPatch.create({
        data: {
          userId,
          proposalId,
          status: AIPatchStatus.APPLIED,
          patch,
          inversePatch,
          appliedAt: new Date()
        }
      });
      await tx.aIProposal.update({
        where: { id: proposalId },
        data: { status: AIProposalStatus.APPLIED, appliedPatchId: createdPatch.id }
      });
      return createdPatch;
    });

    const latencyMs = Math.round(performance.now() - start);
    await prisma.aIActionLog.create({
      data: {
        userId,
        deviceId,
        sessionId,
        actionType: AIActionType.APPLY,
        topic: proposalId,
        inputSummary: { proposalId },
        outputSummary: { changeCount: patch.changes.length },
        provider: env.AI_PROVIDER,
        latencyMs,
        success: true
      }
    });
    await audit({
      userId,
      deviceId,
      sessionId,
      action: 'ai.apply_succeeded',
      metadata: { proposalId, changeCount: patch.changes.length }
    });

    const updatedSubs = await prisma.subscription.findMany({ where: { id: { in: subscriptionIds } } });
    return { patchId: result.id, updated: updatedSubs.length };
  } catch (error: any) {
    const latencyMs = Math.round(performance.now() - start);
    await prisma.aIActionLog.create({
      data: {
        userId,
        deviceId,
        sessionId,
        actionType: AIActionType.APPLY,
        topic: proposalId,
        inputSummary: { proposalId },
        outputSummary: { changeCount: patch.changes.length },
        provider: env.AI_PROVIDER,
        latencyMs,
        success: false
      }
    });
    await audit({ userId, deviceId, sessionId, action: 'ai.apply_failed', metadata: { proposalId } });
    error.statusCode = error.statusCode || 500;
    throw error;
  }
}

export async function rollbackPatch({
  userId,
  deviceId,
  sessionId,
  patchId
}: {
  userId: string;
  deviceId?: string;
  sessionId?: string;
  patchId: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.aiAssistEnabled) {
    const err: any = new Error('AI assistance disabled');
    err.statusCode = 403;
    throw err;
  }
  const patch = await prisma.aIPatch.findFirst({ where: { id: patchId, userId }, include: { proposal: true } });
  if (!patch) {
    const err: any = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  if (patch.status === AIPatchStatus.ROLLED_BACK) {
    const err: any = new Error('Already rolled back');
    err.statusCode = 409;
    throw err;
  }
  const inv = patch.inversePatch as RecategorizePatch;
  if (inv.type !== 'RECATEGORIZE') {
    const err: any = new Error('Unsupported patch type');
    err.statusCode = 400;
    throw err;
  }

  await audit({ userId, deviceId, sessionId, action: 'ai.rollback_requested', metadata: { patchId, changeCount: inv.changes.length } });
  const start = performance.now();
  try {
    await prisma.$transaction(async (tx) => {
      for (const change of inv.changes) {
        await tx.subscription.update({
          where: { id: change.subscriptionId },
          data: { category: change.toCategory }
        });
      }
      await tx.aIPatch.update({
        where: { id: patchId },
        data: { status: AIPatchStatus.ROLLED_BACK, rolledBackAt: new Date() }
      });
      await tx.aIProposal.update({
        where: { id: patch.proposalId },
        data: { status: AIProposalStatus.ROLLED_BACK }
      });
    });
    const latencyMs = Math.round(performance.now() - start);
    await prisma.aIActionLog.create({
      data: {
        userId,
        deviceId,
        sessionId,
        actionType: AIActionType.ROLLBACK,
        topic: patch.proposalId,
        inputSummary: { patchId },
        outputSummary: { changeCount: inv.changes.length },
        provider: env.AI_PROVIDER,
        latencyMs,
        success: true
      }
    });
    await audit({
      userId,
      deviceId,
      sessionId,
      action: 'ai.rollback_succeeded',
      metadata: { patchId, changeCount: inv.changes.length }
    });
    const updatedSubs = await prisma.subscription.findMany({ where: { id: { in: inv.changes.map((c) => c.subscriptionId) } } });
    return { rolledBack: updatedSubs.length };
  } catch (error: any) {
    const latencyMs = Math.round(performance.now() - start);
    await prisma.aIActionLog.create({
      data: {
        userId,
        deviceId,
        sessionId,
        actionType: AIActionType.ROLLBACK,
        topic: patch.proposalId,
        inputSummary: { patchId },
        outputSummary: { changeCount: inv.changes.length },
        provider: env.AI_PROVIDER,
        latencyMs,
        success: false
      }
    });
    await audit({ userId, deviceId, sessionId, action: 'ai.rollback_failed', metadata: { patchId } });
    error.statusCode = error.statusCode || 500;
    throw error;
  }
}
