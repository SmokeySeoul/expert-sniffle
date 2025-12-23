import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import prisma from '../prisma';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async (app) => {
  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});

export default prismaPlugin;
