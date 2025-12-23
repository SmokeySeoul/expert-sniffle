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

## Common issues
- **Redis/Postgres not ready**: Containers may take a few seconds to pass health checks; the API and worker wait on healthy dependencies in `docker-compose.yml`.
- **Port conflicts**: If `3333`, `5432`, or `6379` are in use locally, adjust or export alternative port mappings in `docker-compose.yml`.
- **Stale dependencies**: If builds fail, try `npm ci --force` to reinstall clean dependencies.

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
