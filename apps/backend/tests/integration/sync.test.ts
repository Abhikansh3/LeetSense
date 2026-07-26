import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, authHeader } from "../helpers/app.js";
import { prisma } from "../mocks/db.js";
import { queueAdd } from "../mocks/bullmq.js";
import { redisKeys } from "../mocks/ioredis.js";
import { makeUser } from "../fixtures.js";
import { cached } from "../../src/lib/cache.js";

describe("POST /api/sync", () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.syncJob.create.mockResolvedValue({ id: "job-1", status: "PENDING" });
  });

  it("requires authentication", async () => {
    expect((await request(app).post("/api/sync")).status).toBe(401);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("queues a job and returns 202 with its id", async () => {
    const res = await request(app).post("/api/sync").set("Authorization", authHeader()).send({});

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: "job-1", status: "PENDING" });
  });

  it("enqueues the work for the authenticated user, not whoever was named", async () => {
    await request(app).post("/api/sync").set("Authorization", authHeader("user-7")).send({});

    expect(queueAdd).toHaveBeenCalledWith("sync", { userId: "user-7", jobId: "job-1" });
  });

  it("refuses to queue anything when no LeetCode handle is linked", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ leetcodeUsername: null }));

    const res = await request(app).post("/api/sync").set("Authorization", authHeader()).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Link a LeetCode username/);
    expect(prisma.syncJob.create).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("links a handle passed on the first sync", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ leetcodeUsername: null })
      .mockResolvedValue(makeUser({ leetcodeUsername: "newhandle" }));
    prisma.user.update.mockResolvedValue(makeUser());

    await request(app)
      .post("/api/sync")
      .set("Authorization", authHeader())
      .send({ leetcodeUsername: "newhandle" });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { leetcodeUsername: "newhandle" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("wipes the previous handle's data when repointing at a different account", async () => {
    // Otherwise the two histories accumulate and the dashboard shows one
    // person's solves merged into another's.
    prisma.user.findUnique
      .mockResolvedValueOnce({ leetcodeUsername: "oldhandle" })
      .mockResolvedValue(makeUser({ leetcodeUsername: "newhandle" }));
    prisma.user.update.mockResolvedValue(makeUser());
    prisma.submission.deleteMany.mockResolvedValue({ count: 20 });
    prisma.profileSnapshot.deleteMany.mockResolvedValue({ count: 3 });

    await request(app)
      .post("/api/sync")
      .set("Authorization", authHeader())
      .send({ leetcodeUsername: "newhandle" });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.submission.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prisma.profileSnapshot.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("drops the cached dashboard numbers built from the wiped rows", async () => {
    await cached("user-1", "overview", async () => ({ total: 81 }));
    expect(redisKeys()).toContain("stats:user-1:v0:overview");

    prisma.user.findUnique
      .mockResolvedValueOnce({ leetcodeUsername: "oldhandle" })
      .mockResolvedValue(makeUser({ leetcodeUsername: "newhandle" }));
    prisma.user.update.mockResolvedValue(makeUser());
    prisma.submission.deleteMany.mockResolvedValue({ count: 20 });
    prisma.profileSnapshot.deleteMany.mockResolvedValue({ count: 3 });

    await request(app)
      .post("/api/sync")
      .set("Authorization", authHeader())
      .send({ leetcodeUsername: "newhandle" });

    // A new generation, so the pre-relink entry can no longer be read.
    const fresh = await cached("user-1", "overview", async () => ({ total: 0 }));
    expect(fresh).toEqual({ total: 0 });
  });

  it("treats a case-different spelling of the same handle as the same account", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ leetcodeUsername: "Learner" })
      .mockResolvedValue(makeUser());
    prisma.user.update.mockResolvedValue(makeUser());

    await request(app).post("/api/sync").set("Authorization", authHeader()).send({ leetcodeUsername: "learner" });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an empty handle rather than linking one", async () => {
    const res = await request(app)
      .post("/api/sync")
      .set("Authorization", authHeader())
      .send({ leetcodeUsername: "" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/sync/status", () => {
  it("returns the caller's most recent job", async () => {
    prisma.syncJob.findFirst.mockResolvedValue({ id: "job-1", status: "RUNNING", progress: 40 });

    const res = await request(app).get("/api/sync/status").set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({ id: "job-1", progress: 40 });
    expect(prisma.syncJob.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { startedAt: "desc" },
    });
  });

  it("returns null when the user has never synced", async () => {
    prisma.syncJob.findFirst.mockResolvedValue(null);

    expect((await request(app).get("/api/sync/status").set("Authorization", authHeader())).body.job).toBeNull();
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/sync/status")).status).toBe(401);
  });
});

describe("GET /api/sync/stream", () => {
  // EventSource cannot set headers, so this route authenticates from a query
  // param — which makes it worth proving the token is actually checked.
  it("rejects a missing token", async () => {
    expect((await request(app).get("/api/sync/stream")).status).toBe(401);
  });

  it("rejects a forged token", async () => {
    expect((await request(app).get("/api/sync/stream?token=forged.token.value")).status).toBe(401);
  });
});
