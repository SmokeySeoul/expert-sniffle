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
  actionType: 'EXPLAIN' | 'PROPOSE';
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
}
