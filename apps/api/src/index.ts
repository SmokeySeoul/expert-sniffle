import Fastify, { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { createRedisClient } from './queue';

const SHUTDOWN_TIMEOUT_MS = 10_000;

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}

async function start(): Promise<void> {
  const port = parseInt(process.env.PORT ?? '3333', 10);
  const app = buildServer();
  const redis: Redis = createRedisClient();

  redis.on('error', (error) => {
    app.log.error({ err: error }, 'Redis connection error');
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
      app.log.error({ err: error }, 'Error closing Fastify server');
    }

    try {
      await redis.quit();
      app.log.info('Redis connection closed');
    } catch (error) {
      app.log.error({ err: error }, 'Error closing Redis connection');
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
    app.log.error({ err: error }, 'Error starting server');
    await shutdown('SIGTERM');
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  start();
}

export { start };
