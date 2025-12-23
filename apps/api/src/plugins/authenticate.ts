import { Session } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

export interface TokenPayload {
  sub: string;
  sessionId: string;
  deviceId?: string;
  type?: 'refresh';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    authUser?: TokenPayload & { session: Session };
  }
}

export const authenticatePlugin = fp(async (app) => {
  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = await request.jwtVerify<TokenPayload>();
        const session = await app.prisma.session.findUnique({
          where: { id: payload.sessionId },
        });

        if (
          !session ||
          session.userId !== payload.sub ||
          session.revokedAt ||
          session.expiresAt <= new Date()
        ) {
          reply.status(401).send({ error: 'Unauthorized' });
          return;
        }

        request.authUser = { ...payload, session };
      } catch (error) {
        request.log.debug({ err: error }, 'Authentication failed');
        reply.status(401).send({ error: 'Unauthorized' });
      }
    },
  );
});

export default authenticatePlugin;
