# @leetsense/eval

Offline eval harness for the LeetSense RAG assistant. It asks a fixed set of
questions against a running backend, grades each answer with a second LLM, and
writes a markdown report.

It is a **client of `POST /api/chat`** — it never imports the chat pipeline or
reimplements retrieval, so a run measures what is actually deployed.

## Prerequisites

A live run needs four things:

1. The backend running (`pnpm dev`), with Postgres, Redis and Chroma up.
2. A user account **that has already synced LeetCode data**. Against a fresh
   account every answer is correctly "no data yet" and the whole run grades as
   WRONG.
3. `GEMINI_API_KEY` set — the judge is a real Gemini call.
4. `questions.json` filled in with your own questions and ground truths.

## Configuration

Read from the repo-root `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `EVAL_API_URL` | `http://localhost:3000` | Backend base URL |
| `EVAL_USER_EMAIL` | — | Account to evaluate (required for a live run) |
| `EVAL_USER_PASSWORD` | — | Its password |
| `GEMINI_API_KEY` | — | Judge credentials |
| `EVAL_ANSWER_MODEL` | `gemini-2.5-flash` | Recorded in the report, **not enforced** (see below) |
| `EVAL_JUDGE_MODEL` | `gemini-2.5-pro` | Grading model |
| `EVAL_RAG_RATE_MS` | `1000` | Min gap between chat calls |
| `EVAL_JUDGE_RATE_MS` | `2000` | Min gap between judge calls |
| `EVAL_RECALL_K` | `5` | k for recall@k |
| `EVAL_LOW_CONFIDENCE` | `0.7` | Below this a grade is flagged REVIEW |

Auth uses `POST /api/auth/login` to obtain a Bearer token. `/api/chat` accepts
**only** the `Authorization` header — the refresh cookie is scoped to
`path=/api/auth` and cannot reach it.

## Running

```sh
pnpm eval run                          # full set
pnpm eval run --dry-run                # load + validate + summarise, no API calls
pnpm eval run --no-cache               # force fresh RAG and judge calls
pnpm eval run --category abstention    # one category only
```

Start with `--dry-run`. It validates `questions.json`, prints the category
breakdown and the rate-limit floor, and needs no credentials.

## Caching

Every RAG call and every judge call is cached to `.cache/` keyed by a hash of
its inputs — the question and user for chat, the fully rendered prompt for the
judge. Re-runs are free unless an input actually changed, so editing one ground
truth re-grades one question and leaves the rest untouched.

Rate limiting happens on cache misses only, so a cached re-run finishes
instantly instead of re-paying the delays.

Delete `.cache/` (or pass `--no-cache`) after changing the assistant's prompt,
model or index — the harness cannot detect those, and will happily serve you a
stale answer from a pipeline that no longer exists.

## Adding questions

Edit `questions.json`. It ships with two templates — replace them.

```json
{
  "id": "q003",
  "category": "aggregation",
  "question": "How many medium problems have I solved?",
  "ground_truth": "31",
  "tolerance": "exact",
  "expected_chunk_ids": ["profile", "difficulty"],
  "notes": "select \"mediumSolved\" from \"ProfileSnapshot\" order by \"capturedAt\" desc limit 1"
}
```

- **`ground_truth` is always written by hand**, never generated. Put the query
  or calculation in `notes` so it can be re-derived when the data changes.
- **`category`** — `factual`, `aggregation`, `comparative`, `temporal`,
  `abstention`. Anything else fails validation.
- **`tolerance`** — `exact`, `±2`, `±5%`, `direction`, `set-match`, `abstain`.
  This documents intent for a human reader; the judge applies its own rubric.
- **`abstention`** questions must have `ground_truth: "ABSTAIN"` (enforced).
  These are the most valuable cases in the set — they catch the assistant
  inventing data it was never given, which is its most damaging failure mode.
- **`expected_chunk_ids`** — logical ids **without** the `<userId>:` prefix:
  `profile`, `difficulty`, `languages`, `recent`, `topic:<tag>`,
  `tier:<fundamental|intermediate|advanced>`. Use `null` to skip retrieval
  scoring.

Ground truth is only ever read from this file. Nothing in the harness computes
it with an LLM.

## Output

`reports/<timestamp>.md` (gitignored) contains the per-category table, overall
accuracy, retrieval metrics, judge stats, every low-confidence grade, and every
WRONG answer with its judge reasoning.

The repo `README.md` gets a summary table spliced between `<!-- eval:start -->`
and `<!-- eval:end -->`, appended on first run if the markers are absent.

## Interpreting a report

**Accuracy by category** is the headline, but read the categories separately —
a high overall score carried by `factual` while `abstention` fails means the
assistant is confidently making things up, which is worse than a lower score
that fails honestly.

**Mean recall@5** measures the retriever, not the model. Low recall with high
accuracy means the model is answering from the wrong chunks and getting lucky;
high recall with low accuracy points at the prompt or the model, not retrieval.

**Unmapped chunks** should be 0. Anything higher means the API returned text
that no current chunk matches — the vector index is stale relative to Postgres.
Re-sync, or rebuild with `pnpm --filter @leetsense/backend reindex`.

**REVIEW markers** (confidence < 0.7) are printed live and listed in the
report. Hand-check them; a judge unsure of its own grade is usually pointing at
an ambiguous question rather than a bad answer.

**Cohen's kappa** reports `n/a` until you hand-grade some questions. To enable
it, create `labels.json` (gitignored) mapping question ids to your own grades:

```json
{ "q001": "CORRECT", "q002": "WRONG" }
```

Kappa is then computed over just those questions. Roughly: > 0.8 the judge can
be trusted unattended, 0.6–0.8 spot-check it, below 0.6 the rubric or the eval
set needs work before the numbers mean anything. Hand-grading ~20 is enough to
tell which.

## Known limitations

- **`EVAL_ANSWER_MODEL` is recorded, not enforced.** The backend picks its chat
  model from its own `GEMINI_CHAT_MODEL`; a harness that only consumes the API
  cannot override it. If the two disagree the report will state the wrong
  model, so keep them in sync by hand.
- **Retrieval is hardcoded to top-6** in `queryChunks`, so `recall@5` scores the
  first 5 of 6 returned chunks. Raising `EVAL_RECALL_K` above 6 cannot help.
- **Retrieval scoring reads Postgres directly** (via the backend's
  `buildUserChunks`) to recover chunk ids the API does not return. That is the
  one place this package is coupled to backend internals; if `chunker.ts`
  changes its output, mapping degrades to `unmapped` rather than breaking.
- **No tests yet**, by design — ship first.
