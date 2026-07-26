# Deploying LeetSense

Frontend on Vercel, everything else on Fly.io. The configs are checked in; the
steps below are the parts that need your accounts and secrets.

| Piece | Where | Config |
| --- | --- | --- |
| Next.js frontend | Vercel | `apps/frontend/vercel.json` |
| API + sync worker | Fly (one app, two process groups) | `fly/api.toml` |
| ChromaDB | Fly (private, no public address) | `fly/chroma.toml` |
| Postgres | Fly Postgres, or Neon | — |
| Redis | Upstash via `fly redis` | — |

Deploy in this order: data stores, then Chroma, then the API, then the
frontend. The API's release command pushes the schema, so Postgres must exist
first; the frontend bakes the API URL into its bundle at build time, so the API
must have a hostname before the frontend is built.

---

## 1. Prerequisites

```bash
brew install flyctl            # or: curl -L https://fly.io/install.sh | sh
fly auth login
npm i -g vercel && vercel login
```

Generate the three secrets you will need. Keep them somewhere safe — rotating
`ENCRYPTION_KEY` makes every stored LeetCode cookie undecryptable (which
degrades to "no session on file" rather than breaking, but users have to paste
their cookies again).

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY — must be exactly 64 hex chars
```

## 2. Postgres and Redis

```bash
fly postgres create --name leetsense-db --region bom
fly redis create                     # Upstash; note the redis:// URL it prints
```

Both print a connection string once and never again. Save them.

> Using Neon instead of Fly Postgres is fine — it is what `.env.example`
> assumes for local work. Append `?sslmode=require` to the URL and make sure
> you use the pooled endpoint, since Fly machines open connections per process.

## 3. ChromaDB

```bash
fly apps create leetsense-chroma
fly volumes create chroma_data --app leetsense-chroma --region bom --size 1
fly deploy -c fly/chroma.toml
```

`fly/chroma.toml` declares no `[http_service]` on purpose. Chroma has no
authentication — anything that can reach it can read or delete every user's
embeddings — so it is reachable only at `leetsense-chroma.internal:8000` from
other machines in your organisation. Do not add a public service to it.

## 4. API and worker

```bash
fly apps create leetsense-api
fly postgres attach leetsense-db --app leetsense-api   # sets DATABASE_URL
```

Then the secrets. `CORS_ORIGIN` is a placeholder until the frontend has a
domain — step 5 corrects it.

```bash
fly secrets set --app leetsense-api \
  JWT_ACCESS_SECRET="…" \
  JWT_REFRESH_SECRET="…" \
  ENCRYPTION_KEY="…" \
  GEMINI_API_KEY="…" \
  REDIS_URL="redis://…upstash…" \
  CORS_ORIGIN="https://leetsense.vercel.app"
```

Deploy from the repository root — the Docker build context is the root, not
`fly/`:

```bash
fly deploy -c fly/api.toml
fly scale count app=1 worker=1 --app leetsense-api
```

Check it:

```bash
curl https://leetsense-api.fly.dev/api/health/ready   # {"status":"ready","db":"up"}
fly logs --app leetsense-api
```

`LEETCODE_SESSION` / `LEETCODE_CSRF` are deliberately **not** set. They are a
single-user convenience for local development; in a deployment every user
supplies their own cookies through Profile → Full history access, and a
server-wide cookie would hand one person's history to everyone who has not.

## 5. Frontend

`NEXT_PUBLIC_API_URL` is inlined into the client bundle at build time, so it
must be set as a Vercel environment variable *before* the first build, and a
change to it requires a redeploy rather than just a restart.

```bash
cd apps/frontend
vercel link
vercel env add NEXT_PUBLIC_API_URL production   # https://leetsense-api.fly.dev
vercel --prod
```

In the Vercel project settings set **Root Directory** to `apps/frontend` and
enable *Include source files outside of the Root Directory* — the build runs
`pnpm install` from the repository root so the workspace resolves.

Then point the API back at the real frontend origin:

```bash
fly secrets set --app leetsense-api CORS_ORIGIN="https://<your-app>.vercel.app"
```

## 6. Check the whole path

Register an account, link a LeetCode handle, watch the sync stream to 100%, and
ask the assistant a question. If any step fails, this is usually why:

| Symptom | Cause |
| --- | --- |
| Login works, but a reload logs you out | `CORS_ORIGIN` does not exactly match the frontend origin, so the refresh cookie is refused. It must include the scheme and no trailing slash. |
| Sync queues but never progresses | No worker machine. `fly scale count worker=1 --app leetsense-api`. |
| Chat answers, but ignores your data | Chroma unreachable — retrieval degrades to an ungrounded answer by design. Check `CHROMA_URL` and `fly status --app leetsense-chroma`. |
| Chat 504s | Gemini quota. There is no timeout on that call yet (see the known gaps in `CLAUDE.md`), so an exhausted quota hangs rather than failing fast. |
| `ENCRYPTION_KEY must be 64 hex characters` on boot | The key was generated with `rand -base64` instead of `rand -hex 32`. |

## Cookies across two domains

The frontend and API are on different sites (`vercel.app` and `fly.dev`), which
makes every refresh call cross-site. A `SameSite=Lax` cookie is not sent on
those, so the API sets `SameSite=None; Secure` in production. That is automatic
— but it means the API **must** be served over HTTPS, which Fly's
`force_https` handles.

If you later serve both from one domain, set `COOKIE_SAMESITE=lax` for the
stricter policy.

## Costs and scaling down

`min_machines_running = 1` on the API keeps one machine warm so a demo link
does not cold-start on the click that matters. To trade that for a lower bill,
set it to `0` and Fly will suspend the machine when idle and resume it in about
a second on the next request.

Chroma deliberately does not auto-stop: it loads the collection from disk on
start, and paying that on the first chat request after every idle period is
worse than the machine sitting there.

## Redeploying

```bash
fly deploy -c fly/api.toml            # API + worker
vercel --prod                         # frontend (or push to main)
pnpm --filter @leetsense/backend reindex   # after a schema or chunker change
```
