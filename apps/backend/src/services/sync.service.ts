import { prisma, Difficulty, SyncStatus, type Prisma } from "@leetsense/db";
import { redis } from "../lib/redis.js";
import { invalidateUserStats } from "../lib/cache.js";
import { logger } from "../lib/logger.js";
import {
  fetchProfile,
  fetchRecentAcSubmissions,
  fetchAllSubmissions,
  fetchSessionUsername,
  fetchQuestionMeta,
  type RawSubmission,
  type LeetCodeCredentials,
} from "../fetchers/leetcode.js";
import { decryptSecret } from "../lib/crypto.js";
import { indexUserData } from "./rag/index.js";

/**
 * How many recent accepted submissions to request on the public path.
 * LeetCode caps this server-side (commonly ~20), so this is an upper bound,
 * not a guarantee — the full history needs that user's own session cookie.
 */
const PUBLIC_SUBMISSION_LIMIT = 100;

/** Both halves must decrypt for the pair to be usable. */
function decryptCredentials(sessionEnc: string | null, csrfEnc: string | null): LeetCodeCredentials | null {
  const session = decryptSecret(sessionEnc);
  const csrf = decryptSecret(csrfEnc);
  return session && csrf ? { session, csrf } : null;
}

/** The 9 stages surfaced to the frontend progress indicator. */
export const SYNC_STAGES = [
  { key: "starting", label: "Starting sync", progress: 5 },
  { key: "profile", label: "Fetching profile", progress: 15 },
  { key: "snapshot", label: "Saving stats snapshot", progress: 25 },
  { key: "submissions", label: "Fetching submissions", progress: 40 },
  { key: "resolving", label: "Resolving problem details", progress: 60 },
  { key: "problems", label: "Saving problems", progress: 70 },
  { key: "saving", label: "Saving submissions", progress: 85 },
  { key: "indexing", label: "Indexing for AI search", progress: 95 },
  { key: "done", label: "Done", progress: 100 },
] as const;

type StageKey = (typeof SYNC_STAGES)[number]["key"];

export function progressChannel(userId: string): string {
  return `sync:progress:${userId}`;
}

/** Persists stage to the SyncJob row and publishes it to the user's SSE channel. */
async function emit(userId: string, jobId: string, stage: StageKey, extra?: Record<string, unknown>) {
  const meta = SYNC_STAGES.find((s) => s.key === stage)!;
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      stage: meta.label,
      progress: meta.progress,
      status: stage === "done" ? SyncStatus.COMPLETED : SyncStatus.RUNNING,
      ...(stage === "done" ? { finishedAt: new Date() } : {}),
    },
  });
  await redis.publish(
    progressChannel(userId),
    JSON.stringify({ jobId, stage: meta.key, label: meta.label, progress: meta.progress, ...extra }),
  );
}

/** Creates a PENDING sync job row and returns it. */
export async function createSyncJob(userId: string) {
  return prisma.syncJob.create({ data: { userId, status: SyncStatus.PENDING } });
}

/**
 * The heavy lifting, run inside the BullMQ worker. Fetches LeetCode data,
 * upserts problems + submissions, and records a growth snapshot.
 */
