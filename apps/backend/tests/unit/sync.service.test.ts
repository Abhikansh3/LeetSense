import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../mocks/db.js";
import { collection } from "../mocks/chromadb.js";
import { redisKeys } from "../mocks/ioredis.js";
import {
  fetchAllSubmissions,
  fetchProfile,
  fetchQuestionMeta,
  fetchRecentAcSubmissions,
  fetchSessionUsername,
} from "../mocks/leetcode.js";
import { runSync, createSyncJob } from "../../src/services/sync.service.js";
import { encryptSecret } from "../../src/lib/crypto.js";
import { cached } from "../../src/lib/cache.js";
import { makeUser } from "../fixtures.js";

const profile = {
  username: "learner",
  totalSolved: 81,
  easySolved: 40,
  mediumSolved: 35,
  hardSolved: 6,
  ranking: 512_345,
  reputation: 0,
  totalQuestions: 3500,
  acceptanceRate: 62.5,
  streak: 12,
  totalActiveDays: 140,
  languageStats: [{ languageName: "Python3", problemsSolved: 81 }],
  skillStats: { fundamental: [], intermediate: [], advanced: [] },
  submissionStats: { accepted: 81, submitted: 130 },
};

const rawSubmission = {
  titleSlug: "two-sum",
  timestamp: 1_767_000_000,
  lang: "python3",
  statusDisplay: "Accepted",
  runtime: "52 ms",
  memory: "16.9 MB",
};

/** The credential pair a user stores via Profile → Full history access. */
function withStoredCookies() {
  return makeUser({
    leetcodeSessionEnc: encryptSecret("a-real-looking-session-cookie"),
    leetcodeCsrfEnc: encryptSecret("a-real-looking-csrf-token"),
  });
}

beforeEach(() => {
  prisma.user.findUnique.mockResolvedValue(makeUser());
  prisma.syncJob.update.mockResolvedValue({});
  prisma.profileSnapshot.create.mockResolvedValue({});
  prisma.profileSnapshot.findFirst.mockResolvedValue(null);
  prisma.problem.findMany.mockResolvedValue([]);
  prisma.problem.upsert.mockResolvedValue({});
  prisma.submission.findMany.mockResolvedValue([]);
  prisma.submission.upsert.mockResolvedValue({});
  fetchProfile.mockResolvedValue(profile);
});

/**
 * `fetchAllSubmissions()` takes no username — it returns whoever owns the
 * cookie. Calling it for an account that is not the cookie owner would serve
 * one person's history to everyone, so which branch runs here is a correctness
 * boundary, not a performance choice.
 */
describe("runSync — choosing the submission source", () => {
  it("uses the public per-user endpoint when the user has stored no cookies", async () => {
    await runSync("user-1", "job-1");

    expect(fetchRecentAcSubmissions).toHaveBeenCalledWith("learner", 100);
    expect(fetchAllSubmissions).not.toHaveBeenCalled();
  });

  it("uses the full history only when the cookies belong to the account being synced", async () => {
    prisma.user.findUnique.mockResolvedValue(withStoredCookies());
    fetchSessionUsername.mockResolvedValue("learner");

    await runSync("user-1", "job-1");

    expect(fetchAllSubmissions).toHaveBeenCalled();
    expect(fetchRecentAcSubmissions).not.toHaveBeenCalled();
  });

  it("matches the cookie owner case-insensitively", async () => {
    prisma.user.findUnique.mockResolvedValue(withStoredCookies());
    fetchSessionUsername.mockResolvedValue("Learner");

    await runSync("user-1", "job-1");

    expect(fetchAllSubmissions).toHaveBeenCalled();
  });

  it("refuses the full history when the cookies belong to somebody else", async () => {
    prisma.user.findUnique.mockResolvedValue(
      makeUser({
        leetcodeUsername: "learner",
        leetcodeSessionEnc: encryptSecret("someone-elses-session"),
        leetcodeCsrfEnc: encryptSecret("someone-elses-csrf"),
      }),
    );
    fetchSessionUsername.mockResolvedValue("a-different-person");

    await runSync("user-1", "job-1");

    expect(fetchAllSubmissions).not.toHaveBeenCalled();
    expect(fetchRecentAcSubmissions).toHaveBeenCalledWith("learner", 100);
  });

  it("falls back to the public endpoint when stored cookies have expired", async () => {
    prisma.user.findUnique.mockResolvedValue(withStoredCookies());
    fetchSessionUsername.mockResolvedValue(null);

    await runSync("user-1", "job-1");

    expect(fetchRecentAcSubmissions).toHaveBeenCalled();
    expect(fetchAllSubmissions).not.toHaveBeenCalled();
  });

  it("falls back to the public endpoint when only half the credential decrypts", async () => {
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ leetcodeSessionEnc: encryptSecret("session"), leetcodeCsrfEnc: null }),
    );

    await runSync("user-1", "job-1");

    expect(fetchRecentAcSubmissions).toHaveBeenCalled();
  });

  it("refuses to sync an account with no linked LeetCode handle", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ leetcodeUsername: null }));

    await expect(runSync("user-1", "job-1")).rejects.toThrow(/no linked LeetCode username/);
    expect(fetchProfile).not.toHaveBeenCalled();
  });
});

