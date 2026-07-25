import { prisma } from "@leetsense/db";
import type { Chunk } from "./vectorstore.js";

/**
 * Turns a user's LeetCode data into human-readable context chunks. Each chunk
 * is a self-contained paragraph so retrieval returns coherent facts to the LLM.
 *
 * IMPORTANT — two sources, only one authoritative:
 *
 *   ProfileSnapshot  whole-history aggregates from LeetCode's public profile.
 *                    This is the truth for "how many have I solved".
 *   Submission       only what the submission endpoint exposed (~20 recent
 *                    solves without a session cookie). A *sample*, not a total.
 *
 * Chunks previously described submission-derived counts as "solved problems",
 * which contradicted the snapshot and made the assistant report 20 solved for a
 * user who had solved 81. Anything countable now comes from the snapshot, and
 * submission-derived chunks say plainly that they are a recent sample.
 */

interface SkillTag {
  tagName: string;
  problemsSolved: number;
}
interface SkillStats {
  fundamental?: SkillTag[];
  intermediate?: SkillTag[];
  advanced?: SkillTag[];
}
interface LanguageStat {
  languageName: string;
  problemsSolved: number;
}

export async function buildUserChunks(userId: string): Promise<Chunk[]> {
  const chunks: Chunk[] = [];

  const snapshot = await prisma.profileSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: "desc" },
  });

  // --- Authoritative totals ---
  if (snapshot) {
    const parts = [
      `Overall progress: ${snapshot.totalSolved} problems solved in total` +
        (snapshot.totalQuestions ? ` out of ${snapshot.totalQuestions} on LeetCode` : "") +
        `. By difficulty: ${snapshot.easySolved} easy, ${snapshot.mediumSolved} medium, ${snapshot.hardSolved} hard.`,
    ];
    if (snapshot.ranking) parts.push(`Global ranking ${snapshot.ranking}.`);
    if (snapshot.acceptanceRate != null) parts.push(`Acceptance rate ${snapshot.acceptanceRate.toFixed(1)}%.`);
    if (snapshot.streak != null) parts.push(`Current streak ${snapshot.streak} days.`);
    if (snapshot.totalActiveDays != null) parts.push(`${snapshot.totalActiveDays} active days.`);
    parts.push(`These totals are authoritative — use them for any question about how many problems were solved.`);

    chunks.push({
      id: `${userId}:profile`,
      document: parts.join(" "),
      metadata: { kind: "profile" },
    });

    chunks.push({
      id: `${userId}:difficulty`,
      document:
        `Difficulty breakdown of all ${snapshot.totalSolved} solved problems: ` +
        `${snapshot.easySolved} easy, ${snapshot.mediumSolved} medium, ${snapshot.hardSolved} hard. ` +
        (snapshot.hardSolved < 5
          ? `Few hard problems solved — increasing hard practice would build depth.`
          : `Good coverage of hard problems.`),
      metadata: { kind: "difficulty" },
    });

    // --- Per-topic strength, from LeetCode's own tag counts ---
    const skills = (snapshot.skillStats ?? null) as unknown as SkillStats | null;
    for (const [tier, tags] of [
      ["fundamental", skills?.fundamental ?? []],
      ["intermediate", skills?.intermediate ?? []],
      ["advanced", skills?.advanced ?? []],
    ] as const) {
      for (const tag of tags) {
        chunks.push({
          id: `${userId}:topic:${tag.tagName}`,
          document:
            `Topic "${tag.tagName}" (${tier}): ${tag.problemsSolved} problems solved. ` +
            (tag.problemsSolved < 3
              ? `This is a weak area with little practice — a good place to improve.`
              : `This is a relatively practised area.`),
          metadata: { kind: "topic", tag: tag.tagName, tier, count: tag.problemsSolved },
        });
      }
      if (tags.length > 0) {
        const total = tags.reduce((s, t) => s + t.problemsSolved, 0);
        chunks.push({
          id: `${userId}:tier:${tier}`,
          document:
            `${tier[0]!.toUpperCase() + tier.slice(1)} topics: ${tags.length} tags covered, ` +
            `${total} problems solved across them. Strongest: ` +
            [...tags]
              .sort((a, b) => b.problemsSolved - a.problemsSolved)
              .slice(0, 5)
              .map((t) => `${t.tagName} (${t.problemsSolved})`)
              .join(", ") +
            ".",
          metadata: { kind: "tier", tier },
        });
      }
    }

    // --- Languages ---
    const languages = (snapshot.languageStats ?? []) as unknown as LanguageStat[];
    if (languages.length > 0) {
      chunks.push({
        id: `${userId}:languages`,
        document:
          `Languages used: ` +
          [...languages]
            .sort((a, b) => b.problemsSolved - a.problemsSolved)
            .map((l) => `${l.languageName} (${l.problemsSolved} problems)`)
            .join(", ") +
          ".",
        metadata: { kind: "languages" },
      });
    }
  }

  // --- Recent activity: a sample, and labelled as one ---
  const submissions = await prisma.submission.findMany({
    where: { userId, statusDisplay: "Accepted" },
    include: { problem: true },
    orderBy: { timestamp: "desc" },
    distinct: ["problemId"],
    take: 25,
  });

  if (submissions.length > 0) {
    chunks.push({
      id: `${userId}:recent`,
      document:
        `Most recently solved problems (a recent sample of ${submissions.length}, NOT the total solved count): ` +
        submissions
          .map((s) => `${s.problem.title} (${s.problem.difficulty.toLowerCase()})`)
          .join(", ") +
        ". Use the overall progress figures for totals.",
      metadata: { kind: "recent" },
    });
  }

  return chunks;
}
