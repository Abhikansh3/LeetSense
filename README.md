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
cp .env.example .env      # then fill in secrets
pnpm db:generate          # generate the Prisma client
# start postgres + redis + chroma (see docker-compose)
pnpm db:migrate           # create the schema
pnpm dev                  # run everything
```

> Built incrementally — see the build phases in project notes.
