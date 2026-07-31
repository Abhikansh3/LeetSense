# CLAUDE.md

Guidance for AI agents working in this repository.

## Project

LeetSense — a LeetCode analytics platform with an AI mentor grounded in the
user's real data via RAG. pnpm-managed Turborepo monorepo.

- `apps/backend` — Express 5 + TypeScript API. JWT auth, LeetCode fetchers,
  RAG pipeline, BullMQ sync worker.
- `apps/frontend` — Next.js 16 + React 19 dashboard.
- `packages/db` — Prisma schema + client (`@leetsense/db`).
- `packages/typescript-config`, `packages/eslint-config` — shared presets.

## Commands

```sh
pnpm install
pnpm db:generate                            # Prisma client
pnpm db:push                                # apply schema
pnpm dev                                    # all apps (worker runs in-process)
pnpm build
pnpm lint
pnpm typecheck
pnpm test                                   # 195 tests, no services needed
pnpm test:coverage
pnpm --filter @leetsense/backend reindex    # rebuild the vector store
pnpm --filter @leetsense/backend bench      # cache before/after latency
```

Verify with `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` before
considering work complete. CI runs exactly those four, then builds both Docker
images (`.github/workflows/ci.yml`).

Backend tests live in `apps/backend/tests`. Everything that opens a socket is
mocked at the package boundary in `tests/setup.ts` — Prisma, ioredis, Chroma,
Gemini, BullMQ and the LeetCode fetcher — so the suite needs no running
services. Redis is a real in-memory implementation rather than a stub, so cache
behaviour is exercised through the actual key layout. When adding a module that
reaches the network, mock it there rather than in individual test files.

## Two data sources — only one is authoritative

This is the single most important thing to understand before touching stats,
charts, or RAG. Getting it wrong has already caused two user-visible bugs.

| Source | What it is | Use for |
| --- | --- | --- |
| `ProfileSnapshot` | Whole-history aggregates from LeetCode's **public** profile query — total solved, difficulty split, acceptance, streak, skill tags, languages. Accurate for any username, no cookie needed. | **All totals and counts.** |
| `Submission` | Only what the submission endpoint returned. Without a session cookie that is ~20 recent solves. | Recent activity only. Never totals. |

Past bugs from confusing them:

- The dashboard donut counted `Submission` rows and disagreed with the
  "total solved" figure beside it.
- The AI mentor reported 20 solved for a user who had solved 81, because the
  RAG chunker labelled submission-derived counts as totals.

If you add a chunk, chart, or stat that reports "how many", it must read
`ProfileSnapshot`. `Submission` rows are a sample and must be described as one.

## LeetCode session cookies

`fetchAllSubmissions()` takes no username — it returns whoever owns the cookie.
Only call it when the account being synced *is* the cookie owner (check with
`fetchSessionUsername()`), otherwise one person's history is served to everyone.

Users may store their own cookies (Profile → Full history access). These are
AES-256-GCM encrypted at rest via `lib/crypto.ts`, keyed by `ENCRYPTION_KEY`,
and must **never** be returned by any endpoint — `/auth/me` exposes only a
`hasLeetcodeSession` boolean. Never log them.

## Conventions

- pnpm only. Backend imports use `.js` extensions (NodeNext).
- Frontend uses the `@/` alias for the app root.
- Keep all Prisma access inside `@leetsense/db`.
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `db:`, `docs:`.

## Known gaps (not yet addressed)

Ordered roughly by value:

1. **The frontend has no tests.** The backend is at ~91% of statements, but
   nothing covers `apps/frontend` — no component or route tests, and no
   end-to-end run of register → link handle → sync → chat.
2. **No retry/backoff or timeouts on outbound calls.** Neither the LeetCode
   fetchers nor the Gemini client have them. An exhausted Gemini embedding
   quota currently makes `POST /api/chat` hang rather than fail fast, and the
   LeetCode calls risk IP blocking. BullMQ's retry config is not doing real
   work here yet.
3. **RAG grounding is undocumented.** The README says "grounded via RAG" but
   not the chunking strategy, embedding model, top-k, or — most importantly —
   what happens when retrieval returns nothing. It currently degrades to an
   ungrounded answer; `queryChunks` swallows vector-store failures by design so
   a damaged index cannot 500 the endpoint. Rebuild with the `reindex` script.
4. **Dashboard redesign is unresolved and was abandoned.** Two directions were
   built and rejected — a restrained Linear/Vercel-style token system ("too
   simple"), then a "terminal instrument" look with framed panels, grid
   backdrops, zero-padded figures and segmented meters ("worse"). Both were
   deleted; the current UI is the one to work from.

   The second direction was picked by the user from ASCII mockups, which
   flatter box-drawing aesthetics in a way rendered pixels do not. Two full
   builds were spent guessing from written adjectives. **Do not start a third
   attempt without a concrete visual reference** — a screenshot, or a named
   product whose dashboard to match. Ask for one before writing styling code.
