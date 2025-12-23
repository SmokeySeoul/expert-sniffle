import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import { Redis } from 'ioredis';
import { ACCESS_TOKEN_TTL, GENERAL_RATE_LIMIT, JWT_SECRET, getRequestId } from './config';
import prismaPlugin from './plugins/prisma';
import authenticatePlugin from './plugins/authenticate';
import { authRoutes } from './routes/auth';
import { deviceRoutes } from './routes/devices';
import { subscriptionRoutes } from './routes/subscriptions';
import { insightRoutes } from './routes/insights';
import { trustCenterRoutes } from './routes/trust-center';
import { auditRoutes } from './routes/audit';
import { aiRoutes } from './routes/ai';
import { notificationRoutes } from './routes/notifications';
import { createRedisClient } from './queue';

const SHUTDOWN_TIMEOUT_MS = 10_000;

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      redact: ['req.headers.authorization', 'res.headers.authorization', 'headers.authorization'],
    },
    genReqId: (req) => getRequestId(req.headers['x-request-id']),
  });

  app.register(helmet);
  app.register(cors, { origin: true });
  app.register(rateLimit, { ...GENERAL_RATE_LIMIT });
  app.register(fastifyJwt, { secret: JWT_SECRET, sign: { expiresIn: ACCESS_TOKEN_TTL } });
  app.register(prismaPlugin);
  app.register(authenticatePlugin);

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(deviceRoutes, { prefix: '/api/devices' });
  app.register(subscriptionRoutes, { prefix: '/api/subscriptions' });
  app.register(insightRoutes, { prefix: '/api/insights' });
  app.register(trustCenterRoutes, { prefix: '/api/trust-center' });
  app.register(auditRoutes, { prefix: '/api/audit' });
  app.register(aiRoutes, { prefix: '/api/ai' });
  app.register(notificationRoutes, { prefix: '/api/notifications' });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 401) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    request.log.error({ err: error as Error }, 'Unhandled error');
    reply.status(statusCode ?? 500).send({ error: 'Internal Server Error' });
  });

  return app;
}

async function start(): Promise<void> {
  const port = parseInt(process.env.PORT ?? '3333', 10);
  const app = buildServer();
  const redis: Redis = createRedisClient();

  redis.on('error', (error) => {
    app.log.error({ err: error as Error }, 'Redis connection error');
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, 'Received shutdown signal');
    const timeout = setTimeout(() => {
      app.log.error('Shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      await app.close();
      app.log.info('Fastify server closed');
    } catch (error) {
      app.log.error({ err: error as Error }, 'Error closing Fastify server');
    }

    try {
      await redis.quit();
      app.log.info('Redis connection closed');
    } catch (error) {
      app.log.error({ err: error as Error }, 'Error closing Redis connection');
    }

    clearTimeout(timeout);
    app.log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server listening on port ${port}`);
  } catch (error) {
    app.log.error({ err: error as Error }, 'Error starting server');
    await shutdown('SIGTERM');
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  start();
}

export { start };
