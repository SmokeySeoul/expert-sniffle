import { Queue, Worker, QueueScheduler, JobsOptions, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';

const isTest = process.env.NODE_ENV === 'test';

export const connection = isTest
  ? undefined
  : new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      reconnectOnError: () => true
    });

export function createQueue(name: string, defaultJobOptions?: JobsOptions) {
  if (!connection) {
    return {
      add: async (_name: string, _data: any) => {}
    } as any;
  }
  return new Queue(name, { connection, defaultJobOptions });
}

export function createQueueScheduler(name: string) {
  if (!connection) return null as any;
  return new QueueScheduler(name, { connection });
}

export function createWorker(name: string, processor: any, opts?: WorkerOptions) {
  if (!connection) return null as any;
  return new Worker(name, processor, {
    connection,
    autorun: true,
    ...opts
  });
}
