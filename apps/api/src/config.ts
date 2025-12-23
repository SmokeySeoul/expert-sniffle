import { randomUUID } from 'crypto';

export const DEFAULT_DATABASE_URL =
  'postgresql://substream:substream@localhost:5432/substream?schema=public';
export const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-prod';
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '30d';
export const HASH_SALT_ROUNDS = 12;

export const GENERAL_RATE_LIMIT = {
  max: 100,
  timeWindow: '1 minute',
};

export const AUTH_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
};

export function getRequestId(headerValue?: string | string[]): string {
  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? randomUUID();
  }

  return headerValue ?? randomUUID();
}
