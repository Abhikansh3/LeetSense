import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, authHeader } from "../helpers/app.js";
import { prisma } from "../mocks/db.js";
import { setRedisFailing } from "../mocks/ioredis.js";
import { makeProblem, makeSnapshot, makeSubmission } from "../fixtures.js";

describe("/api/stats authentication", () => {
  for (const path of ["/overview", "/profile", "/heatmap", "/snapshots", "/radar", "/activity"]) {
    it(`rejects an unauthenticated request to ${path}`, async () => {
      expect((await request(app).get(`/api/stats${path}`)).status).toBe(401);
    });
  }
});

describe("GET /api/stats/overview", () => {
  beforeEach(() => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(makeSnapshot());
    prisma.submission.findMany.mockResolvedValue([makeSubmission()]);
  });

  it("returns the headline figures", async () => {
    const res = await request(app).get("/api/stats/overview").set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.snapshot.totalSolved).toBe(81);
    expect(res.body.byDifficulty).toEqual({ EASY: 1, MEDIUM: 0, HARD: 0 });
  });

  it("serves a repeat request from cache without re-querying Postgres", async () => {
    await request(app).get("/api/stats/overview").set("Authorization", authHeader());
    const cachedRes = await request(app).get("/api/stats/overview").set("Authorization", authHeader());

    expect(cachedRes.status).toBe(200);
    expect(cachedRes.body.snapshot.totalSolved).toBe(81);
    expect(prisma.submission.findMany).toHaveBeenCalledTimes(1);
  });

  it("does not serve one user's cached figures to another", async () => {
    await request(app).get("/api/stats/overview").set("Authorization", authHeader("user-1"));
    await request(app).get("/api/stats/overview").set("Authorization", authHeader("user-2"));

    expect(prisma.submission.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.submission.findMany.mock.calls[1]![0].where.userId).toBe("user-2");
  });

  it("falls back to querying Postgres when Redis is unreachable", async () => {
    setRedisFailing(true);
    try {
      const res = await request(app).get("/api/stats/overview").set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.snapshot.totalSolved).toBe(81);
    } finally {
      setRedisFailing(false);
    }
  });
});

describe("the other cached stats endpoints", () => {
  it("caches /heatmap per user", async () => {
    prisma.submission.findMany.mockResolvedValue([{ timestamp: new Date("2026-07-01T09:00:00.000Z") }]);

    await request(app).get("/api/stats/heatmap").set("Authorization", authHeader());
    const res = await request(app).get("/api/stats/heatmap").set("Authorization", authHeader());

    expect(res.body.days).toEqual([{ date: "2026-07-01", count: 1 }]);
    expect(prisma.submission.findMany).toHaveBeenCalledTimes(1);
  });

  it("caches /radar per user", async () => {
    prisma.submission.findMany.mockResolvedValue([
      makeSubmission({ problem: makeProblem({ difficulty: "HARD", tags: ["Graph"] }) }),
    ]);

    await request(app).get("/api/stats/radar").set("Authorization", authHeader());
    const res = await request(app).get("/api/stats/radar").set("Authorization", authHeader());

    expect(res.body.topics).toEqual([{ tag: "Graph", value: 3 }]);
    expect(prisma.submission.findMany).toHaveBeenCalledTimes(1);
  });

  it("caches /profile per user", async () => {
    prisma.profileSnapshot.findFirst.mockResolvedValue(makeSnapshot());

    await request(app).get("/api/stats/profile").set("Authorization", authHeader());
    const res = await request(app).get("/api/stats/profile").set("Authorization", authHeader());

    expect(res.body.stats.totalSolved).toBe(81);
    expect(prisma.profileSnapshot.findFirst).toHaveBeenCalledTimes(1);
  });

  it("caches /snapshots per user", async () => {
    prisma.profileSnapshot.findMany.mockResolvedValue([makeSnapshot()]);

    await request(app).get("/api/stats/snapshots").set("Authorization", authHeader());
    const res = await request(app).get("/api/stats/snapshots").set("Authorization", authHeader());

    expect(res.body.snapshots).toHaveLength(1);
    expect(prisma.profileSnapshot.findMany).toHaveBeenCalledTimes(1);
  });

  it("does not cache /activity, which is paginated per cursor", async () => {
    prisma.submission.findMany.mockResolvedValue([makeSubmission()]);

    await request(app).get("/api/stats/activity").set("Authorization", authHeader());
    await request(app).get("/api/stats/activity").set("Authorization", authHeader());

    expect(prisma.submission.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/stats/activity", () => {
  beforeEach(() => {
    prisma.submission.findMany.mockResolvedValue([makeSubmission()]);
  });

  it("returns a page of solved problems", async () => {
    const res = await request(app).get("/api/stats/activity").set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ titleSlug: "two-sum", title: "Two Sum", difficulty: "EASY" });
    expect(res.body.nextCursor).toBeNull();
  });

  it("rejects a page size past the cap", async () => {
    const res = await request(app).get("/api/stats/activity?limit=500").set("Authorization", authHeader());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("defaults to a page of 25", async () => {
    await request(app).get("/api/stats/activity").set("Authorization", authHeader());

    expect(prisma.submission.findMany.mock.calls[0]![0].take).toBe(26);
  });
});
