import { Prisma } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { createExplainProvider } from '../ai/providers';
import { EXPLAIN_TOPICS, ExplainResult, ExplainTopic, SubscriptionSummary } from '../ai/types';
import { recordAuditLog } from '../utils/audit';
import { requirePermission } from '../utils/permissions';

type ExplainBody = {
  topic: ExplainTopic;
  subscriptionIds: string[];
};

function truncateSummary(text: string, max = 500): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}

function buildRedactedInput(body: ExplainBody, subscriptions: SubscriptionSummary[]): Prisma.JsonValue {
  return {
    topic: body.topic,
    requestedSubscriptionIds: body.subscriptionIds,
    subscriptionCount: subscriptions.length,
    subscriptionIds: subscriptions.map((sub) => sub.id),
    billingIntervals: subscriptions.map((sub) => sub.billingInterval),
  };
}

function summarizeOutput(result: ExplainResult | null, fallback?: string): string {
  if (!result || result.items.length === 0) {
    return truncateSummary(fallback ?? 'No output generated');
  }

  const combined = result.items.map((item) => item.summary).join(' ');
  return truncateSummary(combined);
}

async function logAIAction({
  app,
  userId,
  body,
  subscriptions,
  result,
  success,
  startTime,
  provider,
  errorMessage,
}: {
  app: FastifyInstance;
  userId: string;
  body: ExplainBody;
  subscriptions: SubscriptionSummary[];
  result: ExplainResult | null;
  success: boolean;
  startTime: number;
  provider: string;
  errorMessage?: string;
}) {
  const latencyMs = Date.now() - startTime;
  const summary = success ? summarizeOutput(result) : truncateSummary(errorMessage ?? 'Failed');

  await app.prisma.aIActionLog.create({
    data: {
      userId,
      actionType: 'EXPLAIN',
      topic: body.topic,
      inputRedacted: buildRedactedInput(body, subscriptions),
      outputSummary: summary,
      confidence: result?.confidence ?? null,
      provider,
      success,
      latencyMs,
    },
  });
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const explainProvider = createExplainProvider();

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

        await logAIAction({
          app,
          userId,
          body,
          subscriptions: [],
          result: null,
          success: false,
          startTime,
          provider: explainProvider.name,
          errorMessage: 'AI assistance disabled',
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

        await logAIAction({
          app,
          userId,
          body,
          subscriptions: summaries,
          result: null,
          success: false,
          startTime,
          provider: explainProvider.name,
          errorMessage: 'Subscription not found',
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

        await logAIAction({
          app,
          userId,
          body,
          subscriptions: summaries,
          result,
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

        await logAIAction({
          app,
          userId,
          body,
          subscriptions: summaries,
          result: null,
          success: false,
          startTime,
          provider: explainProvider.name,
          errorMessage: 'Unable to generate explanation',
        });

        reply.status(500).send({ error: 'Unable to generate explanation' });
      }
    },
  );
}
