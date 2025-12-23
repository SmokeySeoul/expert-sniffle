import { FastifyInstance } from 'fastify';
import { recordAuditLog } from '../utils/audit';

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const devices = await app.prisma.device.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });

      reply.send({ devices });
    },
  );

  app.post(
    '/:id/revoke',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const deviceId = (request.params as { id: string }).id;
      const userId = request.authUser!.sub;

      const device = await app.prisma.device.findFirst({
        where: { id: deviceId, userId },
      });

      if (!device) {
        reply.status(404).send({ error: 'Device not found' });
        return;
      }

      await app.prisma.$transaction([
        app.prisma.device.update({
          where: { id: device.id },
          data: { trusted: false, lastSeenAt: new Date() },
        }),
        app.prisma.session.updateMany({
          where: { deviceId: device.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);

      await recordAuditLog({
        userId,
        deviceId: device.id,
        action: 'device.revoke',
        sessionId: request.authUser?.sessionId,
      });

      reply.send({ success: true });
    },
  );
}
