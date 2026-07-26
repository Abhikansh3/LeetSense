/**
 * Measures what the Redis cache is worth on the /api/stats endpoints.
 *
 *   pnpm --filter @leetsense/backend bench
 *
 * It seeds a user with a realistic practice history, then boots the API twice
 * — once with CACHE_ENABLED=false, once with it on — and drives each run with
 * autocannon. Booting a real process rather than flipping a flag in-process is
 * deliberate: `src/config/env.ts` parses the environment once at import, and
 * the point is to measure the production request path, not a rewired one.
 *
 * Point BENCH_DATABASE_URL at a scratch database. The seeded rows are removed
 * afterwards, but a benchmark should not be pointed at data anyone cares
 * about.
 */
import "../src/config/load-env.js";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import autocannon, { type Result } from "autocannon";
import { signAccessToken } from "../src/lib/jwt.js";

const DATABASE_URL = process.env.BENCH_DATABASE_URL ?? process.env.DATABASE_URL!;
// Redirect the shared client at the scratch database before `@leetsense/db`
// constructs it below — that module reads DATABASE_URL at construction.
process.env.DATABASE_URL = DATABASE_URL;
const { prisma, Difficulty } = await import("@leetsense/db");
const PORT = Number(process.env.BENCH_PORT ?? 3999);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Endpoints under test — the aggregations the dashboard loads on every visit. */
const ENDPOINTS = ["/api/stats/overview", "/api/stats/heatmap", "/api/stats/radar"] as const;

/** Enough history that the aggregation is real work, not a toy query. */
const PROBLEM_COUNT = 800;
const SUBMISSION_COUNT = 2400;
const SNAPSHOT_COUNT = 60;

const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 20);
const DURATION = Number(process.env.BENCH_DURATION ?? 10);

const BENCH_EMAIL = "bench@leetsense.local";
const DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD];
const TAGS = [
  "Array",
  "Hash Table",
  "Dynamic Programming",
  "String",
  "Binary Search",
  "Graph",
  "Tree",
  "Two Pointers",
  "Greedy",
  "Stack",
];

async function seed(): Promise<string> {
  console.log(`Seeding ${SUBMISSION_COUNT} submissions across ${PROBLEM_COUNT} problems…`);
  await teardown();

  const user = await prisma.user.create({
    data: { email: BENCH_EMAIL, passwordHash: "not-a-real-hash", leetcodeUsername: "benchuser" },
  });

  await prisma.problem.createMany({
    data: Array.from({ length: PROBLEM_COUNT }, (_, i) => ({
      titleSlug: `bench-problem-${i}`,
      title: `Bench Problem ${i}`,
      difficulty: DIFFICULTIES[i % 3]!,
      // Two or three tags each, as real problems have.
      tags: [TAGS[i % TAGS.length]!, TAGS[(i * 7) % TAGS.length]!],
    })),
    skipDuplicates: true,
  });

  const problems = await prisma.problem.findMany({
    where: { titleSlug: { startsWith: "bench-problem-" } },
    select: { id: true },
  });

  const start = Date.UTC(2025, 6, 1);
  await prisma.submission.createMany({
    // More submissions than problems, so the "count each problem once" paths
    // actually have duplicates to collapse.
    data: Array.from({ length: SUBMISSION_COUNT }, (_, i) => ({
      userId: user.id,
      problemId: problems[i % problems.length]!.id,
      lang: i % 5 === 0 ? "unknown" : "python3",
      statusDisplay: i % 9 === 0 ? "Wrong Answer" : "Accepted",
      timestamp: new Date(start + i * 6 * 60 * 60 * 1000),
    })),
    skipDuplicates: true,
  });

  await prisma.profileSnapshot.createMany({
    data: Array.from({ length: SNAPSHOT_COUNT }, (_, i) => ({
      userId: user.id,
      totalSolved: 200 + i,
      easySolved: 100 + i,
      mediumSolved: 80,
      hardSolved: 20,
      totalQuestions: 3500,
      acceptanceRate: 61.5,
      streak: 12,
      totalActiveDays: 140,
      capturedAt: new Date(start + i * 24 * 60 * 60 * 1000),
      languageStats: [{ languageName: "Python3", problemsSolved: 200 + i }],
      skillStats: { fundamental: [{ tagName: "Array", problemsSolved: 90 }], intermediate: [], advanced: [] },
      submissionStats: { accepted: 200 + i, submitted: 340 },
    })),
  });

  return user.id;
}

