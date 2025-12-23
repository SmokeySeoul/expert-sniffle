import { Queue } from 'bullmq';
import IORedis, { Redis } from 'ioredis';

const DEFAULT_REDIS_URL = 'redis://redis:6379';

export function getRedisUrl(): string {
  return process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}

export function createRedisClient(): Redis {
  return new IORedis(getRedisUrl());
}

export function createQueue(name: string): Queue {
  return new Queue(name, { connection: createRedisClient() });
}
