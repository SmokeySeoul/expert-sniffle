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
