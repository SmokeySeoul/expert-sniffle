import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { recordAuditLog } from '../utils/audit';

type SubscriptionBody = {
  name: string;
  amount: number;
  currency: string;
  billingInterval: 'MONTHLY' | 'YEARLY';
  nextBillingDate: string;
  category?: string;
  isTrial?: boolean;
};

type SubscriptionPatchBody = Partial<SubscriptionBody> & { active?: boolean };

export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const subscriptions = await app.prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });

      reply.send({ subscriptions });
    },
  );

  app.post<{ Body: SubscriptionBody }>(
    '/',
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['name', 'amount', 'currency', 'billingInterval', 'nextBillingDate'],
          properties: {
            name: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            billingInterval: { type: 'string', enum: ['MONTHLY', 'YEARLY'] },
            nextBillingDate: { type: 'string', format: 'date-time' },
            category: { type: 'string' },
            isTrial: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const body = request.body;
      const subscription = await app.prisma.subscription.create({
        data: {
          userId,
          name: body.name,
          amount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          billingInterval: body.billingInterval,
          nextBillingDate: new Date(body.nextBillingDate),
          category: body.category,
          isTrial: body.isTrial ?? false,
        },
      });

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'subscription.create',
        metadata: { subscriptionId: subscription.id },
      });

      reply.status(201).send({ subscription });
    },
  );

  app.patch<{ Body: SubscriptionPatchBody }>(
    '/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            billingInterval: { type: 'string', enum: ['MONTHLY', 'YEARLY'] },
            nextBillingDate: { type: 'string', format: 'date-time' },
            category: { type: 'string' },
            active: { type: 'boolean' },
            isTrial: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const userId = request.authUser!.sub;
      const existing = await app.prisma.subscription.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        reply.status(404).send({ error: 'Subscription not found' });
        return;
      }

      const body = request.body;
      const updated = await app.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          name: body.name ?? existing.name,
          amount: body.amount !== undefined ? new Prisma.Decimal(body.amount) : existing.amount,
          currency: body.currency ?? existing.currency,
          billingInterval: body.billingInterval ?? existing.billingInterval,
          nextBillingDate:
            body.nextBillingDate !== undefined
              ? new Date(body.nextBillingDate)
              : existing.nextBillingDate,
          category: body.category ?? existing.category,
          active: body.active ?? existing.active,
          isTrial: body.isTrial ?? existing.isTrial,
        },
      });

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'subscription.update',
        metadata: { subscriptionId: updated.id },
      });

      reply.send({ subscription: updated });
    },
  );

  app.delete(
    '/:id',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const userId = request.authUser!.sub;
      const existing = await app.prisma.subscription.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        reply.status(404).send({ error: 'Subscription not found' });
        return;
      }

      const updated = await app.prisma.subscription.update({
        where: { id: existing.id },
        data: { active: false },
      });

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'subscription.delete',
        metadata: { subscriptionId: updated.id },
      });

      reply.send({ subscription: updated });
    },
  );
}
