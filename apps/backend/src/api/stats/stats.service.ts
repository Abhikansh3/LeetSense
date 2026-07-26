import { prisma, Difficulty } from "@leetsense/db";
import { cached } from "../../lib/cache.js";

/**
 * Every aggregation here re-reads a user's whole submission history to answer
 * one dashboard panel, and that data only moves when a sync completes — so
 * each is wrapped in a read-through Redis cache that a finished sync
 * invalidates. The `compute*` functions below hold the actual logic and are
 * exported for tests; the cached wrappers are what the routes call.
 *
 * `getActivity` is deliberately not cached: it is cursor-paginated, so caching
 * it would mean one entry per cursor a user happens to scroll to, for a query
 * that is already a single indexed page read.
 */

/**
 * The whole-history aggregates LeetCode exposes publicly: acceptance rate,
 * streak, languages and skill tiers. These describe every problem the user has
 * ever solved, unlike the `Submission` rows which only cover what the public
 * submission endpoint returns (~20 recent solves).
 */
export async function computeProfileStats(userId: string) {
  const snapshot = await prisma.profileSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: "desc" },
  });
  if (!snapshot) return { stats: null };

  return {
    stats: {
      totalSolved: snapshot.totalSolved,
      easySolved: snapshot.easySolved,
      mediumSolved: snapshot.mediumSolved,
      hardSolved: snapshot.hardSolved,
      totalQuestions: snapshot.totalQuestions,
      ranking: snapshot.ranking,
      acceptanceRate: snapshot.acceptanceRate,
      streak: snapshot.streak,
      totalActiveDays: snapshot.totalActiveDays,
      languageStats: snapshot.languageStats,
      skillStats: snapshot.skillStats,
      submissionStats: snapshot.submissionStats,
      capturedAt: snapshot.capturedAt,
    },
  };
}

/** Headline numbers for the dashboard. */
export async function computeOverview(userId: string) {
  const snapshot = await prisma.profileSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: "desc" },
  });

  const submissions = await prisma.submission.findMany({
    where: { userId },
    include: { problem: { select: { id: true, difficulty: true, tags: true } } },
  });

  const byDifficulty = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const topicCount = new Map<string, number>();
  const languages = new Map<string, number>();

  // A user can have many submissions for one problem, so difficulty and topic
  // counts must be taken over *distinct solved problems* — otherwise they
  // inflate past the `totalSolved` figure shown right beside them.
  const countedProblems = new Set<string>();

  for (const s of submissions) {
    // The public endpoint doesn't report a language, so those rows are stored
    // as "unknown" — counting them would render a meaningless "unknown" bar
    // rather than an honest "no language data" state.
    if (s.lang !== "unknown") languages.set(s.lang, (languages.get(s.lang) ?? 0) + 1);

    if (s.statusDisplay !== "Accepted") continue;
    if (countedProblems.has(s.problem.id)) continue;
    countedProblems.add(s.problem.id);

    byDifficulty[s.problem.difficulty] += 1;
    for (const tag of s.problem.tags) {
      topicCount.set(tag, (topicCount.get(tag) ?? 0) + 1);
    }
  }

  const topTopics = [...topicCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return {
    snapshot,
    totalSubmissions: submissions.length,
    byDifficulty,
    topTopics,
    languages: [...languages.entries()].map(([lang, count]) => ({ lang, count })),
  };
}

/** Submission counts per day for a GitHub-style heatmap (last ~year). */
export async function computeHeatmap(userId: string) {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const submissions = await prisma.submission.findMany({
    where: { userId, timestamp: { gte: since }, statusDisplay: "Accepted" },
    select: { timestamp: true },
  });

  const counts = new Map<string, number>();
  for (const s of submissions) {
    const day = s.timestamp.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}

/** Growth snapshots over time for the trend chart. */
export async function computeSnapshots(userId: string) {
  return prisma.profileSnapshot.findMany({
    where: { userId },
    orderBy: { capturedAt: "asc" },
    take: 200,
  });
}

/**
 * Reverse-chronological solve feed for the Activity page, cursor-paginated on
 * submission id (timestamps are not unique enough to page on safely).
 */
export async function getActivity(userId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.submission.findMany({
    where: { userId, statusDisplay: "Accepted" },
    include: { problem: { select: { titleSlug: true, title: true, difficulty: true, tags: true } } },
    // One entry per problem — this is a "problems you've solved" feed, so a
    // problem solved five times should appear once, at its latest solve.
    distinct: ["problemId"],
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take: limit + 1, // one extra to detect a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;

  return {
    items: page.map((s) => ({
      id: s.id,
      titleSlug: s.problem.titleSlug,
      title: s.problem.title,
      difficulty: s.problem.difficulty,
      tags: s.problem.tags,
      lang: s.lang,
      runtime: s.runtime,
      memory: s.memory,
      timestamp: s.timestamp,
    })),
    nextCursor: hasNext ? page[page.length - 1]!.id : null,
  };
}

/** Weakness radar: solved count grouped by topic (with difficulty weighting). */
export async function computeTopicRadar(userId: string) {
  const submissions = await prisma.submission.findMany({
    where: { userId },
    include: { problem: { select: { id: true, tags: true, difficulty: true } } },
  });

  const weight = { [Difficulty.EASY]: 1, [Difficulty.MEDIUM]: 2, [Difficulty.HARD]: 3 };
  const score = new Map<string, number>();
  const scored = new Set<string>();
  for (const s of submissions) {
    // Score each solved problem once; repeat submissions are not extra strength.
    if (s.statusDisplay !== "Accepted") continue;
    if (scored.has(s.problem.id)) continue;
    scored.add(s.problem.id);

    for (const tag of s.problem.tags) {
      score.set(tag, (score.get(tag) ?? 0) + weight[s.problem.difficulty]);
    }
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, value]) => ({ tag, value }));
}

// --- Cached entry points, called by the routes ---

export const getProfileStats = (userId: string) =>
  cached(userId, "profile", () => computeProfileStats(userId));

export const getOverview = (userId: string) => cached(userId, "overview", () => computeOverview(userId));

export const getHeatmap = (userId: string) => cached(userId, "heatmap", () => computeHeatmap(userId));

export const getSnapshots = (userId: string) => cached(userId, "snapshots", () => computeSnapshots(userId));

export const getTopicRadar = (userId: string) => cached(userId, "radar", () => computeTopicRadar(userId));
