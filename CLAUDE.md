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
pnpm --filter @leetsense/backend reindex    # rebuild the vector store
```

Verify with `pnpm build` and `pnpm lint` before considering work complete.
Type-check individually with `npx tsc --noEmit` in each app.

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

1. **No tests.** Nothing anywhere. The highest-value targets are the auth flow,
   the public-vs-authenticated sync fallback in `sync.service.ts`, and RAG
   retrieval.
2. **No CI.** There is Docker but no GitHub Actions. Lint + typecheck + build
   on every PR would be short work.
3. **No retry/backoff or timeouts on outbound calls.** Neither the LeetCode
   fetchers nor the Gemini client have them. An exhausted Gemini embedding
   quota currently makes `POST /api/chat` hang rather than fail fast, and the
   LeetCode calls risk IP blocking. BullMQ's retry config is not doing real
   work here yet.
4. **RAG grounding is undocumented.** The README says "grounded via RAG" but
   not the chunking strategy, embedding model, top-k, or — most importantly —
   what happens when retrieval returns nothing. It currently degrades to an
   ungrounded answer; `queryChunks` swallows vector-store failures by design so
   a damaged index cannot 500 the endpoint. Rebuild with the `reindex` script.
5. **Dashboard redesign is unresolved.** Two directions were built and rejected
   (a restrained Linear/Vercel-style token system, then a "terminal instrument"
   look). Both are preserved on `wip/dashboard-redesign-parked` and are purely
   additive — no live page imports them. Do not restart this without a concrete
   visual reference from the user.
