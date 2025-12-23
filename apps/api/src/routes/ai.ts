import { Prisma } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { createExplainProvider, createProposalProvider } from '../ai/providers';
import {
  EXPLAIN_TOPICS,
  PROPOSAL_TYPES,
  ExplainResult,
  ExplainTopic,
  ProposalResult,
  ProposalType,
  RecategorizeProposalPayload,
  SavingsListProposalPayload,
  SubscriptionSummary,
} from '../ai/types';
import { recordAuditLog } from '../utils/audit';
import { requirePermission } from '../utils/permissions';

type ExplainBody = {
  topic: ExplainTopic;
  subscriptionIds: string[];
};

type ProposeBody = {
  type: ProposalType;
  subscriptionIds?: string[];
};

const ACTION_PROVIDER = 'system';

function truncateSummary(text: string, max = 500): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}

function buildRedactedInput(body: ExplainBody, subscriptions: SubscriptionSummary[]): Prisma.InputJsonValue {
  return {
    topic: body.topic,
    requestedSubscriptionIds: body.subscriptionIds,
    subscriptionCount: subscriptions.length,
    subscriptionIds: subscriptions.map((sub) => sub.id),
    billingIntervals: subscriptions.map((sub) => sub.billingInterval),
  };
}

function summarizeExplainOutput(result: ExplainResult | null, fallback?: string): string {
  if (!result || result.items.length === 0) {
    return truncateSummary(fallback ?? 'No output generated');
  }

  const combined = result.items.map((item) => item.summary).join(' ');
  return truncateSummary(combined);
}

function summarizeProposalOutput(
  result: ProposalResult<RecategorizeProposalPayload | SavingsListProposalPayload> | null,
  fallback?: string,
): string {
  if (!result) {
    return truncateSummary(fallback ?? 'No output generated');
  }

  return truncateSummary(result.summary);
}

async function logAIActionEntry({
  app,
  userId,
  actionType,
  topic,
  inputRedacted,
  resultSummary,
  confidence,
  success,
  startTime,
  provider,
}: {
  app: FastifyInstance;
  userId: string;
  actionType: 'EXPLAIN' | 'PROPOSE' | 'APPLY' | 'ROLLBACK';
  topic: string;
  inputRedacted: Prisma.InputJsonValue;
  resultSummary: string;
  confidence?: number | null;
  success: boolean;
  startTime: number;
  provider: string;
}) {
  const latencyMs = Date.now() - startTime;

  await app.prisma.aIActionLog.create({
    data: {
      userId,
      actionType,
      topic,
      inputRedacted,
      outputSummary: resultSummary,
      confidence: confidence ?? null,
      provider,
      success,
      latencyMs,
    },
  });
}

function buildRedactedProposalInput(body: ProposeBody, subscriptions: SubscriptionSummary[]): Prisma.InputJsonValue {
  return {
    type: body.type,
    requestedSubscriptionIds: body.subscriptionIds ?? null,
    subscriptionCount: subscriptions.length,
    subscriptionIds: subscriptions.map((sub) => sub.id),
    billingIntervals: subscriptions.map((sub) => sub.billingInterval),
  };
}

