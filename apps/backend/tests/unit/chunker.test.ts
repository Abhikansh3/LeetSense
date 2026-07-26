import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../mocks/db.js";
import { buildUserChunks } from "../../src/services/rag/chunker.js";
import { makeProblem, makeSnapshot, makeSubmission } from "../fixtures.js";

/**
 * These guard the rule in CLAUDE.md: `ProfileSnapshot` is the only source for
 * "how many", and `Submission` rows are a recent sample. Getting this wrong
 * once already shipped — the assistant told a user who had solved 81 problems
 * that they had solved 20, because the chunker labelled a submission-derived
 * count as a total.
 */
describe("RAG chunker — the two data sources", () => {
  const chunkText = (chunks: { id: string; document: string }[], suffix: string) =>
    chunks.find((c) => c.id.endsWith(suffix))?.document ?? "";

  beforeEach(() => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(makeSnapshot());
    prisma.submission.findMany.mockResolvedValue([]);
  });

  it("takes the total solved count from the snapshot, not from the submissions", async () => {
    // The exact shape of the shipped bug: 81 solved whole-history, but only 20
    // submissions retrievable without a session cookie.
    prisma.submission.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) =>
        makeSubmission({ id: `s-${i}`, problem: makeProblem({ id: `p-${i}`, titleSlug: `problem-${i}` }) }),
      ),
    );

    const profile = chunkText(await buildUserChunks("user-1"), ":profile");

    expect(profile).toContain("81 problems solved in total");
    expect(profile).not.toContain("20 problems solved");
  });

  it("marks the profile totals as the authoritative ones", async () => {
    expect(chunkText(await buildUserChunks("user-1"), ":profile")).toContain("authoritative");
  });

  it("describes recent solves as a sample and says so in the text", async () => {
    prisma.submission.findMany.mockResolvedValue([
      makeSubmission({ id: "s-1", problem: makeProblem({ id: "p-1", title: "Two Sum" }) }),
      makeSubmission({
        id: "s-2",
        problem: makeProblem({ id: "p-2", title: "Valid Parentheses", titleSlug: "valid-parentheses" }),
      }),
    ]);

    const recent = chunkText(await buildUserChunks("user-1"), ":recent");

    expect(recent).toContain("NOT the total solved count");
    expect(recent).toContain("Two Sum");
    expect(recent).toContain("Valid Parentheses");
  });

  it("only reads accepted submissions, one per problem", async () => {
    await buildUserChunks("user-1");

    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", statusDisplay: "Accepted" },
        distinct: ["problemId"],
      }),
    );
  });

  it("reads the most recent snapshot for the requesting user only", async () => {
    await buildUserChunks("user-1");

    expect(prisma.profileSnapshot.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { capturedAt: "desc" },
    });
  });

  it("emits no total-bearing chunks at all when there is no snapshot", async () => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(null);
    prisma.submission.findMany.mockResolvedValue([makeSubmission()]);

    const chunks = await buildUserChunks("user-1");

    // Without a snapshot there is no trustworthy total, so the chunker must
    // stay silent rather than infer one from the sample.
    expect(chunks.map((c) => c.id)).toEqual(["user-1:recent"]);
  });

  it("scopes every chunk id to the user, so the shared collection cannot collide", async () => {
    prisma.submission.findMany.mockResolvedValue([makeSubmission()]);

    const chunks = await buildUserChunks("user-42");

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) expect(chunk.id.startsWith("user-42:")).toBe(true);
  });
});

describe("RAG chunker — derived context", () => {
  beforeEach(() => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(makeSnapshot());
    prisma.submission.findMany.mockResolvedValue([]);
  });

  it("builds one chunk per skill tag, tagged with its tier", async () => {
    const chunks = await buildUserChunks("user-1");
    const array = chunks.find((c) => c.id === "user-1:topic:Array");

    expect(array?.document).toContain("30 problems solved");
    expect(array?.metadata).toMatchObject({ kind: "topic", tag: "Array", tier: "fundamental", count: 30 });
  });

  it("calls out thinly practised topics as weak areas", async () => {
    const chunks = await buildUserChunks("user-1");

    // 2 solved — under the threshold.
    expect(chunks.find((c) => c.id === "user-1:topic:Dynamic Programming")?.document).toContain("weak area");
    // 30 solved — comfortably over it.
    expect(chunks.find((c) => c.id === "user-1:topic:Array")?.document).not.toContain("weak area");
  });

  it("flags a thin hard-problem count in the difficulty chunk", async () => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(makeSnapshot({ hardSolved: 1 }));

    const chunks = await buildUserChunks("user-1");

    expect(chunks.find((c) => c.id === "user-1:difficulty")?.document).toContain("Few hard problems");
  });

  it("lists languages strongest-first", async () => {
    const chunks = await buildUserChunks("user-1");
    const languages = chunks.find((c) => c.id === "user-1:languages")?.document ?? "";

    expect(languages.indexOf("Python3")).toBeLessThan(languages.indexOf("TypeScript"));
  });

  it("omits the languages chunk when LeetCode reported none", async () => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(makeSnapshot({ languageStats: [] }));

    const chunks = await buildUserChunks("user-1");

    expect(chunks.find((c) => c.id === "user-1:languages")).toBeUndefined();
  });

  it("survives a snapshot with no skill stats at all", async () => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(makeSnapshot({ skillStats: null }));

    const chunks = await buildUserChunks("user-1");

    expect(chunks.find((c) => c.id === "user-1:profile")).toBeDefined();
    expect(chunks.filter((c) => c.metadata.kind === "topic")).toHaveLength(0);
  });
});
