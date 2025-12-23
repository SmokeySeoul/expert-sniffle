import { FastifyInstance } from 'fastify';
import { recordAuditLog } from '../utils/audit';

export async function insightRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/totals',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const subscriptions = await app.prisma.subscription.findMany({
        where: { userId, active: true },
      });

      const monthlyTotal = subscriptions
        .filter((sub) => sub.billingInterval === 'MONTHLY')
        .reduce((sum, sub) => sum + Number(sub.amount), 0);

      const yearlyTotal = subscriptions
        .filter((sub) => sub.billingInterval === 'YEARLY')
        .reduce((sum, sub) => sum + Number(sub.amount), 0);

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'insights.totals',
      });

      reply.send({ monthlyTotal, yearlyTotal });
    },
  );
}
