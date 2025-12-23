# Substream Monorepo

This monorepo includes:
- **API** (Fastify + Prisma) under `apps/api`
- **Web** (Next.js App Router) under `apps/web`
- **Mobile** (Expo) under `apps/mobile`
- **Shared types** under `packages/shared`

## Setup
```
npm install
cd apps/api
npm install
npx prisma migrate dev --name init
npm run dev
```

### Environment variables
- API (`apps/api/.env`):
  - `DATABASE_URL`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`
- `PORT` (default 3333)
- `AI_PROVIDER` (`mock`|`openai`, default `mock`)
- `OPENAI_API_KEY` (optional)
- `OPENAI_MODEL` (default `gpt-4o-mini`)
- `AI_TIMEOUT_MS` (default `15000`)
- `REDIS_URL` (default `redis://localhost:6379`)
- `CORS_ORIGINS` (default `http://localhost:3000,http://localhost:19006`)
- `EXPORT_TTL_HOURS` (default `24`)
- `EXPORT_DIR` (default `apps/api/tmp/exports`)
- Web (`apps/web/.env.local`):
  - `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3333/api`)
- Mobile (`apps/mobile/.env`):
  - `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:3333/api`; use `http://10.0.2.2:3333/api` on Android emulator)

## API endpoints (AI)
- `GET /api/ai/status` (Bearer auth)
- `POST /api/ai/explain` (Bearer auth; requires `aiAssistEnabled` user flag)
- `GET /api/ai/logs` (Bearer auth; paginated, newest first)
- `POST /api/ai/propose` (Bearer auth; proposal generation only, no apply)
- `GET /api/ai/proposals` (Bearer auth; list proposals)
- `GET /api/ai/proposals/:id` (Bearer auth; proposal detail)
- `POST /api/ai/proposals/:id/dismiss` (Bearer auth; mark dismissed)
- `POST /api/ai/proposals/:id/apply` (Bearer auth; recategorize apply)
- `POST /api/ai/patches/:id/rollback` (Bearer auth; rollback)
- `POST /api/privacy/export` / `GET /api/privacy/export/:jobId` / `GET /api/privacy/export/:jobId/download`
- `POST /api/privacy/delete` / `GET /api/privacy/delete/:jobId`

## Running
- API: `docker compose up -d` then `cd apps/api && npx prisma migrate deploy && npm run dev`
- Web: `cd apps/web && npm install && npm run dev`
- Mobile: `cd apps/mobile && npm install && npm run start` (Android emulator may need `10.0.2.2` host)
- Workers: `cd apps/api && node dist/workers.js` (or run the API process which starts workers by default)

## Testing
```
cd apps/api
npm test
```
