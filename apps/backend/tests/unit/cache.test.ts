import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, invalidateUserStats } from "../../src/lib/cache.js";
import { redisKeys, setRedisFailing } from "../mocks/ioredis.js";

describe("stats cache", () => {
  afterEach(() => setRedisFailing(false));

  it("computes on a miss and serves the second call from Redis", async () => {
    const compute = vi.fn(async () => ({ total: 42 }));

    const first = await cached("user-1", "overview", compute);
    const second = await cached("user-1", "overview", compute);

    expect(first).toEqual({ total: 42 });
    expect(second).toEqual({ total: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("keys entries by user, so one user never sees another's numbers", async () => {
    await cached("user-1", "overview", async () => ({ total: 1 }));
    const other = await cached("user-2", "overview", async () => ({ total: 2 }));

    expect(other).toEqual({ total: 2 });
    expect(redisKeys()).toContain("stats:user-1:v0:overview");
    expect(redisKeys()).toContain("stats:user-2:v0:overview");
  });

  it("keys entries by endpoint, so panels don't collide", async () => {
    await cached("user-1", "overview", async () => "overview-data");
    const heatmap = await cached("user-1", "heatmap", async () => "heatmap-data");

    expect(heatmap).toBe("heatmap-data");
  });

  it("recomputes after invalidation", async () => {
    const compute = vi.fn().mockResolvedValueOnce({ total: 1 }).mockResolvedValueOnce({ total: 2 });

    await cached("user-1", "overview", compute);
    await invalidateUserStats("user-1");
    const after = await cached("user-1", "overview", compute);

    expect(after).toEqual({ total: 2 });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("invalidates by starting a new generation rather than deleting keys", async () => {
    await cached("user-1", "overview", async () => ({ total: 1 }));
    await invalidateUserStats("user-1");
    await cached("user-1", "overview", async () => ({ total: 2 }));

    // The stale entry is orphaned, not deleted — it expires on its own TTL.
    expect(redisKeys()).toContain("stats:user-1:v0:overview");
    expect(redisKeys()).toContain("stats:user-1:v1:overview");
  });

  it("only invalidates the user it was asked to", async () => {
    const other = vi.fn(async () => ({ total: 7 }));
    await cached("user-2", "overview", other);
    await invalidateUserStats("user-1");
    await cached("user-2", "overview", other);

    expect(other).toHaveBeenCalledTimes(1);
  });

  it("still answers when Redis is unreachable", async () => {
    setRedisFailing(true);
    const compute = vi.fn(async () => ({ total: 42 }));

    const result = await cached("user-1", "overview", compute);

    expect(result).toEqual({ total: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not fail a sync when invalidation cannot reach Redis", async () => {
    setRedisFailing(true);
    await expect(invalidateUserStats("user-1")).resolves.toBeUndefined();
  });

  it("bypasses Redis entirely when CACHE_ENABLED is false", async () => {
    // env is parsed once at import, so the flag has to be flipped around a
    // fresh module graph — the same thing the benchmark does with a restart.
    vi.resetModules();
    process.env.CACHE_ENABLED = "false";
    try {
      const { cached: uncached } = await import("../../src/lib/cache.js");
      const compute = vi.fn(async () => ({ total: 42 }));

      await uncached("user-1", "overview", compute);
      await uncached("user-1", "overview", compute);

      expect(compute).toHaveBeenCalledTimes(2);
      expect(redisKeys()).toHaveLength(0);
    } finally {
      process.env.CACHE_ENABLED = "true";
      vi.resetModules();
    }
  });
});
