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

Register at `http://localhost:3001`, then sync a public LeetCode username
(profile + recent solves work without cookies). For the AI chat and full
submission history, set `GEMINI_API_KEY` and `LEETCODE_SESSION` / `LEETCODE_CSRF`
in `.env`.

### Everything in Docker

```bash
docker compose up -d          # infra + api + worker + web
docker compose --profile monitoring up -d   # + prometheus & grafana
```

## API overview

| Method | Route | Purpose |
| ------ | ----- | ------- |
| POST | `/api/auth/register` \| `/login` \| `/refresh` \| `/logout` | Auth (JWT + rotating refresh) |
| GET  | `/api/auth/me` | Current user |
| POST | `/api/sync` | Queue a LeetCode sync |
| GET  | `/api/sync/stream?token=` | SSE progress (9 stages) |
| GET  | `/api/stats/overview` \| `/heatmap` \| `/radar` \| `/snapshots` | Dashboard data |
| GET  | `/api/problems` | Filterable, cursor-paginated problems |
| POST | `/api/chat` | RAG-grounded Q&A |
