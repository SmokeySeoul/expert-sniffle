import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { jwtVerify, JWTPayload } from 'jose';
import { env } from '../env';
import { incCounter } from '../utils/metrics';

const encoder = new TextEncoder();
const secret = encoder.encode(env.ACCESS_TOKEN_SECRET);

type AccessTokenPayload = JWTPayload & {
  userId: string;
  deviceId?: string;
  sessionId?: string;
};

export default fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest('user', null);
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: any) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Unauthorized' });
      incCounter('auth_failures');
      return;
    }

    try {
      const token = header.slice('Bearer '.length);
      const { payload } = await jwtVerify(token, secret);
      const { userId, deviceId, sessionId } = payload as AccessTokenPayload;
      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        incCounter('auth_failures');
        return;
      }
      request.user = { userId, deviceId, sessionId } as any;
    } catch (err: any) {
      reply.code(401).send({ error: 'Unauthorized' });
      incCounter('auth_failures');
      return;
    }
  });
});

declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: string; deviceId?: string; sessionId?: string };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, rep: any) => Promise<void>;
  }
}
