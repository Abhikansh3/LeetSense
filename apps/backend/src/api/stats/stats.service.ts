import { prisma, Difficulty } from "@leetsense/db";

/** Headline numbers for the dashboard. */
export async function getOverview(userId: string) {
  const snapshot = await prisma.profileSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: "desc" },
  });

  const submissions = await prisma.submission.findMany({
    where: { userId },
    include: { problem: { select: { difficulty: true, tags: true } } },
  });

  const byDifficulty = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const topicCount = new Map<string, number>();
  const languages = new Map<string, number>();

  for (const s of submissions) {
    byDifficulty[s.problem.difficulty] += 1;
    for (const tag of s.problem.tags) {
      topicCount.set(tag, (topicCount.get(tag) ?? 0) + 1);
    }
    languages.set(s.lang, (languages.get(s.lang) ?? 0) + 1);
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
export async function getHeatmap(userId: string) {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const submissions = await prisma.submission.findMany({
    where: { userId, timestamp: { gte: since } },
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
export async function getSnapshots(userId: string) {
  return prisma.profileSnapshot.findMany({
    where: { userId },
    orderBy: { capturedAt: "asc" },
    take: 200,
  });
}

/** Weakness radar: solved count grouped by topic (with difficulty weighting). */
export async function getTopicRadar(userId: string) {
  const submissions = await prisma.submission.findMany({
    where: { userId },
    include: { problem: { select: { tags: true, difficulty: true } } },
  });

  const weight = { [Difficulty.EASY]: 1, [Difficulty.MEDIUM]: 2, [Difficulty.HARD]: 3 };
  const score = new Map<string, number>();
  for (const s of submissions) {
    for (const tag of s.problem.tags) {
      score.set(tag, (score.get(tag) ?? 0) + weight[s.problem.difficulty]);
    }
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, value]) => ({ tag, value }));
}
