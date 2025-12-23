import { FastifyInstance } from 'fastify';
import { AUTH_RATE_LIMIT } from '../config';
import { recordAuditLog } from '../utils/audit';
import {
  buildAccessToken,
  buildRefreshToken,
  hashPassword,
  hashToken,
  refreshExpiresAt,
  sanitizeUser,
  tokensMatch,
  verifyPassword,
} from '../utils/auth';

type RegisterBody = {
  email: string;
  password: string;
  deviceName?: string;
  trusted?: boolean;
};

type LoginBody = RegisterBody & { deviceId?: string };

type RefreshBody = { refreshToken: string };
type LogoutBody = { refreshToken: string };

async function resolveDevice(
  app: FastifyInstance,
  userId: string,
  body: { deviceId?: string; deviceName?: string; trusted?: boolean },
) {
  const now = new Date();
  if (body.deviceId) {
    const existing = await app.prisma.device.findFirst({
      where: { id: body.deviceId, userId },
    });

    if (existing) {
      return app.prisma.device.update({
        where: { id: existing.id },
        data: {
          name: body.deviceName ?? existing.name,
          trusted: body.trusted ?? existing.trusted,
          lastSeenAt: now,
        },
      });
    }
  }

  return app.prisma.device.create({
    data: {
      userId,
      name: body.deviceName,
      trusted: body.trusted ?? false,
      lastSeenAt: now,
    },
  });
}

async function createSessionWithTokens(
  app: FastifyInstance,
  userId: string,
  deviceId: string,
) {
  const expiresAt = refreshExpiresAt();
  const session = await app.prisma.session.create({
    data: {
      userId,
      deviceId,
      refreshTokenHash: 'pending',
      expiresAt,
    },
  });

  const refreshToken = buildRefreshToken(app, {
    sub: userId,
    sessionId: session.id,
    deviceId,
  });
  const refreshTokenHash = await hashToken(refreshToken);

  const updatedSession = await app.prisma.session.update({
    where: { id: session.id },
    data: { refreshTokenHash },
  });

  const accessToken = buildAccessToken(app, {
    sub: userId,
    sessionId: updatedSession.id,
    deviceId,
  });

  return { accessToken, refreshToken, session: updatedSession };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RegisterBody }>(
    '/register',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            deviceName: { type: 'string' },
            trusted: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const existing = await app.prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
      });

      if (existing) {
        reply.status(409).send({ error: 'Email already registered' });
        return;
      }

      const passwordHash = await hashPassword(body.password);
      const user = await app.prisma.user.create({
        data: { email: body.email.toLowerCase(), passwordHash },
      });

      const device = await resolveDevice(app, user.id, body);
      const tokens = await createSessionWithTokens(app, user.id, device.id);

      await recordAuditLog({
        userId: user.id,
        deviceId: device.id,
        sessionId: tokens.session.id,
        action: 'auth.register',
        metadata: { email: user.email },
      });

      reply.status(201).send({
        user: sanitizeUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    },
  );

  app.post<{ Body: LoginBody }>(
    '/login',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            deviceId: { type: 'string' },
            deviceName: { type: 'string' },
            trusted: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const user = await app.prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
      });

      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const device = await resolveDevice(app, user.id, body);
      const tokens = await createSessionWithTokens(app, user.id, device.id);

      await recordAuditLog({
        userId: user.id,
        deviceId: device.id,
        sessionId: tokens.session.id,
        action: 'auth.login',
        metadata: { email: user.email },
      });

      reply.send({
        user: sanitizeUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    },
  );

  app.post<{ Body: RefreshBody }>(
    '/refresh',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
      try {
        const payload = await app.jwt.verify<{
          sub: string;
          sessionId: string;
          deviceId?: string;
          type?: string;
        }>(refreshToken);

        if (payload.type !== 'refresh') {
          reply.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const session = await app.prisma.session.findUnique({
          where: { id: payload.sessionId },
        });

        if (
          !session ||
          session.userId !== payload.sub ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          !(await tokensMatch(refreshToken, session.refreshTokenHash))
        ) {
          reply.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const newRefreshToken = buildRefreshToken(app, {
          sub: payload.sub,
          sessionId: session.id,
          deviceId: payload.deviceId,
        });
        const newHash = await hashToken(newRefreshToken);

        const updated = await app.prisma.session.update({
          where: { id: session.id },
          data: {
            refreshTokenHash: newHash,
            expiresAt: refreshExpiresAt(),
          },
        });

        if (payload.deviceId) {
          await app.prisma.device.updateMany({
            where: { id: payload.deviceId, userId: payload.sub },
            data: { lastSeenAt: new Date() },
          });
        }

        await recordAuditLog({
          userId: payload.sub,
          deviceId: payload.deviceId,
          sessionId: session.id,
          action: 'auth.refresh',
        });

        reply.send({
          accessToken: buildAccessToken(app, {
            sub: payload.sub,
            sessionId: updated.id,
            deviceId: payload.deviceId,
          }),
          refreshToken: newRefreshToken,
        });
      } catch (error) {
        request.log.debug({ err: error }, 'Refresh failed');
        reply.status(401).send({ error: 'Unauthorized' });
      }
    },
  );

  app.post<{ Body: LogoutBody }>(
    '/logout',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
      try {
        const payload = await app.jwt.verify<{
          sub: string;
          sessionId: string;
          deviceId?: string;
          type?: string;
        }>(refreshToken);

        if (payload.type !== 'refresh') {
          reply.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const session = await app.prisma.session.findUnique({
          where: { id: payload.sessionId },
        });

        if (
          !session ||
          session.userId !== payload.sub ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          !(await tokensMatch(refreshToken, session.refreshTokenHash))
        ) {
          reply.status(401).send({ error: 'Unauthorized' });
          return;
        }

        await app.prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });

        await recordAuditLog({
          userId: payload.sub,
          deviceId: payload.deviceId,
          sessionId: payload.sessionId,
          action: 'auth.logout',
        });

        reply.send({ success: true });
      } catch (error) {
        request.log.debug({ err: error }, 'Logout failed');
        reply.status(401).send({ error: 'Unauthorized' });
      }
    },
  );
}