async function expireProposals(app: FastifyInstance, userId: string): Promise<void> {
  await app.prisma.aIProposal.updateMany({
    where: { userId, status: 'ACTIVE', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
}

type RecategorizeRecommendation = {
  subscriptionId: string;
  fromCategory: string | null;
  toCategory: string | null;
  rationale?: string;
};

function parseRecategorizeRecommendations(
  payload: Prisma.JsonValue,
  { allowNullToCategory = false }: { allowNullToCategory?: boolean } = {},
): RecategorizeRecommendation[] | null {
  if (!payload || typeof payload !== 'object' || !('recommendations' in payload)) {
    return null;
  }

  const recommendations = (payload as { recommendations?: unknown }).recommendations;

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return null;
  }

  const parsed: RecategorizeRecommendation[] = [];
  for (const recommendation of recommendations) {
    const toCategory = (recommendation as { toCategory?: unknown }).toCategory;
    const invalidToCategory =
      (!allowNullToCategory && typeof toCategory !== 'string') ||
      (allowNullToCategory && toCategory !== null && typeof toCategory !== 'string');

    if (
      !recommendation ||
      typeof recommendation !== 'object' ||
      typeof (recommendation as { subscriptionId?: unknown }).subscriptionId !== 'string' ||
      invalidToCategory
    ) {
      return null;
    }

    const fromCategory = (recommendation as { fromCategory?: unknown }).fromCategory;
    if (fromCategory !== null && fromCategory !== undefined && typeof fromCategory !== 'string') {
      return null;
    }

    parsed.push({
      subscriptionId: (recommendation as { subscriptionId: string }).subscriptionId,
      fromCategory: (fromCategory as string | null | undefined) ?? null,
      toCategory: (toCategory as string | null),
      rationale: typeof (recommendation as { rationale?: unknown }).rationale === 'string'
        ? (recommendation as { rationale: string }).rationale
        : undefined,
    });
  }

  return parsed;
}

function buildForwardPatch(recommendations: RecategorizeRecommendation[]): Prisma.InputJsonObject {
  return {
    recommendations: recommendations.map((recommendation) => ({
      subscriptionId: recommendation.subscriptionId,
      fromCategory: recommendation.fromCategory,
      toCategory: recommendation.toCategory,
    })),
  };
}

function buildRollbackPatch(recommendations: RecategorizeRecommendation[]): Prisma.InputJsonObject {
  return {
    recommendations: recommendations.map((recommendation) => ({
      subscriptionId: recommendation.subscriptionId,
      fromCategory: recommendation.toCategory,
      toCategory: recommendation.fromCategory,
    })),
  };
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const explainProvider = createExplainProvider();
  const proposalProvider = createProposalProvider();

  app.get(
    '/status',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch {
        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      reply.send({ enabled: true, provider: explainProvider.name });
    },
  );

  app.post<{ Body: ExplainBody }>(
    '/explain',
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['topic', 'subscriptionIds'],
          properties: {
            topic: { type: 'string', enum: EXPLAIN_TOPICS },
            subscriptionIds: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const userId = request.authUser!.sub;
      const startTime = Date.now();
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch (error) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.explain_failed',
          metadata: { topic: body.topic, subscriptionIds: body.subscriptionIds, reason: 'permission_denied' },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'EXPLAIN',
          topic: body.topic,
          inputRedacted: buildRedactedInput(body, []),
          resultSummary: truncateSummary('AI assistance disabled'),
          confidence: null,
          success: false,
          startTime,
          provider: explainProvider.name,
        });

        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      const subscriptions = await app.prisma.subscription.findMany({
        where: {
          userId,
          id: { in: body.subscriptionIds },
        },
        orderBy: { createdAt: 'asc' },
      });

      const summaries: SubscriptionSummary[] = subscriptions.map((sub) => ({
        id: sub.id,
        name: sub.name,
        amount: Number(sub.amount),
        currency: sub.currency,
        billingInterval: sub.billingInterval,
        nextBillingDate: sub.nextBillingDate.toISOString(),
        category: sub.category,
        isTrial: sub.isTrial,
      }));

      if (summaries.length !== body.subscriptionIds.length) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.explain_failed',
          metadata: {
            topic: body.topic,
            subscriptionIds: body.subscriptionIds,
            reason: 'subscription_not_found',
          },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'EXPLAIN',
          topic: body.topic,
          inputRedacted: buildRedactedInput(body, summaries),
          resultSummary: truncateSummary('Subscription not found'),
          confidence: null,
          success: false,
          startTime,
          provider: explainProvider.name,
        });

        reply.status(404).send({ error: 'Subscription not found' });
        return;
      }

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'ai.explain_requested',
        metadata: {
          topic: body.topic,
          subscriptionIds: body.subscriptionIds,
          provider: explainProvider.name,
        },
      });

      try {
        const result = await explainProvider.explain(body.topic, summaries);

        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.explain_succeeded',
          metadata: {
            topic: body.topic,
            subscriptionIds: body.subscriptionIds,
            provider: explainProvider.name,
            confidence: result.confidence,
          },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'EXPLAIN',
          topic: body.topic,
          inputRedacted: buildRedactedInput(body, summaries),
          resultSummary: summarizeExplainOutput(result),
          confidence: result.confidence ?? null,
          success: true,
          startTime,
          provider: explainProvider.name,
        });

        reply.send(result);
      } catch (error) {
        request.log.error({ err: error as Error }, 'AI explain failed');

        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.explain_failed',
          metadata: {
            topic: body.topic,
            subscriptionIds: body.subscriptionIds,
            provider: explainProvider.name,
            reason: 'provider_error',
          },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'EXPLAIN',
          topic: body.topic,
          inputRedacted: buildRedactedInput(body, summaries),
          resultSummary: truncateSummary('Unable to generate explanation'),
          confidence: null,
          success: false,
          startTime,
          provider: explainProvider.name,
        });

        reply.status(500).send({ error: 'Unable to generate explanation' });
      }
    },
  );

  app.post<{ Body: ProposeBody }>(
    '/propose',
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: PROPOSAL_TYPES },
            subscriptionIds: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const userId = request.authUser!.sub;
      const startTime = Date.now();
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch (error) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.propose_failed',
          metadata: { type: body.type, subscriptionIds: body.subscriptionIds ?? [], reason: 'permission_denied' },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'PROPOSE',
          topic: body.type,
          inputRedacted: buildRedactedProposalInput(body, []),
          resultSummary: truncateSummary('AI assistance disabled'),
          confidence: null,
          success: false,
          startTime,
          provider: proposalProvider.name,
        });

        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      if (!PROPOSAL_TYPES.includes(body.type)) {
        reply.status(400).send({ error: 'Unsupported proposal type' });
        return;
      }

      const subscriptions = await app.prisma.subscription.findMany({
        where: {
          userId,
          ...(body.subscriptionIds ? { id: { in: body.subscriptionIds } } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });

      const summaries: SubscriptionSummary[] = subscriptions.map((sub) => ({
        id: sub.id,
        name: sub.name,
        amount: Number(sub.amount),
        currency: sub.currency,
        billingInterval: sub.billingInterval,
        nextBillingDate: sub.nextBillingDate.toISOString(),
        category: sub.category,
        isTrial: sub.isTrial,
      }));

      if (body.subscriptionIds && summaries.length !== body.subscriptionIds.length) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.propose_failed',
          metadata: {
            type: body.type,
            subscriptionIds: body.subscriptionIds,
            reason: 'subscription_not_found',
          },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'PROPOSE',
          topic: body.type,
          inputRedacted: buildRedactedProposalInput(body, summaries),
          resultSummary: truncateSummary('Subscription not found'),
          confidence: null,
          success: false,
          startTime,
          provider: proposalProvider.name,
        });

        reply.status(404).send({ error: 'Subscription not found' });
        return;
      }

      if (summaries.length === 0) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.propose_failed',
          metadata: { type: body.type, reason: 'no_subscriptions' },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'PROPOSE',
          topic: body.type,
          inputRedacted: buildRedactedProposalInput(body, summaries),
          resultSummary: truncateSummary('No subscriptions available'),
          confidence: null,
          success: false,
          startTime,
          provider: proposalProvider.name,
        });

        reply.status(404).send({ error: 'No subscriptions found' });
        return;
      }

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'ai.propose_requested',
        metadata: {
          type: body.type,
          subscriptionIds: body.subscriptionIds ?? summaries.map((sub) => sub.id),
          provider: proposalProvider.name,
        },
      });

      try {
        const result =
          body.type === 'RECATEGORIZE'
            ? await proposalProvider.proposeRecategorize(summaries)
            : await proposalProvider.proposeSavingsList(summaries);

        const proposal = await app.prisma.aIProposal.create({
          data: {
            userId,
            type: body.type,
            status: 'ACTIVE',
            title: result.title,
            summary: result.summary,
            payload: result.payload as Prisma.JsonObject,
            confidence: result.confidence ?? null,
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });

        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.propose_succeeded',
          metadata: {
            type: body.type,
            proposalId: proposal.id,
            provider: proposalProvider.name,
            confidence: result.confidence,
          },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'PROPOSE',
          topic: body.type,
          inputRedacted: buildRedactedProposalInput(body, summaries),
          resultSummary: summarizeProposalOutput(result),
          confidence: result.confidence ?? null,
          success: true,
          startTime,
          provider: proposalProvider.name,
        });

        reply.send(proposal);
      } catch (error) {
        request.log.error({ err: error as Error }, 'AI proposal generation failed');

        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.propose_failed',
          metadata: {
            type: body.type,
            subscriptionIds: body.subscriptionIds ?? summaries.map((sub) => sub.id),
            provider: proposalProvider.name,
            reason: 'provider_error',
          },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'PROPOSE',
          topic: body.type,
          inputRedacted: buildRedactedProposalInput(body, summaries),
          resultSummary: truncateSummary('Unable to generate proposal'),
          confidence: null,
          success: false,
          startTime,
          provider: proposalProvider.name,
        });

        reply.status(500).send({ error: 'Unable to generate proposal' });
      }
    },
  );

  app.get(
    '/proposals',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch {
        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      await expireProposals(app, userId);

      const proposals = await app.prisma.aIProposal.findMany({
        where: { userId, status: { in: ['ACTIVE', 'DISMISSED'] }, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });

      reply.send(proposals);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/proposals/:id',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const id = request.params.id;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch {
        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      await expireProposals(app, userId);

      const proposal = await app.prisma.aIProposal.findFirst({
        where: {
          id,
          userId,
          status: { in: ['ACTIVE', 'DISMISSED'] },
          expiresAt: { gt: new Date() },
        },
      });

      if (!proposal) {
        reply.status(404).send({ error: 'Proposal not found' });
        return;
      }

      reply.send(proposal);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/dismiss',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const id = request.params.id;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch {
        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      const proposal = await app.prisma.aIProposal.findFirst({
        where: { id, userId },
      });

      if (!proposal) {
        reply.status(404).send({ error: 'Proposal not found' });
        return;
      }

      const updated = await app.prisma.aIProposal.update({
        where: { id },
        data: { status: 'DISMISSED' },
      });

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'ai.proposal.dismissed',
        metadata: { proposalId: id },
      });

      reply.send(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/apply',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const proposalId = request.params.id;
      const startTime = Date.now();
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch {
        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      const proposal = await app.prisma.aIProposal.findFirst({ where: { id: proposalId, userId } });

      if (!proposal) {
        reply.status(404).send({ error: 'Proposal not found' });
        return;
      }

      if (proposal.type !== 'RECATEGORIZE') {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.apply_failed',
          metadata: { proposalId, reason: 'unsupported_type', proposalType: proposal.type },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'APPLY',
          topic: proposal.type,
          inputRedacted: { proposalId },
          resultSummary: truncateSummary('Only RECATEGORIZE proposals can be applied'),
          confidence: null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(400).send({ error: 'Only RECATEGORIZE proposals can be applied' });
        return;
      }

      if (proposal.status !== 'ACTIVE') {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.apply_failed',
          metadata: { proposalId, reason: 'invalid_status', proposalStatus: proposal.status },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'APPLY',
          topic: proposal.type,
          inputRedacted: { proposalId },
          resultSummary: truncateSummary('Proposal is not active'),
          confidence: null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(400).send({ error: 'Proposal is not active' });
        return;
      }

      const recommendations = parseRecategorizeRecommendations(proposal.payload);

      if (!recommendations) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.apply_failed',
          metadata: { proposalId, reason: 'invalid_payload' },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'APPLY',
          topic: proposal.type,
          inputRedacted: { proposalId },
          resultSummary: truncateSummary('Proposal payload is invalid'),
          confidence: null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(400).send({ error: 'Invalid proposal payload' });
        return;
      }

      const subscriptionIds = recommendations.map((recommendation) => recommendation.subscriptionId);
      const subscriptions = await app.prisma.subscription.findMany({
        where: { userId, id: { in: subscriptionIds } },
      });

      if (subscriptions.length !== subscriptionIds.length) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.apply_failed',
          metadata: { proposalId, reason: 'subscription_not_found' },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'APPLY',
          topic: proposal.type,
          inputRedacted: { proposalId, subscriptionIds },
          resultSummary: truncateSummary('Subscription not found'),
          confidence: null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(404).send({ error: 'Subscription not found' });
        return;
      }

      const stale = recommendations.find((recommendation) => {
        const subscription = subscriptions.find((sub) => sub.id === recommendation.subscriptionId);
        return (subscription?.category ?? null) !== recommendation.fromCategory;
      });

      if (stale) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.apply_failed',
          metadata: { proposalId, reason: 'stale_subscription_category', subscriptionId: stale.subscriptionId },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'APPLY',
          topic: proposal.type,
          inputRedacted: { proposalId, subscriptionIds },
          resultSummary: truncateSummary('Subscription category has changed'),
          confidence: null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(409).send({ error: 'Subscription category has changed' });
        return;
      }

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'ai.apply_requested',
        metadata: { proposalId, subscriptionIds },
      });

      const forwardPatch = buildForwardPatch(recommendations);
      const rollbackPatch = buildRollbackPatch(recommendations);

      try {
        const patch = await app.prisma.$transaction(async (tx) => {
          for (const recommendation of recommendations) {
            await tx.subscription.update({
              where: { id: recommendation.subscriptionId },
              data: { category: recommendation.toCategory },
            });
          }

          const createdPatch = await tx.aIPatch.create({
            data: {
              userId,
              proposalId,
              type: 'RECATEGORIZE',
              status: 'APPLIED',
              forwardPatch,
              rollbackPatch,
              appliedAt: new Date(),
            },
          });

          await tx.aIProposal.update({
            where: { id: proposalId },
            data: { status: 'APPLIED' },
          });

          return createdPatch;
        });

        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.apply_succeeded',
          metadata: { proposalId, patchId: patch.id },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'APPLY',
          topic: proposal.type,
          inputRedacted: { proposalId, subscriptionIds },
          resultSummary: truncateSummary(proposal.summary ?? 'Applied proposal'),
          confidence: proposal.confidence ?? null,
          success: true,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.send(patch);
      } catch (error) {
        request.log.error({ err: error as Error }, 'Applying proposal failed');

        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.apply_failed',
          metadata: { proposalId, reason: 'apply_error' },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'APPLY',
          topic: proposal.type,
          inputRedacted: { proposalId, subscriptionIds },
          resultSummary: truncateSummary('Unable to apply proposal'),
          confidence: proposal.confidence ?? null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(500).send({ error: 'Unable to apply proposal' });
      }
    },
  );

  app.get(
    '/patches',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch {
        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      const patches = await app.prisma.aIPatch.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      reply.send(patches);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/patches/:id',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const id = request.params.id;
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch {
        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      const patch = await app.prisma.aIPatch.findFirst({
        where: { id, userId },
      });

      if (!patch) {
        reply.status(404).send({ error: 'Patch not found' });
        return;
      }

      reply.send(patch);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/patches/:id/rollback',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const patchId = request.params.id;
      const startTime = Date.now();
      const user = await app.prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      try {
        requirePermission(user, 'aiAssistEnabled');
      } catch {
        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      const patch = await app.prisma.aIPatch.findFirst({ where: { id: patchId, userId } });

      if (!patch) {
        reply.status(404).send({ error: 'Patch not found' });
        return;
      }

      if (patch.status !== 'APPLIED') {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.rollback_failed',
          metadata: { patchId, reason: 'invalid_status', patchStatus: patch.status },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'ROLLBACK',
          topic: patch.type,
          inputRedacted: { patchId },
          resultSummary: truncateSummary('Patch has already been rolled back'),
          confidence: null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(400).send({ error: 'Patch has already been rolled back' });
        return;
      }

      const rollback = parseRecategorizeRecommendations(patch.rollbackPatch, { allowNullToCategory: true });

      if (!rollback) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.rollback_failed',
          metadata: { patchId, reason: 'invalid_patch' },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'ROLLBACK',
          topic: patch.type,
          inputRedacted: { patchId },
          resultSummary: truncateSummary('Patch payload is invalid'),
          confidence: null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(400).send({ error: 'Invalid patch payload' });
        return;
      }

      const subscriptionIds = rollback.map((item) => item.subscriptionId);
      const subscriptions = await app.prisma.subscription.findMany({
        where: { userId, id: { in: subscriptionIds } },
      });

      if (subscriptions.length !== subscriptionIds.length) {
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.rollback_failed',
          metadata: { patchId, reason: 'subscription_not_found' },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'ROLLBACK',
          topic: patch.type,
          inputRedacted: { patchId, subscriptionIds },
          resultSummary: truncateSummary('Subscription not found'),
          confidence: null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(404).send({ error: 'Subscription not found' });
        return;
      }

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'ai.rollback_requested',
        metadata: { patchId, subscriptionIds },
      });

      try {
        const updatedPatch = await app.prisma.$transaction(async (tx) => {
          for (const item of rollback) {
            await tx.subscription.update({
              where: { id: item.subscriptionId },
              data: { category: item.toCategory ?? null },
            });
          }

          const savedPatch = await tx.aIPatch.update({
            where: { id: patchId },
            data: { status: 'ROLLED_BACK', rolledBackAt: new Date() },
          });

          await tx.aIProposal.update({
            where: { id: patch.proposalId },
            data: { status: 'ROLLED_BACK' },
          });

          return savedPatch;
        });

        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.rollback_succeeded',
          metadata: { patchId, proposalId: patch.proposalId },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'ROLLBACK',
          topic: patch.type,
          inputRedacted: { patchId, subscriptionIds },
          resultSummary: truncateSummary('Rollback applied'),
          confidence: null,
          success: true,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.send(updatedPatch);
      } catch (error) {
        request.log.error({ err: error as Error }, 'Rollback failed');

        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.rollback_failed',
          metadata: { patchId, reason: 'rollback_error' },
        });

        await logAIActionEntry({
          app,
          userId,
          actionType: 'ROLLBACK',
          topic: patch.type,
          inputRedacted: { patchId, subscriptionIds },
          resultSummary: truncateSummary('Unable to roll back patch'),
          confidence: null,
          success: false,
          startTime,
          provider: ACTION_PROVIDER,
        });

        reply.status(500).send({ error: 'Unable to roll back patch' });
      }
    },
  );
}
