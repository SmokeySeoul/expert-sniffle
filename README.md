# Ops Hardening Beta Stack

This repository contains a minimal Fastify + BullMQ monorepo setup ready for private beta operations with separate API and worker processes, graceful shutdown, Docker orchestration, and CI.

## Prerequisites
- Node.js 20+
- npm
- Docker + Docker Compose (for the beta stack)

## Installation
```bash
npm install
```
> Run installs from the repository root so npm can hydrate **all** workspaces (API + web). Skipping a root install leaves web-only dependencies like React and its types missing, which will break `npm run build --workspace web`.

## Running locally
Run the API only:
```bash
npm run dev --workspace api
```

Run database migrations (Postgres must be available at `DATABASE_URL`):
```bash
npm run prisma:migrate --workspace api
```

Run workers only:
```bash
npm run worker --workspace api
```

Run both API and worker together:
```bash
npm run dev:all --workspace api
```

The API listens on `http://localhost:3333` with a health endpoint at `/api/health`.

## Tests and type checks
```bash
npm run -ws typecheck
npm test --workspace api
```

The test suite exercises authenticated endpoints and requires a running Postgres instance with `DATABASE_URL` set (defaults to `postgresql://substream:substream@localhost:5432/substream?schema=public`).

## Calm MVP guardrails
- [Calm MVP philosophy](docs/CALM_MVP.md)
- [Architecture guardrails](docs/ARCHITECTURE_GUARDRAILS.md)

## Trust Center & permissions
- The Trust Center exposes user-controlled permission toggles at `/api/trust-center` (GET + PATCH). Flags ship **default-deny**: bank connections, email parsing, AI assistance, and autopilot are all off until explicitly enabled per user.
- Each flag includes explanation text in responses so users can see the impact of every toggle.
- All permission changes emit an audit log (`trust.permission.updated`) with the previous and new values for transparency.
- AI features are permission-gated: when AI assistance is disabled, `/api/ai/assist` returns `{"error":"AI assistance disabled"}`.
- Audit visibility is available at `/api/audit` (newest → oldest, paginated) with sensitive metadata redacted before returning to the client.

## Docker beta stack
Build and start Postgres, Redis, API, and worker containers:
```bash
docker-compose up --build
```
Environment defaults:
- `PORT`: `3333`
- `REDIS_URL`: `redis://redis:6379`
- `DATABASE_URL`: `postgresql://substream:substream@postgres:5432/substream?schema=public`
- `EXPORT_DIR`: `/usr/src/app/exports`
- `EXPORT_TTL_HOURS`: `24`
- `INLINE_PRIVACY_WORKER`: `false` (set `true` to process privacy jobs inline without Redis for tests/local)

## Notifications
- The worker (`npm run worker --workspace api`) runs an hourly sweep that generates upcoming notifications and marks due items as sent (no external providers yet).
- Upcoming notifications are created when subscription billing dates fall inside the defined trial (48h), renewal (3 days), or annual (14 days) windows. Idempotency prevents duplicates per subscription and billing date.
- Quiet hours are enforced per user preference (default 21:00–08:00 UTC). If a notification is scheduled during quiet hours, it is deferred to the quietHoursEnd boundary.

## Common issues
- **Redis/Postgres not ready**: Containers may take a few seconds to pass health checks; the API and worker wait on healthy dependencies in `docker-compose.yml`.
- **Port conflicts**: If `3333`, `5432`, or `6379` are in use locally, adjust or export alternative port mappings in `docker-compose.yml`.
- **Stale dependencies**: If builds fail, try `npm ci --force` to reinstall clean dependencies.

## Privacy exports and deletion
- Environment variables:
  - `EXPORT_DIR`: Directory where privacy export zip files are written.
  - `EXPORT_TTL_HOURS`: Hours before a generated export expires (download is blocked after expiry).
  - `INLINE_PRIVACY_WORKER`: Run privacy jobs inline without Redis (useful for tests).
- Workers:
  - Privacy and notification jobs run via `npm run worker --workspace api`.
  - Privacy jobs are processed on the `privacy` BullMQ queue when the inline worker flag is not set.
- API:
  - `POST /api/privacy/export` creates an export job and returns a job id for status + download checks.
  - `POST /api/privacy/delete` requires `{ "confirm": "DELETE" }` and enqueues a hard delete job (sessions revoked, data removed).
  - `GET /api/privacy/jobs` and `GET /api/privacy/jobs/:id` expose job status; `GET /api/privacy/jobs/:id/download` serves completed exports until expiry for the owning user.
- Data handling:
  - Exports include users, devices, sessions, subscriptions, notifications, AI logs, proposals, patches, and audit logs in CSV form, zipped per request and gated by expiry.
  - Delete jobs revoke sessions first and then hard-delete user data (cascades applied), with explicit confirmation required and audit entries recorded for request/completion/download events.

## Contributing / PR Rules
- Always open PRs to `main`.
- CI must pass.
- No secrets in commits.
- Use environment variable examples.

## Branch protection setup
1. In GitHub, go to **Settings** → **Branches** → **Branch protection rules** → **Add rule**.
2. Set **Branch name pattern** to `main`.
3. Enable **Require a pull request before merging**.
4. Enable **Require status checks to pass before merging**, then select the CI workflow.
5. Disallow force pushes.
6. (Optional) Enable **Require linear history**.
