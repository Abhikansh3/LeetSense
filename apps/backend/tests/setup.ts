import { beforeEach, vi } from "vitest";

/**
 * Runs before every test file, ahead of any `src/` import.
 *
 * `src/config/env.ts` validates the environment at import time and calls
 * `process.exit(1)` on anything missing, so the variables have to be in place
 * before the first module under test is loaded — which is what a setup file
 * guarantees and a top-level `beforeAll` does not.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/leetsense_test?schema=public";
process.env.JWT_ACCESS_SECRET = "test-access-secret-not-used-in-production";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-not-used-in-production";
// 32 bytes of hex, as ENCRYPTION_KEY's schema requires. Deliberately a
// repeating pattern rather than random-looking: a real-looking key here is
// indistinguishable from a leaked one to a secret scanner, and teaches
// everyone to wave the alert through.
process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
process.env.CORS_ORIGIN = "http://localhost:3001";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.CACHE_ENABLED = "true";
process.env.STATS_CACHE_TTL = "300";
process.env.GEMINI_API_KEY = "test-gemini-key";

/**
 * Everything below reaches the network in production. Mocking at the package
 * boundary — rather than at our own modules — means the code under test is the
 * real thing: our Prisma queries, our cache keys, our Chroma error handling.
 *
 * `vi.mock` in a setup file applies to every test file, so no test has to
 * repeat this.
 */
vi.mock("@leetsense/db", () => import("./mocks/db.js"));
vi.mock("ioredis", () => import("./mocks/ioredis.js"));
vi.mock("chromadb", () => import("./mocks/chromadb.js"));
vi.mock("@google/generative-ai", () => import("./mocks/gemini.js"));
vi.mock("bullmq", () => import("./mocks/bullmq.js"));
vi.mock("../src/fetchers/leetcode.js", () => import("./mocks/leetcode.js"));

const { resetDb } = await import("./mocks/db.js");
const { resetRedis } = await import("./mocks/ioredis.js");
const { resetChroma } = await import("./mocks/chromadb.js");
const { resetGemini } = await import("./mocks/gemini.js");
const { resetQueue } = await import("./mocks/bullmq.js");
const { resetLeetcode } = await import("./mocks/leetcode.js");

beforeEach(() => {
  resetDb();
  resetRedis();
  resetChroma();
  resetGemini();
  resetQueue();
  resetLeetcode();
});
