import { FastifyInstance } from 'fastify';
import { ensureNotificationPreference } from '../notifications/service';
import { recordAuditLog } from '../utils/audit';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            unread: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const unread = (request.query as { unread?: boolean }).unread;
      const notifications = await app.prisma.notification.findMany({
        where: { userId, ...(unread ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
      });

      reply.send({ notifications });
    },
  );

  app.post(
    '/:id/read',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.authUser!.sub;
      const notification = await app.prisma.notification.findFirst({ where: { id, userId } });

      if (!notification) {
        reply.status(404).send({ error: 'Notification not found' });
        return;
      }

      const updated = await app.prisma.notification.update({
        where: { id },
        data: { readAt: notification.readAt ?? new Date() },
      });

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'notifications.read',
        metadata: { notificationId: id },
      });

      reply.send({ notification: updated });
    },
  );

  app.get(
    '/preferences',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const preference = await ensureNotificationPreference(app.prisma, userId);
      reply.send({ preference });
    },
  );

  app.patch(
    '/preferences',
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            timezone: { type: 'string' },
            quietHoursEnabled: { type: 'boolean' },
            quietHoursStart: { type: 'string' },
            quietHoursEnd: { type: 'string' },
            digestMode: { type: 'string', enum: ['OFF', 'WEEKLY', 'MONTHLY'] },
            channels: {
              type: 'object',
              properties: {
                email: { type: 'boolean' },
                push: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const body = request.body as {
        timezone?: string;
        quietHoursEnabled?: boolean;
        quietHoursStart?: string;
        quietHoursEnd?: string;
        digestMode?: 'OFF' | 'WEEKLY' | 'MONTHLY';
        channels?: { email?: boolean; push?: boolean };
      };

      await ensureNotificationPreference(app.prisma, userId);
      const updated = await app.prisma.notificationPreference.update({
        where: { userId },
        data: {
          timezone: body.timezone,
          quietHoursEnabled: body.quietHoursEnabled,
          quietHoursStart: body.quietHoursStart,
          quietHoursEnd: body.quietHoursEnd,
          digestMode: body.digestMode,
          channels: body.channels
            ? { email: body.channels.email ?? true, push: body.channels.push ?? false }
            : undefined,
        },
      });

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'notifications.preferences.updated',
        metadata: { preferenceId: userId },
      });

      reply.send({ preference: updated });
    },
  );

}
