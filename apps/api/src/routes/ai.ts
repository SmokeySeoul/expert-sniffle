import { FastifyInstance } from 'fastify';
import { recordAuditLog } from '../utils/audit';
import { requirePermission } from '../utils/permissions';

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/assist',
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
        await recordAuditLog({
          userId,
          deviceId: request.authUser?.deviceId,
          sessionId: request.authUser?.sessionId,
          action: 'ai.assist.denied',
          metadata: { reason: 'permission_denied', flag: 'aiAssistEnabled' },
        });

        reply.status(403).send({ error: 'AI assistance disabled' });
        return;
      }

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'ai.assist.stub',
      });

      reply.send({
        message: 'AI assistance is enabled (stub response).',
      });
    },
  );
}
