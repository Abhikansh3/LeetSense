# LeetSense

> AI-powered LeetCode analytics platform. Sync your LeetCode history and ask an
> AI assistant (grounded in your real data via RAG) about your strengths,
> weaknesses, and what to practice next.

## Tech stack

| Layer      | Tech                                                        |
| ---------- | ----------------------------------------------------------- |
| Monorepo   | Turborepo + pnpm                                            |
| Backend    | Express 5, TypeScript, Prisma, BullMQ + Redis               |
| Frontend   | Next.js, React, Tailwind CSS                                |
| Database   | PostgreSQL                                                  |
| AI / RAG   | Google Gemini (chat + embeddings), ChromaDB (vector store)  |

## Structure

```
leetsense/
├── apps/
│   ├── backend/   # Express API, RAG, sync workers
│   └── frontend/  # Next.js UI
└── packages/
    ├── db/                 # Prisma schema + client
    ├── eslint-config/      # shared ESLint flat config
    └── typescript-config/  # shared tsconfig bases
```

## Getting started

```bash
pnpm install
cp .env.example .env                              # then fill in secrets
docker compose up -d postgres redis chromadb      # infra (pg on host :5433)
pnpm db:generate                                  # generate the Prisma client
pnpm db:push                                       # create the schema
```

Then run the services (separate terminals):

```bash
pnpm --filter @leetsense/backend dev       # API      -> http://localhost:3000
pnpm --filter @leetsense/backend worker    # sync worker (BullMQ)
pnpm --filter @leetsense/frontend dev      # web app  -> http://localhost:3001
```

Register at `http://localhost:3001` and the onboarding flow will link a LeetCode
username and run the first sync. Set `GEMINI_API_KEY` in `.env` to enable the AI
chat.

In development the API runs the BullMQ worker in-process, so `pnpm dev` alone
can complete a sync — the separate `worker` command is only needed if you set
`WORKER_IN_PROCESS=false` (as the Docker setup does).

### How much history gets synced

| Account | Source | Coverage |
| ------- | ------ | -------- |
| Any public username | `recentAcSubmissionList` | ~20 most recent accepted solves |
| The `LEETCODE_SESSION` owner | `submissionList` (authenticated) | Full paginated history |

LeetCode's authenticated endpoint takes no username — it always returns the
cookie owner's submissions. LeetSense therefore only uses it when the account
being synced *is* the cookie owner, and falls back to the public per-user
endpoint for everyone else. Aggregate counts (total solved, ranking,
easy/medium/hard) always come from the public profile, so they are accurate for
every user regardless of cookies.

### Everything in Docker

```bash
docker compose up -d          # infra + api + worker + web
docker compose --profile monitoring up -d   # + prometheus & grafana
```

### Deploying

Frontend on Vercel, API + sync worker + ChromaDB on Fly.io. The configs are
checked in (`fly/`, `apps/frontend/vercel.json`); see **[DEPLOYMENT.md](DEPLOYMENT.md)**
for the step-by-step, including the cross-domain cookie setting that login
depends on.

## API overview

| Method | Route | Purpose |
| ------ | ----- | ------- |
| POST | `/api/auth/register` \| `/login` \| `/refresh` \| `/logout` | Auth (JWT + rotating refresh) |
| GET  | `/api/auth/me` | Current user |
| POST | `/api/sync` | Queue a LeetCode sync |
| GET  | `/api/sync/stream?token=` | SSE progress (9 stages) |
| GET  | `/api/stats/overview` \| `/heatmap` \| `/radar` \| `/snapshots` | Dashboard data |
| GET  | `/api/stats/activity` | Cursor-paginated solve feed |
| GET  | `/api/problems` | Filterable, cursor-paginated problems |
| POST | `/api/chat` | RAG-grounded Q&A |

All read endpoints are scoped to the authenticated user. `Problem` is a shared
table, so anything querying it must filter by the caller's submissions.

## Caching

The `/api/stats` aggregations re-read a user's whole submission history to
answer one dashboard panel. That data only changes when a sync completes, so
each endpoint is wrapped in a read-through Redis cache that the sync
invalidates — including on the failure path, and on a relink, which deletes the
rows the cache was built from.

Invalidation bumps a per-user version counter (`stats:<userId>:v<n>:<name>`)
rather than deleting keys, so a whole generation is dropped in one `INCR` with
no `KEYS` or `SCAN`. Stale entries expire on their own TTL. Reads and writes are
best-effort: an unreachable Redis degrades to an uncached query, never a failed
request.

### Measured effect

`pnpm --filter @leetsense/backend bench` boots the API twice — once with
`CACHE_ENABLED=false`, once on — and drives each run with autocannon. Below is
a run on an M-series laptop against local Postgres and Redis: 20 connections,
10s per endpoint, against a seeded history of 2,400 submissions over 800
problems.

| Endpoint | p50 | p95 | p99 | req/s |
| --- | --- | --- | --- | --- |
| `/stats/overview` | 164 → 1 ms | 256 → 2 ms | 276 → 2 ms | 117 → 12,439 |
| `/stats/heatmap` | 46 → 3 ms | 86 → 3 ms | 90 → 4 ms | 406 → 6,396 |
| `/stats/radar` | 175 → 1 ms | 391 → 2 ms | 443 → 3 ms | 104 → 12,728 |

p95 falls by 96–99%. The gap widens with history size, since the uncached path
is linear in submissions and the cached path is a single Redis `GET`.

To re-run it, point `BENCH_DATABASE_URL` at a scratch database — the harness
seeds and then removes its own rows, but it should not be aimed at data anyone
cares about:

```bash
createdb leetsense_bench
DATABASE_URL="postgresql://…/leetsense_bench" pnpm --filter @leetsense/db db:push
BENCH_DATABASE_URL="postgresql://…/leetsense_bench" pnpm --filter @leetsense/backend bench
```

## Tests

```bash
pnpm test                 # 189 tests, ~2s, no services required
pnpm test:coverage        # 91% of backend statements
```

Everything that opens a socket — Prisma, Redis, Chroma, Gemini, BullMQ and the
LeetCode fetcher — is mocked at the package boundary, so the suite runs
anywhere without Docker. Redis is a small in-memory implementation rather than
a stub, so cache behaviour is exercised through the real key layout.

## Pages

| Route | Purpose |
| ----- | ------- |
| `/` | Landing page |
| `/register` \| `/login` | Auth |
| `/onboarding` | First-run: link a handle and stream the initial sync |
| `/dashboard` | Overview — headline stats, difficulty, topics, heatmap, growth |
| `/dashboard/activity` | Reverse-chronological solve feed |
| `/dashboard/problems` | Your synced problems, filterable by difficulty |
| `/dashboard/chat` | RAG-grounded AI mentor |
| `/dashboard/profile` | Account, linked handle, languages, growth |
