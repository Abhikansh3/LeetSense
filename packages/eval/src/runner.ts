/**
 * Drives one eval run: authenticate, ask the RAG API, recover which chunks it
 * retrieved, hand the triple to the judge.
 *
 * Nothing here reimplements the assistant. The harness is strictly a client of
 * POST /api/chat, so a run measures the deployed pipeline (retrieval + prompt
 * + model) rather than a copy of it.
 */
import { buildUserChunks } from "../../../apps/backend/src/services/rag/chunker.js";
import { cacheKey, createLimiter, withCache } from "./cache.js";
import { createJudge } from "./judge.js";
import type {
  ChatResponse,
  EvalConfig,
  Question,
  RetrievalResult,
  RunResult,
} from "./types.js";

export interface Session {
  accessToken: string;
  userId: string;
}

/**
 * Exchanges credentials for an access token.
 *
 * /api/chat authenticates by `Authorization: Bearer` only — the refresh cookie
 * is scoped to path=/api/auth and can never reach it — so a run needs a real
 * login. The account must already have synced LeetCode data, or every answer
 * will correctly be "no data yet" and the whole run will grade as WRONG.
 */
export async function login(config: EvalConfig): Promise<Session> {
  const res = await fetch(`${config.apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Login failed (${res.status}) for ${config.email}. ` +
        `Check EVAL_USER_EMAIL / EVAL_USER_PASSWORD and that the API is up at ${config.apiUrl}. ` +
        `Response: ${body.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { accessToken?: string; user?: { id?: string } };
  if (!data.accessToken || !data.user?.id) {
    throw new Error(`Login response missing accessToken or user.id: ${JSON.stringify(data)}`);
  }

  return { accessToken: data.accessToken, userId: data.user.id };
}

/** Strips the `<userId>:` prefix so ids in questions.json stay portable. */
export function toLogicalId(chunkId: string, userId: string): string {
  const prefix = `${userId}:`;
  return chunkId.startsWith(prefix) ? chunkId.slice(prefix.length) : chunkId;
}

const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Builds a text → logical-id lookup by regenerating the user's chunks from
 * Postgres with the backend's own chunker.
 *
 * The API returns chunk *text* and discards ids, so this is the only way to
 * score retrieval without changing the RAG code. It is exact rather than
 * heuristic, but it does assume the database has not moved since the index was
 * built: re-sync after a reindex and stale text simply fails to map, which
 * surfaces as `unmapped` in the report rather than as silent zero recall.
 */
export async function buildChunkIndex(userId: string): Promise<Map<string, string>> {
  const chunks = await buildUserChunks(userId);
  return new Map(chunks.map((c) => [normalise(c.document), toLogicalId(c.id, userId)]));
}

/** recall@k over the first `k` retrieved chunks, in the order Chroma ranked them. */
export function scoreRetrieval(
  sources: string[],
  expected: string[],
  index: Map<string, string>,
  k: number,
): RetrievalResult {
  const topK = sources.slice(0, k);
  const retrieved: string[] = [];
  let unmapped = 0;

  for (const text of topK) {
    const id = index.get(normalise(text));
    if (id) retrieved.push(id);
    else unmapped += 1;
  }

  const hits = expected.filter((id) => retrieved.includes(id)).length;

  return {
    expected,
    retrieved,
    // An empty expected set is filtered out before we get here, so this is safe.
    recallAtK: expected.length === 0 ? 0 : hits / expected.length,
    unmapped,
  };
}

function createRagClient(config: EvalConfig, session: Session) {
  const limiter = createLimiter(config.ragRateMs);

  return async function ask(question: string): Promise<{ res: ChatResponse; cached: boolean }> {
    // Keyed on the user too: the same question against a different account is
    // a genuinely different call.
    const key = cacheKey("rag", {
      question,
      userId: session.userId,
      apiUrl: config.apiUrl,
    });

    const { value, cached } = await withCache<ChatResponse>(
      { dir: config.cacheDir, key, enabled: config.useCache },
      async () => {
        await limiter();
        const res = await fetch(`${config.apiUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ question }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`POST /api/chat failed (${res.status}): ${body.slice(0, 300)}`);
        }

        const data = (await res.json()) as Partial<ChatResponse>;
        if (typeof data.answer !== "string") {
          throw new Error(`Unexpected /api/chat response shape: ${JSON.stringify(data)}`);
        }
        return { answer: data.answer, sources: data.sources ?? [] };
      },
    );

    return { res: value, cached };
  };
}

/**
 * Runs every question and reports each result as it lands, so a long run shows
 * progress instead of going quiet for several minutes.
 */
export async function runAll(
  config: EvalConfig,
  questions: Question[],
  onResult: (result: RunResult, i: number, total: number) => void,
): Promise<RunResult[]> {
  const session = await login(config);
  const ask = createRagClient(config, session);
  const judge = createJudge(config);

  // Only pay for the chunk index if some question actually scores retrieval.
  const needsRetrieval = questions.some((q) => q.expected_chunk_ids?.length);
  const chunkIndex = needsRetrieval ? await buildChunkIndex(session.userId) : new Map<string, string>();

  const results: RunResult[] = [];

  for (const [i, question] of questions.entries()) {
    const started = Date.now();

    const { res, cached: ragCached } = await ask(question.question);
    const { verdict, cached: judgeCached } = await judge(
      question.question,
      question.ground_truth,
      res.answer,
    );

    const expected = question.expected_chunk_ids;
    const retrieval =
      expected && expected.length > 0
        ? scoreRetrieval(res.sources, expected, chunkIndex, config.recallK)
        : null;

    const result: RunResult = {
      question,
      answer: res.answer,
      sources: res.sources,
      verdict,
      retrieval,
      cached: ragCached && judgeCached,
      latencyMs: Date.now() - started,
    };

    results.push(result);
    onResult(result, i, questions.length);
  }

  return results;
}
