import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../mocks/db.js";
import {
  computeHeatmap,
  computeOverview,
  computeProfileStats,
  computeTopicRadar,
  getActivity,
} from "../../src/api/stats/stats.service.js";
import { makeProblem, makeSnapshot, makeSubmission } from "../fixtures.js";

const easy = makeProblem({ id: "p-easy", titleSlug: "two-sum", difficulty: "EASY", tags: ["Array"] });
const medium = makeProblem({
  id: "p-medium",
  titleSlug: "add-two-numbers",
  difficulty: "MEDIUM",
  tags: ["Array", "Linked List"],
});
const hard = makeProblem({
  id: "p-hard",
  titleSlug: "median-of-two-sorted-arrays",
  difficulty: "HARD",
  tags: ["Array", "Binary Search"],
});

describe("computeOverview", () => {
  beforeEach(() => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(makeSnapshot());
  });

  it("counts each solved problem once, however many times it was submitted", async () => {
    // Three submissions, two problems — the donut used to read 3 here and
    // disagree with the total shown beside it.
    prisma.submission.findMany.mockResolvedValue([
      makeSubmission({ id: "s-1", problem: easy }),
      makeSubmission({ id: "s-2", problem: easy, timestamp: new Date("2026-07-02T10:00:00Z") }),
      makeSubmission({ id: "s-3", problem: medium }),
    ]);

    const overview = await computeOverview("user-1");

    expect(overview.byDifficulty).toEqual({ EASY: 1, MEDIUM: 1, HARD: 0 });
    expect(overview.totalSubmissions).toBe(3);
  });

  it("excludes rejected submissions from the difficulty split", async () => {
    prisma.submission.findMany.mockResolvedValue([
      makeSubmission({ id: "s-1", problem: easy }),
      makeSubmission({ id: "s-2", problem: medium, statusDisplay: "Wrong Answer" }),
    ]);

    expect((await computeOverview("user-1")).byDifficulty).toEqual({ EASY: 1, MEDIUM: 0, HARD: 0 });
  });

  it("leaves out the placeholder language rather than charting an 'unknown' bar", async () => {
    prisma.submission.findMany.mockResolvedValue([
      makeSubmission({ id: "s-1", problem: easy, lang: "python3" }),
      makeSubmission({ id: "s-2", problem: medium, lang: "unknown" }),
    ]);

    expect((await computeOverview("user-1")).languages).toEqual([{ lang: "python3", count: 1 }]);
  });

  it("ranks topics by how many distinct problems used them", async () => {
    prisma.submission.findMany.mockResolvedValue([
      makeSubmission({ id: "s-1", problem: easy }),
      makeSubmission({ id: "s-2", problem: medium }),
      makeSubmission({ id: "s-3", problem: hard }),
    ]);

    const topics = (await computeOverview("user-1")).topTopics;

    expect(topics[0]).toEqual({ tag: "Array", count: 3 });
    expect(topics).toHaveLength(3);
  });

  it("returns the latest snapshot alongside the derived figures", async () => {
    prisma.submission.findMany.mockResolvedValue([]);

    expect((await computeOverview("user-1")).snapshot).toMatchObject({ totalSolved: 81 });
    expect(prisma.profileSnapshot.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { capturedAt: "desc" },
    });
  });
});

describe("computeProfileStats", () => {
  it("reports null rather than zeroes when nothing has been synced", async () => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(null);

    expect(await computeProfileStats("user-1")).toEqual({ stats: null });
  });

  it("surfaces the whole-history aggregates from the snapshot", async () => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(makeSnapshot());

    const { stats } = await computeProfileStats("user-1");

    expect(stats).toMatchObject({ totalSolved: 81, acceptanceRate: 62.5, streak: 12 });
  });
});

describe("computeHeatmap", () => {
  it("collapses submissions into per-day counts", async () => {
    prisma.submission.findMany.mockResolvedValue([
      { timestamp: new Date("2026-07-01T09:00:00.000Z") },
      { timestamp: new Date("2026-07-01T21:30:00.000Z") },
      { timestamp: new Date("2026-07-02T08:00:00.000Z") },
    ]);

    expect(await computeHeatmap("user-1")).toEqual([
      { date: "2026-07-01", count: 2 },
      { date: "2026-07-02", count: 1 },
    ]);
  });

  it("asks only for this user's accepted submissions within the last year", async () => {
    prisma.submission.findMany.mockResolvedValue([]);

    await computeHeatmap("user-1");

    const where = prisma.submission.findMany.mock.calls[0]![0].where;
    expect(where.userId).toBe("user-1");
    expect(where.statusDisplay).toBe("Accepted");
    expect(where.timestamp.gte).toBeInstanceOf(Date);
  });
});

describe("computeTopicRadar", () => {
  it("weights harder problems more heavily", async () => {
    prisma.submission.findMany.mockResolvedValue([
      makeSubmission({ id: "s-1", problem: makeProblem({ id: "p-1", difficulty: "EASY", tags: ["Greedy"] }) }),
      makeSubmission({ id: "s-2", problem: makeProblem({ id: "p-2", difficulty: "HARD", tags: ["Graph"] }) }),
    ]);

    const radar = await computeTopicRadar("user-1");

    expect(radar).toEqual([
      { tag: "Graph", value: 3 },
      { tag: "Greedy", value: 1 },
    ]);
  });

  it("does not let repeat submissions inflate a topic's score", async () => {
    prisma.submission.findMany.mockResolvedValue([
      makeSubmission({ id: "s-1", problem: easy }),
      makeSubmission({ id: "s-2", problem: easy, timestamp: new Date("2026-07-05T10:00:00Z") }),
    ]);

    expect(await computeTopicRadar("user-1")).toEqual([{ tag: "Array", value: 1 }]);
  });

  it("returns at most eight topics", async () => {
    prisma.submission.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) =>
        makeSubmission({
          id: `s-${i}`,
          problem: makeProblem({ id: `p-${i}`, difficulty: "MEDIUM", tags: [`Topic ${i}`] }),
        }),
      ),
    );

    expect(await computeTopicRadar("user-1")).toHaveLength(8);
  });
});

describe("getActivity", () => {
  it("returns a cursor when more rows exist than were asked for", async () => {
    prisma.submission.findMany.mockResolvedValue([
      makeSubmission({ id: "s-1", problem: easy }),
      makeSubmission({ id: "s-2", problem: medium }),
      makeSubmission({ id: "s-3", problem: hard }),
    ]);

    const page = await getActivity("user-1", undefined, 2);

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("s-2");
  });

  it("returns a null cursor on the last page", async () => {
    prisma.submission.findMany.mockResolvedValue([makeSubmission({ id: "s-1", problem: easy })]);

    expect((await getActivity("user-1", undefined, 25)).nextCursor).toBeNull();
  });

  it("fetches one extra row to detect the next page, and skips the cursor row itself", async () => {
    prisma.submission.findMany.mockResolvedValue([]);

    await getActivity("user-1", "s-9", 25);

    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 26, cursor: { id: "s-9" }, skip: 1, distinct: ["problemId"] }),
    );
  });
});