describe("runSync — persisting what it fetched", () => {
  it("records a growth snapshot from the public profile figures", async () => {
    await runSync("user-1", "job-1");

    expect(prisma.profileSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", totalSolved: 81, easySolved: 40, hardSolved: 6 }),
    });
  });

  it("resolves metadata only for problems it has never seen", async () => {
    fetchRecentAcSubmissions.mockResolvedValue([
      rawSubmission,
      { ...rawSubmission, titleSlug: "valid-parentheses" },
    ]);
    prisma.problem.findMany
      .mockResolvedValueOnce([{ titleSlug: "two-sum" }])
      .mockResolvedValue([{ id: "p-1", titleSlug: "two-sum" }]);
    fetchQuestionMeta.mockResolvedValue({
      titleSlug: "valid-parentheses",
      title: "Valid Parentheses",
      difficulty: "EASY",
      tags: ["Stack"],
      questionId: "20",
    });

    await runSync("user-1", "job-1");

    expect(fetchQuestionMeta).toHaveBeenCalledTimes(1);
    expect(fetchQuestionMeta).toHaveBeenCalledWith("valid-parentheses");
  });

  it("de-duplicates repeated slugs before resolving them", async () => {
    fetchRecentAcSubmissions.mockResolvedValue([rawSubmission, { ...rawSubmission, timestamp: 1_767_100_000 }]);

    await runSync("user-1", "job-1");

    expect(fetchQuestionMeta).toHaveBeenCalledTimes(1);
  });

  it("stores each submission against its resolved problem", async () => {
    fetchRecentAcSubmissions.mockResolvedValue([rawSubmission]);
    prisma.problem.findMany.mockResolvedValue([{ id: "p-1", titleSlug: "two-sum" }]);

    await runSync("user-1", "job-1");

    expect(prisma.submission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: "user-1", problemId: "p-1", lang: "python3" }),
      }),
    );
  });

  it("skips submissions whose problem could not be resolved rather than failing the sync", async () => {
    fetchRecentAcSubmissions.mockResolvedValue([{ ...rawSubmission, titleSlug: "a-mystery-problem" }]);
    prisma.problem.findMany.mockResolvedValue([]);
    fetchQuestionMeta.mockResolvedValue(null);

    await runSync("user-1", "job-1");

    expect(prisma.submission.upsert).not.toHaveBeenCalled();
    expect(prisma.syncJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
  });
});

describe("runSync — progress, cache and failure", () => {
  it("finishes by marking the job complete at 100%", async () => {
    await runSync("user-1", "job-1");

    const last = prisma.syncJob.update.mock.calls.at(-1)![0];
    expect(last).toMatchObject({
      where: { id: "job-1" },
      data: expect.objectContaining({ status: "COMPLETED", progress: 100 }),
    });
  });

  it("drops the user's cached dashboard figures", async () => {
    await cached("user-1", "overview", async () => ({ total: 0 }));

    await runSync("user-1", "job-1");

    // A new generation: the pre-sync entry is no longer readable.
    const fresh = await cached("user-1", "overview", async () => ({ total: 81 }));
    expect(fresh).toEqual({ total: 81 });
    expect(redisKeys()).toContain("stats:user-1:v1:overview");
  });

  it("completes the sync even if RAG indexing fails", async () => {
    // The core data is already saved; an embedding hiccup should only degrade
    // AI chat, not fail the whole job.
    collection.upsert.mockRejectedValue(new Error("Gemini quota exhausted"));
    prisma.profileSnapshot.findFirst.mockResolvedValue({ ...profile, id: "snap-1", capturedAt: new Date() });

    await expect(runSync("user-1", "job-1")).resolves.toBeUndefined();

    const last = prisma.syncJob.update.mock.calls.at(-1)![0];
    expect(last.data.status).toBe("COMPLETED");
  });

  it("marks the job FAILED with the reason when a fetch throws", async () => {
    fetchProfile.mockRejectedValue(new Error("LeetCode returned 403"));

    await expect(runSync("user-1", "job-1")).rejects.toThrow("LeetCode returned 403");

    expect(prisma.syncJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({ status: "FAILED", error: "LeetCode returned 403" }),
    });
  });

  it("invalidates the cache on the failure path too", async () => {
    // A sync can fail after the snapshot row was written, which already makes
    // the cached figures stale.
    fetchRecentAcSubmissions.mockRejectedValue(new Error("network reset"));

    await expect(runSync("user-1", "job-1")).rejects.toThrow();

    expect(redisKeys()).toContain("stats:user-1:version");
  });
});

describe("createSyncJob", () => {
  it("opens a job in the PENDING state", async () => {
    prisma.syncJob.create.mockResolvedValue({ id: "job-1", status: "PENDING" });

    await createSyncJob("user-1");

    expect(prisma.syncJob.create).toHaveBeenCalledWith({ data: { userId: "user-1", status: "PENDING" } });
  });
});
