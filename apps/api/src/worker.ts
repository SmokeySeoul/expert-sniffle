import { Worker } from 'bullmq';
import { runNotificationSweep } from './notifications/service';
import prisma from './prisma';
import { createQueue, createRedisClient, getRedisUrl } from './queue';
import { processPrivacyJob } from './privacy/processor';
import { PRIVACY_QUEUE_NAME } from './privacy/queue';

const QUEUE_NAME = 'notifications';
const JOB_NAME = 'notifications:sweep';
const SHUTDOWN_TIMEOUT_MS = 10_000;
const REPEAT_EVERY_MS = 60 * 60 * 1000;

// CALM MVP: background jobs must remain explainable and never auto-enable user-facing changes.
async function startWorker(): Promise<void> {
  const queue = createQueue(QUEUE_NAME);
  const privacyQueue = createQueue(PRIVACY_QUEUE_NAME);
  const workerConnection = createRedisClient();

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const result = await runNotificationSweep(prisma);
      return result;
    },
    {
      connection: workerConnection,
    },
  );

  worker.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id ?? 'unknown'} failed`, err);
  });

  const privacyWorker = new Worker(
    PRIVACY_QUEUE_NAME,
    async (job) => {
      await processPrivacyJob(job.data.jobId);
    },
    { connection: workerConnection },
  );

  privacyWorker.on('completed', (job) => {
    console.log(`Privacy job ${job.id} completed`);
  });

  privacyWorker.on('failed', (job, err) => {
    console.error(`Privacy job ${job?.id ?? 'unknown'} failed`, err);
  });

  try {
    await worker.waitUntilReady();
    await privacyWorker.waitUntilReady();
    console.log(`Worker connected to Redis at ${getRedisUrl()}`);
  } catch (error) {
    console.error('Worker failed to start', error);
    process.exit(1);
  }

  try {
    await queue.add(
      JOB_NAME,
      {},
      {
        jobId: JOB_NAME,
        removeOnComplete: true,
        removeOnFail: true,
        repeat: { every: REPEAT_EVERY_MS },
      },
    );
  } catch (error) {
    console.error('Failed to enqueue notification sweep job', error);
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`Received shutdown signal: ${signal}`);
    const timeout = setTimeout(() => {
      console.error('Shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      await worker.close();
      console.log('Worker stopped');
    } catch (error) {
      console.error('Error closing worker', error);
    }

    try {
      await privacyWorker.close();
      console.log('Privacy worker stopped');
    } catch (error) {
      console.error('Error closing privacy worker', error);
    }

    try {
      await queue.close();
      console.log('Queue connection closed');
    } catch (error) {
      console.error('Error closing queue connection', error);
    }

    try {
      await privacyQueue.close();
      console.log('Privacy queue connection closed');
    } catch (error) {
      console.error('Error closing privacy queue connection', error);
    }

    try {
      await workerConnection.quit();
      console.log('Redis connection closed');
    } catch (error) {
      console.error('Error closing Redis connection', error);
    }

    clearTimeout(timeout);
    console.log('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  startWorker();
}

export { startWorker };
