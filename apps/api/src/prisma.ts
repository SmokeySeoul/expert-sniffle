import { PrismaClient } from '@prisma/client';
import { DEFAULT_DATABASE_URL } from './config';

process.env.DATABASE_URL ??= DEFAULT_DATABASE_URL;

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;
