import { redis } from "./redis.js";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Read-through cache for the per-user dashboard aggregations.
 *
 * Those endpoints re-run the same handful of Postgres aggregates on every
 * request, and the underlying data only changes when a sync completes — so the
 * natural TTL is "until the next sync", with a time bound as a safety net.
 *
 * Invalidation uses a per-user version counter rather than key deletion. A
 * user's entries are keyed `stats:<userId>:v<n>:<name>`; bumping `n` orphans
 * every old entry at once, in a single INCR, and the orphans expire on their
 * own TTL. The alternative — finding a user's keys to delete them — means
 * KEYS (which blocks the server) or SCAN (which is a full keyspace walk per
 * sync). Neither is worth it to reclaim memory Redis will reclaim anyway.
 *
 * Every operation is best-effort: Redis being unavailable must degrade to an
 * uncached read, never to a failed request.
 */

const NAMESPACE = "stats";

function versionKey(userId: string): string {
  return `${NAMESPACE}:${userId}:version`;
}

/** Current cache generation for a user. Unreachable Redis reads as generation 0. */
async function currentVersion(userId: string): Promise<number> {
  try {
    const raw = await redis.get(versionKey(userId));
    return raw ? Number(raw) : 0;
  } catch (err) {
    logger.warn({ err, userId }, "Cache version read failed — treating as generation 0");
    return 0;
  }
}

/**
 * Returns `compute()`'s result, served from Redis when a fresh entry exists.
 *
 * `name` distinguishes the endpoints sharing a user's namespace ("overview",
 * "heatmap", …). Anything `compute` returns must survive a JSON round-trip;
 * `Date`s come back as ISO strings, which is what the HTTP layer sends anyway.
 */
export async function cached<T>(
  userId: string,
  name: string,
  compute: () => Promise<T>,
  ttlSeconds: number = env.STATS_CACHE_TTL,
): Promise<T> {
  if (!env.CACHE_ENABLED) return compute();

  const version = await currentVersion(userId);
  const key = `${NAMESPACE}:${userId}:v${version}:${name}`;

  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn({ err, key }, "Cache read failed — computing directly");
  }

  const value = await compute();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, "Cache write failed — result still served");
  }

  return value;
}

/**
 * Drops every cached aggregation for a user by starting a new generation.
 * Called when a sync finishes, which is the only thing that changes the data
 * these endpoints read.
 */
export async function invalidateUserStats(userId: string): Promise<void> {
  try {
    await redis.incr(versionKey(userId));
    logger.debug({ userId }, "Invalidated cached stats");
  } catch (err) {
    // A missed invalidation means stale reads until the TTL expires, which is
    // survivable; failing the sync over it is not.
    logger.warn({ err, userId }, "Cache invalidation failed — entries will expire on TTL");
  }
}
