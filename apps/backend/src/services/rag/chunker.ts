import { prisma } from "@leetsense/db";
import type { Chunk } from "./vectorstore.js";

/**
 * Turns a user's LeetCode data into human-readable context chunks. Each chunk
 * is a self-contained paragraph so retrieval returns coherent facts to the LLM.
 */
export async function buildUserChunks(userId: string): Promise<Chunk[]> {
  const chunks: Chunk[] = [];

  // --- Profile / overall stats (latest snapshot) ---
  const snapshot = await prisma.profileSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: "desc" },
  });
  if (snapshot) {
    chunks.push({
      id: `${userId}:profile`,
      document:
        `Overall progress: solved ${snapshot.totalSolved} problems total — ` +
        `${snapshot.easySolved} easy, ${snapshot.mediumSolved} medium, ${snapshot.hardSolved} hard. ` +
        (snapshot.ranking ? `Global ranking is ${snapshot.ranking}. ` : "") +
        `Medium and hard problems are the strongest signal of interview readiness.`,
      metadata: { kind: "profile" },
    });
  }

  // --- Submissions joined with problem tags/difficulty ---
  const submissions = await prisma.submission.findMany({
    where: { userId },
    include: { problem: true },
    orderBy: { timestamp: "desc" },
  });

  // Per-topic aggregates
  const topicCount = new Map<string, number>();
  const topicDifficulty = new Map<string, { EASY: number; MEDIUM: number; HARD: number }>();
  for (const s of submissions) {
    for (const tag of s.problem.tags) {
      topicCount.set(tag, (topicCount.get(tag) ?? 0) + 1);
      const d = topicDifficulty.get(tag) ?? { EASY: 0, MEDIUM: 0, HARD: 0 };
      d[s.problem.difficulty] += 1;
      topicDifficulty.set(tag, d);
    }
  }

  for (const [tag, count] of topicCount) {
    const d = topicDifficulty.get(tag)!;
    chunks.push({
      id: `${userId}:topic:${tag}`,
      document:
        `Topic "${tag}": solved ${count} problems ` +
        `(${d.EASY} easy, ${d.MEDIUM} medium, ${d.HARD} hard). ` +
        (count < 3 ? `This is a weak area with little practice — a good place to improve.` : ""),
      metadata: { kind: "topic", tag, count },
    });
  }

  // --- Recent activity ---
  const recent = submissions.slice(0, 15);
  if (recent.length > 0) {
    chunks.push({
      id: `${userId}:recent`,
      document:
        `Recently solved problems: ` +
        recent
          .map((s) => `${s.problem.title} (${s.problem.difficulty.toLowerCase()})`)
          .join(", ") +
        ".",
      metadata: { kind: "recent" },
    });
  }

  // --- Difficulty distribution as a weakness signal ---
  const diffCount = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const s of submissions) diffCount[s.problem.difficulty] += 1;
  chunks.push({
    id: `${userId}:difficulty`,
    document:
      `Difficulty breakdown of solved problems: ${diffCount.EASY} easy, ` +
      `${diffCount.MEDIUM} medium, ${diffCount.HARD} hard. ` +
      (diffCount.HARD < 5
        ? `Few hard problems solved — increasing hard practice would build depth.`
        : `Good coverage of hard problems.`),
    metadata: { kind: "difficulty" },
  });

  return chunks;
}