export async function runSync(userId: string, jobId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.leetcodeUsername) {
    throw new Error("User has no linked LeetCode username");
  }
  const username = user.leetcodeUsername;

  try {
    await emit(userId, jobId, "starting");

    // 1. Profile + aggregate stats
    await emit(userId, jobId, "profile");
    const profile = await fetchProfile(username);

    // 2. Growth snapshot
    await emit(userId, jobId, "snapshot");
    await prisma.profileSnapshot.create({
      data: {
        userId,
        totalSolved: profile.totalSolved,
        easySolved: profile.easySolved,
        mediumSolved: profile.mediumSolved,
        hardSolved: profile.hardSolved,
        ranking: profile.ranking,
        reputation: profile.reputation,
        totalQuestions: profile.totalQuestions,
        acceptanceRate: profile.acceptanceRate,
        streak: profile.streak,
        totalActiveDays: profile.totalActiveDays,
        // Plain interfaces lack the index signature Prisma's Json input wants,
        // so these are cast at the write boundary. Shapes are documented on
        // the ProfileSnapshot model.
        languageStats: profile.languageStats as unknown as Prisma.InputJsonValue,
        skillStats: profile.skillStats as unknown as Prisma.InputJsonValue,
        submissionStats: profile.submissionStats as unknown as Prisma.InputJsonValue,
      },
    });

    // 3. Submissions — the authenticated endpoint returns the *cookie owner's*
    // history regardless of `username`, so it is only correct when the account
    // being synced IS the cookie owner. For anyone else we must use the public
    // per-user endpoint, or every user would be given one person's data.
    await emit(userId, jobId, "submissions");
    // This user's own cookies, if they've linked a session. Decrypted only
    // here, held in memory for the duration of the sync, and never logged.
    const creds = decryptCredentials(user.leetcodeSessionEnc, user.leetcodeCsrfEnc);

    const sessionUser = await fetchSessionUsername(creds);
    const canUseFullHistory = sessionUser !== null && sessionUser.toLowerCase() === username.toLowerCase();

    if (creds && sessionUser === null) {
      logger.warn({ userId, username }, "Stored LeetCode session is expired or invalid; falling back to public history");
    } else if (sessionUser !== null && !canUseFullHistory) {
      logger.info(
        { userId, username, sessionUser },
        "LeetCode session belongs to a different account; using public submission history",
      );
    }

    const raw: RawSubmission[] = canUseFullHistory
      ? await fetchAllSubmissions(creds)
      : await fetchRecentAcSubmissions(username, PUBLIC_SUBMISSION_LIMIT);

    // De-dup by slug for problem resolution
    const uniqueSlugs = [...new Set(raw.map((s) => s.titleSlug))];

    // 4. Resolve problem metadata for slugs we don't have yet
    await emit(userId, jobId, "resolving", { total: uniqueSlugs.length });
    const known = await prisma.problem.findMany({
      where: { titleSlug: { in: uniqueSlugs } },
      select: { titleSlug: true },
    });
    const knownSet = new Set(known.map((p) => p.titleSlug));
    const missing = uniqueSlugs.filter((s) => !knownSet.has(s));

    const resolved = [];
    for (const slug of missing) {
      const meta = await fetchQuestionMeta(slug);
      if (meta) resolved.push(meta);
    }

    // 5. Upsert problems
    await emit(userId, jobId, "problems", { resolved: resolved.length });
    for (const m of resolved) {
      await prisma.problem.upsert({
        where: { titleSlug: m.titleSlug },
        update: { title: m.title, difficulty: m.difficulty as Difficulty, tags: m.tags, questionId: m.questionId },
        create: {
          titleSlug: m.titleSlug,
          title: m.title,
          difficulty: m.difficulty as Difficulty,
          tags: m.tags,
          questionId: m.questionId,
        },
      });
    }

    // 6. Upsert submissions
    await emit(userId, jobId, "saving", { count: raw.length });
    const slugToId = new Map(
      (
        await prisma.problem.findMany({
          where: { titleSlug: { in: uniqueSlugs } },
          select: { id: true, titleSlug: true },
        })
      ).map((p) => [p.titleSlug, p.id]),
    );

    for (const s of raw) {
      const problemId = slugToId.get(s.titleSlug);
      if (!problemId) continue; // couldn't resolve this problem, skip
      const timestamp = new Date(s.timestamp * 1000);
      await prisma.submission.upsert({
        where: { userId_problemId_timestamp: { userId, problemId, timestamp } },
        update: {},
        create: {
          userId,
          problemId,
          lang: s.lang,
          statusDisplay: s.statusDisplay,
          timestamp,
          runtime: s.runtime,
          memory: s.memory,
        },
      });
    }

    // The dashboard aggregations are cached per user, and this is the only
    // thing that changes what they read. Invalidate before the "done" event —
    // that event is what makes the frontend refetch, so invalidating after it
    // would race the refetch and re-cache the pre-sync numbers.
    await invalidateUserStats(userId);

    // 7. RAG indexing — embed the freshly synced data (skipped if no Gemini key).
    // Non-fatal: the core sync already succeeded, so an embedding hiccup only
    // degrades AI chat, it shouldn't fail the whole job.
    await emit(userId, jobId, "indexing");
    try {
      await indexUserData(userId);
    } catch (err) {
      logger.warn({ err, userId }, "RAG indexing failed (sync still completed)");
    }

    // 8. Done
    await emit(userId, jobId, "done", { totalSolved: profile.totalSolved });
    logger.info({ userId, jobId, submissions: raw.length }, "Sync completed");
  } catch (err) {
    logger.error({ err, userId, jobId }, "Sync failed");
    // A sync can fail after the snapshot was written, so the cache may already
    // be stale even on the failure path.
    await invalidateUserStats(userId);
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: SyncStatus.FAILED,
        error: err instanceof Error ? err.message : "Unknown error",
        finishedAt: new Date(),
      },
    });
    await redis.publish(
      progressChannel(userId),
      JSON.stringify({ jobId, stage: "error", error: err instanceof Error ? err.message : "Unknown error" }),
    );
    throw err;
  }
}
