import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { User } from '@prisma/client';
import { ACCESS_TOKEN_TTL, HASH_SALT_ROUNDS, REFRESH_TOKEN_TTL } from '../config';
import { TokenPayload } from '../plugins/authenticate';

export function refreshExpiresAt(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  return expires;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, HASH_SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function hashToken(token: string): Promise<string> {
  const digest = createHash('sha256').update(token).digest('hex');
  return bcrypt.hash(digest, HASH_SALT_ROUNDS);
}

export async function tokensMatch(token: string, tokenHash: string): Promise<boolean> {
  const digest = createHash('sha256').update(token).digest('hex');
  if (await bcrypt.compare(digest, tokenHash)) {
    return true;
  }

  return bcrypt.compare(token, tokenHash);
}

export function buildAccessToken(app: FastifyInstance, payload: TokenPayload): string {
  return app.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
}

export function buildRefreshToken(
  app: FastifyInstance,
  payload: TokenPayload & { type?: 'refresh' },
): string {
  return app.jwt.sign(
    { ...payload, type: 'refresh', jti: randomUUID() },
    { expiresIn: REFRESH_TOKEN_TTL },
  );
}

export function sanitizeUser(user: User): Pick<User, 'id' | 'email' | 'createdAt' | 'updatedAt'> {
  const { id, email, createdAt, updatedAt } = user;
  return { id, email, createdAt, updatedAt };
}
