/**
 * Content-addressed disk cache for the two paid calls in a run: the RAG
 * request and the judge request.
 *
 * The key is a hash of everything that could change the response — for the RAG
 * call that is the question text plus the endpoint, for the judge it is the
 * full rendered prompt plus the model. So a re-run costs nothing unless an
 * input actually moved, and editing a ground truth invalidates only the
 * questions that depend on it.
 *
 * This module is the one file not named in the original spec. Both runner.ts
 * and judge.ts need identical caching, and inlining it twice would be worse
 * than one twenty-line helper.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Stable hash over an arbitrary set of inputs. */
export function cacheKey(namespace: string, parts: Record<string, unknown>): string {
  // Sort keys so an object-literal reorder does not invalidate the cache.
  const canonical = JSON.stringify(parts, Object.keys(parts).sort());
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 32);
  return `${namespace}-${digest}`;
}

/**
 * Read-through cache. Returns `{ value, cached }` so callers can report how
 * much of a run was free, and can skip rate-limiting on a cache hit.
 */
export async function withCache<T>(
  opts: { dir: string; key: string; enabled: boolean },
  compute: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const file = path.join(opts.dir, `${opts.key}.json`);

  if (opts.enabled) {
    try {
      const raw = await readFile(file, "utf8");
      return { value: JSON.parse(raw) as T, cached: true };
    } catch {
      // Miss, or an unreadable/corrupt entry — recompute and overwrite.
    }
  }

  const value = await compute();
  await mkdir(opts.dir, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
  return { value, cached: false };
}

/**
 * Serialising rate limiter: resolves once at least `minIntervalMs` has passed
 * since the previous slot was handed out.
 *
 * Call this *inside* the `compute` closure passed to withCache, never around
 * it — a cache hit performs no request, so it must not burn a slot. Doing it
 * the other way makes a fully-cached re-run take as long as a live one.
 */
export function createLimiter(minIntervalMs: number): () => Promise<void> {
  let last = 0;
  let chain: Promise<void> = Promise.resolve();

  return () => {
    chain = chain.then(async () => {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
    });
    return chain;
  };
}
