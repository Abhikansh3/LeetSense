import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, authHeader } from "../helpers/app.js";
import { prisma } from "../mocks/db.js";
import { makeProblem } from "../fixtures.js";

const solvedProblem = { ...makeProblem(), submissions: [{ id: "s-1" }] };
const unsolvedProblem = {
  ...makeProblem({ id: "p-2", titleSlug: "add-two-numbers", difficulty: "MEDIUM" }),
  submissions: [],
};

describe("GET /api/problems", () => {
  beforeEach(() => {
    prisma.problem.findMany.mockResolvedValue([solvedProblem]);
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/problems")).status).toBe(401);
  });

  it("returns the caller's problems with a solved flag", async () => {
    const res = await request(app).get("/api/problems").set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toEqual({
      id: "problem-1",
      titleSlug: "two-sum",
      title: "Two Sum",
      difficulty: "EASY",
      tags: ["Array", "Hash Table"],
      solved: true,
    });
  });

  it("scopes the default listing to the authenticated user", async () => {
    // `Problem` is a global table; without this scoping every user sees the
    // union of everything anyone has ever synced.
    await request(app).get("/api/problems").set("Authorization", authHeader("user-7"));

    expect(prisma.problem.findMany.mock.calls[0]![0].where).toMatchObject({
      submissions: { some: { userId: "user-7" } },
    });
  });

  it("looks outside that set only for solved=false", async () => {
    prisma.problem.findMany.mockResolvedValue([unsolvedProblem]);

    const res = await request(app).get("/api/problems?solved=false").set("Authorization", authHeader());

    expect(prisma.problem.findMany.mock.calls[0]![0].where).toMatchObject({
      submissions: { none: { userId: "user-1" } },
    });
    expect(res.body.items[0].solved).toBe(false);
  });

  it("filters by difficulty", async () => {
    await request(app).get("/api/problems?difficulty=HARD").set("Authorization", authHeader());

    expect(prisma.problem.findMany.mock.calls[0]![0].where.difficulty).toBe("HARD");
  });

  it("filters by tag", async () => {
    await request(app).get("/api/problems?tag=Graph").set("Authorization", authHeader());

    expect(prisma.problem.findMany.mock.calls[0]![0].where.tags).toEqual({ has: "Graph" });
  });

  it("rejects an unknown difficulty", async () => {
    const res = await request(app).get("/api/problems?difficulty=IMPOSSIBLE").set("Authorization", authHeader());

    expect(res.status).toBe(400);
    expect(prisma.problem.findMany).not.toHaveBeenCalled();
  });

  it("rejects a page size past the cap", async () => {
    expect((await request(app).get("/api/problems?limit=1000").set("Authorization", authHeader())).status).toBe(
      400,
    );
  });

  it("hands back a cursor when there is another page", async () => {
    prisma.problem.findMany.mockResolvedValue([solvedProblem, unsolvedProblem]);

    const res = await request(app).get("/api/problems?limit=1").set("Authorization", authHeader());

    expect(res.body.items).toHaveLength(1);
    expect(res.body.nextCursor).toBe("problem-1");
  });

  it("skips the cursor row when continuing a page", async () => {
    await request(app).get("/api/problems?cursor=problem-1").set("Authorization", authHeader());

    expect(prisma.problem.findMany.mock.calls[0]![0]).toMatchObject({
      cursor: { id: "problem-1" },
      skip: 1,
    });
  });
});