async function teardown(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: BENCH_EMAIL }, select: { id: true } });
  if (existing) {
    // Submissions and snapshots cascade from the user; problems are global.
    await prisma.user.delete({ where: { id: existing.id } });
  }
  await prisma.problem.deleteMany({ where: { titleSlug: { startsWith: "bench-problem-" } } });
}

/** Boots the API as its own process and waits for it to answer. */
async function startServer(cacheEnabled: boolean): Promise<ChildProcess> {
  const child = spawn("node", ["--import", "tsx", join(import.meta.dirname, "..", "src", "index.ts")], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL,
      BACKEND_PORT: String(PORT),
      CACHE_ENABLED: String(cacheEnabled),
      // The worker would compete with request handling and skew the numbers.
      WORKER_IN_PROCESS: "false",
      // Request logging is I/O on the hot path; silencing it measures the
      // handler rather than the terminal.
      LOG_LEVEL: "silent",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });

  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return child;
    } catch {
      // Not listening yet.
    }
    await sleep(100);
  }

  child.kill("SIGKILL");
  throw new Error("API did not become healthy within 10s");
}

async function stopServer(child: ChildProcess): Promise<void> {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

async function measure(path: string, token: string): Promise<Result> {
  return autocannon({
    url: `${BASE_URL}${path}`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: { authorization: `Bearer ${token}` },
  });
}

interface Row {
  path: string;
  cold: Result;
  warm: Result;
}

function percentChange(before: number, after: number): string {
  if (before === 0) return "—";
  const delta = ((after - before) / before) * 100;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function report(rows: Row[]): void {
  console.log(
    `\n${CONNECTIONS} connections, ${DURATION}s per endpoint, ` +
      `${SUBMISSION_COUNT} submissions over ${PROBLEM_COUNT} problems.\n`,
  );

  const header = ["Endpoint", "p50 off→on", "p95 off→on", "p99 off→on", "req/s off→on", "p95 change"];
  const table = rows.map((r) => [
    r.path.replace("/api/stats", ""),
    `${r.cold.latency.p50} → ${r.warm.latency.p50} ms`,
    `${r.cold.latency.p97_5} → ${r.warm.latency.p97_5} ms`,
    `${r.cold.latency.p99} → ${r.warm.latency.p99} ms`,
    `${Math.round(r.cold.requests.average)} → ${Math.round(r.warm.requests.average)}`,
    percentChange(r.cold.latency.p97_5, r.warm.latency.p97_5),
  ]);

  const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i]!.length)));
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padEnd(widths[i]!)).join(" | ")} |`;

  console.log(line(header));
  console.log(`|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`);
  for (const row of table) console.log(line(row));

  const errors = rows.reduce((n, r) => n + r.cold.errors + r.warm.errors + r.cold.non2xx + r.warm.non2xx, 0);
  if (errors > 0) console.log(`\n⚠️  ${errors} errors or non-2xx responses — the numbers above are not clean.`);
}

async function main(): Promise<void> {
  const userId = await seed();
  const token = signAccessToken({ sub: userId, email: BENCH_EMAIL });

  const results = new Map<string, { cold?: Result; warm?: Result }>();

  for (const cacheEnabled of [false, true]) {
    console.log(`\nRunning with the cache ${cacheEnabled ? "ON" : "OFF"}…`);
    const server = await startServer(cacheEnabled);
    try {
      for (const path of ENDPOINTS) {
        // One request outside the measurement so the "on" run is measuring
        // steady-state hits rather than including the single populating miss.
        await fetch(`${BASE_URL}${path}`, { headers: { authorization: `Bearer ${token}` } });

        process.stdout.write(`  ${path}… `);
        const result = await measure(path, token);
        console.log(`p95 ${result.latency.p97_5}ms, ${Math.round(result.requests.average)} req/s`);

        const entry = results.get(path) ?? {};
        entry[cacheEnabled ? "warm" : "cold"] = result;
        results.set(path, entry);
      }
    } finally {
      await stopServer(server);
    }
  }

  report(
    [...results.entries()].map(([path, r]) => ({ path, cold: r.cold!, warm: r.warm! })),
  );

  await teardown();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await teardown().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
