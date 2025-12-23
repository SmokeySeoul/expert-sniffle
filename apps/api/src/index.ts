import Fastify from 'fastify';
import crypto from 'crypto';
import cors from 'fastify-cors';
import sensible from 'fastify-sensible';
import authPlugin from './plugins/auth';
import { aiRoutes } from './routes/ai';
import { env } from './env';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { prisma } from './prisma';
import { getMetricsJson, getMetricsText } from './utils/metrics';
import { privacyRoutes } from './routes/privacy';
import { cleanupExpiredExports, setupPrivacyWorkers } from './jobs/privacy';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie']
    },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: env.BODY_LIMIT_BYTES
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  });

  const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Origin not allowed'), false);
    },
    credentials: true
  });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_GLOBAL,
    timeWindow: '1 minute',
    hook: 'onRequest',
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true
    }
  });

  await app.register(sensible);
  await app.register(authPlugin);
  await cleanupExpiredExports();
  if (process.env.NODE_ENV !== 'test') {
    setupPrivacyWorkers();
  }
  await app.register(aiRoutes, { prefix: '/api' });
  await app.register(privacyRoutes, { prefix: '/api' });
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/ready', async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return reply.code(503).send({ ok: false });
    }
  });
  app.get('/api/metrics', async (request, reply) => {
    const accept = request.headers['accept'] || '';
    if (String(accept).includes('text/plain')) {
      reply.header('content-type', 'text/plain');
      return getMetricsText();
    }
    return getMetricsJson();
  });
  app.get('/health', async () => ({ ok: true }));
  return app;
}

async function start() {
  const app = await buildServer();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { buildServer };
