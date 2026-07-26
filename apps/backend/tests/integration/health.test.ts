import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../helpers/app.js";
import { prisma } from "../mocks/db.js";

describe("GET /api/health", () => {
  it("reports liveness without touching any dependency", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("GET /api/health/ready", () => {
  it("reports ready when the database answers", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await request(app).get("/api/health/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", db: "up" });
  });

  it("fails the readiness check with 503 when the database is down", async () => {
    // A load balancer needs a non-2xx here to pull the instance out of
    // rotation, rather than a 200 with a sad message in it.
    prisma.$queryRaw.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app).get("/api/health/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "not-ready", db: "down" });
  });
});

describe("unknown routes", () => {
  it("404s with the standard error shape", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});
