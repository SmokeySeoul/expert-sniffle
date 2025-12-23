import { FastifyInstance } from 'fastify';
import { recordAuditLog } from '../utils/audit';
import { PermissionFlag, buildPermissionPayload, PERMISSION_FLAGS } from '../utils/permissions';

type PermissionPatchBody = Partial<Record<PermissionFlag, boolean>>;

export async function trustCenterRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
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

      reply.send({ permissions: buildPermissionPayload(user) });
    },
  );

  app.patch<{ Body: PermissionPatchBody }>(
    '/',
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: 'object',
          properties: Object.keys(PERMISSION_FLAGS).reduce<Record<string, { type: string }>>(
            (acc, flag) => {
              acc[flag] = { type: 'boolean' };
              return acc;
            },
            {},
          ),
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const updates = request.body ?? {};
      const providedFlags = Object.keys(updates) as PermissionFlag[];

      if (providedFlags.length === 0) {
        reply.status(400).send({ error: 'No permission flag provided' });
        return;
      }

      if (providedFlags.length > 1) {
        reply.status(400).send({ error: 'Provide only one permission flag per request' });
        return;
      }

      const flag = providedFlags[0];
      if (!(flag in PERMISSION_FLAGS)) {
        reply.status(400).send({ error: 'Unknown permission flag' });
        return;
      }

      const newValue = updates[flag];
      if (typeof newValue !== 'boolean') {
        reply.status(400).send({ error: 'Permission flag must be a boolean' });
        return;
      }

      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      const updated = await app.prisma.user.update({
        where: { id: userId },
        data: { [flag]: newValue },
      });

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'trust.permission.updated',
        metadata: { flag, oldValue: user[flag], newValue },
      });

      reply.send({ permissions: buildPermissionPayload(updated) });
    },
  );
}
