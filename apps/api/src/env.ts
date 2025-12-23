import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().nonempty(),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32).optional().default(''.padEnd(32, 'x')),
  PORT: z.coerce.number().default(3333),
  AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  AI_TIMEOUT_MS: z.coerce.number().default(15000),
  CORS_ORIGINS: z.string().optional().default('http://localhost:3000,http://localhost:19006'),
  RATE_LIMIT_GLOBAL: z.coerce.number().default(1000),
  RATE_LIMIT_AI: z.coerce.number().default(200),
  RATE_LIMIT_AUTH: z.coerce.number().default(200),
  BODY_LIMIT_BYTES: z.coerce.number().default(1024 * 1024), // 1MB
  REDIS_URL: z.string().default('redis://localhost:6379'),
  EXPORT_TTL_HOURS: z.coerce.number().default(24),
  EXPORT_DIR: z.string().default('apps/api/tmp/exports')
});

export const env = envSchema.parse(process.env);
