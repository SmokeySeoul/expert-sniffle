import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { explainAI, proposeAI, applyProposal, rollbackPatch } from '../ai/service';
import { prisma } from '../prisma';
import { AIProposalStatus, AIProposalType } from '@prisma/client';

const explainSchema = z.object({
  topic: z.enum(['duplicate', 'yearly_vs_monthly', 'category_rationale']),
  subscriptionIds: z.array(z.string()).optional()
});

const logsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).optional()
});

const explainBodyJsonSchema = {
  type: 'object',
  required: ['topic'],
  properties: {
    topic: { type: 'string', enum: ['duplicate', 'yearly_vs_monthly', 'category_rationale'] },
    subscriptionIds: { type: 'array', items: { type: 'string' } }
  },
  additionalProperties: false
};

const proposeBodySchema = z.object({
  type: z.nativeEnum(AIProposalType),
  subscriptionIds: z.array(z.string()).optional()
});

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.get('/ai/status', async (request, reply) => {
    await fastify.authenticate(request as any, reply);
    if (reply.sent) return;
    const userId = (request as any).user?.userId;
    const user = await (await import('../prisma')).prisma.user.findUnique({ where: { id: userId } });
    const enabled = !!user?.aiAssistEnabled;
    return { enabled, provider: env.AI_PROVIDER };
  });

  fastify.post(
    '/ai/explain',
    {
      schema: {
        description: 'Explain subscriptions using AI (requires Authorization bearer token)',
        body: explainBodyJsonSchema,
        response: {
          200: {
            type: 'object',
            properties: { items: { type: 'array', items: { type: 'object' } } },
            additionalProperties: false
          },
          401: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          403: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
          404: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
          500: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] }
        }
      }
    },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      const parsed = explainSchema.parse(request.body);
      try {
        const items = await explainAI({
          userId: request.user!.userId,
          deviceId: request.user!.deviceId,
          sessionId: request.user!.sessionId,
          topic: parsed.topic,
          subscriptionIds: parsed.subscriptionIds
        });
        return { items };
      } catch (err: any) {
        const code = err.statusCode || 500;
        return reply.code(code).send({ message: err.message || 'AI failed' });
      }
    }
  );

  fastify.get(
    '/ai/logs',
    {
      schema: {
        description: 'List AI action logs (requires Authorization bearer token)',
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 50 }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    topic: { type: 'string' },
                    provider: { type: 'string' },
                    success: { type: 'boolean' },
                    latencyMs: { type: 'number' },
                    createdAt: { type: 'string', format: 'date-time' }
                  },
                  required: ['id', 'topic', 'provider', 'success', 'latencyMs', 'createdAt']
                }
              },
              nextCursor: { type: 'string', nullable: true }
            },
            required: ['items']
          },
          401: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] }
        }
      }
    },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      const parsed = logsQuerySchema.parse(request.query);
      const limit = parsed.limit ?? 20;
      const cursor = parsed.cursor;
      const userId = request.user!.userId;

      const logs = await (await import('../prisma')).prisma.aIActionLog.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
      });
      const items = logs.slice(0, limit).map((log) => ({
        id: log.id,
        topic: log.topic,
        provider: log.provider,
        success: log.success,
        latencyMs: log.latencyMs,
        createdAt: log.createdAt.toISOString()
      }));
      const nextCursor = logs.length > limit ? logs[limit].id : null;

      await (await import('../utils/audit')).audit({
        userId,
        deviceId: request.user!.deviceId,
        sessionId: request.user!.sessionId,
        action: 'ai.logs_viewed',
        metadata: { limit }
      });

      return { items, nextCursor };
    }
  );

  fastify.post(
    '/ai/propose',
    {
      schema: {
        description: 'Generate AI proposal (requires Authorization bearer token)',
        body: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ['RECATEGORIZE', 'SAVINGS_LIST'] },
            subscriptionIds: { type: 'array', items: { type: 'string' } }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              proposalId: { type: 'string' },
              proposal: { type: 'object' }
            },
            required: ['proposalId', 'proposal']
          },
          401: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          403: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
          404: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] }
        }
      }
    },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      const parsed = proposeBodySchema.parse(request.body);
      try {
        const result = await proposeAI({
          userId: request.user!.userId,
          deviceId: request.user!.deviceId,
          sessionId: request.user!.sessionId,
          type: parsed.type,
          subscriptionIds: parsed.subscriptionIds
        });
        return result;
      } catch (err: any) {
        const code = err.statusCode || 500;
        return reply.code(code).send({ message: err.message || 'AI failed' });
      }
    }
  );

  fastify.get('/ai/proposals', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const userId = request.user!.userId;
    const proposals = await prisma.aIProposal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        confidence: true,
        title: true,
        summary: true
      }
    });
    return {
      items: proposals
    };
  });

  fastify.get('/ai/proposals/:id', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const userId = request.user!.userId;
    const id = (request.params as any).id as string;
    const proposal = await prisma.aIProposal.findFirst({ where: { id, userId } });
    if (!proposal) {
      return reply.code(404).send({ message: 'Not found' });
    }
    return proposal;
  });

  fastify.post('/ai/proposals/:id/dismiss', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const userId = request.user!.userId;
    const id = (request.params as any).id as string;
    const proposal = await prisma.aIProposal.findFirst({ where: { id, userId } });
    if (!proposal) {
      return reply.code(404).send({ message: 'Not found' });
    }
    const updated = await prisma.aIProposal.update({
      where: { id },
      data: { status: AIProposalStatus.DISMISSED }
    });
    await (await import('../utils/audit')).audit({
      userId,
      deviceId: request.user!.deviceId,
      sessionId: request.user!.sessionId,
      action: 'ai.proposal_dismissed',
      metadata: { proposalId: id, type: proposal.type }
    });
    return updated;
  });

  fastify.post('/ai/proposals/:id/apply', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const userId = request.user!.userId;
    const id = (request.params as any).id as string;
    const body = request.body as any;
    if (!body?.approved) {
      return reply.code(400).send({ message: 'Approval required' });
    }
    try {
      const result = await applyProposal({
        userId,
        deviceId: request.user!.deviceId,
        sessionId: request.user!.sessionId,
        proposalId: id
      });
      return result;
    } catch (err: any) {
      const code = err.statusCode || 500;
      return reply.code(code).send({ message: err.message || 'Apply failed' });
    }
  });

  fastify.get('/ai/patches', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const userId = request.user!.userId;
    const patches = await prisma.aIPatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return {
      items: patches.map((p) => ({
        id: p.id,
        proposalId: p.proposalId,
        status: p.status,
        appliedAt: p.appliedAt,
        rolledBackAt: p.rolledBackAt,
        changeCount: (p.patch as any)?.changes?.length || 0,
        type: 'RECATEGORIZE'
      }))
    };
  });

  fastify.get('/ai/patches/:id', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const userId = request.user!.userId;
    const id = (request.params as any).id as string;
    const patch = await prisma.aIPatch.findFirst({ where: { id, userId }, include: { proposal: true } });
    if (!patch) {
      return reply.code(404).send({ message: 'Not found' });
    }
    return {
      id: patch.id,
      proposalId: patch.proposalId,
      status: patch.status,
      appliedAt: patch.appliedAt,
      rolledBackAt: patch.rolledBackAt,
      patch: patch.patch,
      inversePatch: patch.inversePatch,
      changeCount: (patch.patch as any)?.changes?.length || 0,
      proposal: {
        id: patch.proposal.id,
        type: patch.proposal.type,
        status: patch.proposal.status,
        title: patch.proposal.title
      }
    };
  });

  fastify.post('/ai/patches/:id/rollback', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const userId = request.user!.userId;
    const id = (request.params as any).id as string;
    try {
      const result = await rollbackPatch({
        userId,
        deviceId: request.user!.deviceId,
        sessionId: request.user!.sessionId,
        patchId: id
      });
      return result;
    } catch (err: any) {
      const code = err.statusCode || 500;
      return reply.code(code).send({ message: err.message || 'Rollback failed' });
    }
  });
}
