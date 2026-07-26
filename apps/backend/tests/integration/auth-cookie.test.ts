import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { makeUser } from "../fixtures.js";

/**
 * The refresh cookie's SameSite policy decides whether login survives a page
 * load in production, where the frontend and API are on different sites. It is
 * fixed at module load from the environment, so each case needs a fresh module
 * graph.
 */
async function registerWith(envOverrides: Record<string, string | undefined>) {
  const original = { ...process.env };
  // NODE_ENV is what these cases vary, and it also drives the log level — so
  // silence has to be asked for explicitly or each case prints a request log.
  Object.assign(process.env, { LOG_LEVEL: "silent" }, envOverrides);
  vi.resetModules();

  try {
    // Resetting the registry gives the app a fresh copy of the db mock too,
    // so the queries have to be programmed on that instance rather than the
    // one this file imported at the top.
    const { prisma } = await import("../mocks/db.js");
    const { createApp } = await import("../../src/app.js");
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(makeUser());
    prisma.refreshToken.create.mockResolvedValue({});

    const res = await request(createApp())
      .post("/api/auth/register")
      .send({ email: "learner@example.com", password: "correct-horse-battery" });

    return res.headers["set-cookie"]![0]!;
  } finally {
    process.env = original;
  }
}

afterEach(() => {
  vi.resetModules();
});

describe("refresh cookie policy", () => {
  it("uses SameSite=None and Secure in production, so a cross-site refresh works", async () => {
    // Vercel frontend → Fly API is cross-site; a Lax cookie would never be
    // sent and the session would silently die on reload.
    const cookie = await registerWith({ NODE_ENV: "production" });

    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
  });

  it("uses SameSite=Lax without Secure in development, so plain-HTTP localhost works", async () => {
    const cookie = await registerWith({ NODE_ENV: "development" });

    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("honours an explicit COOKIE_SAMESITE override for single-domain deployments", async () => {
    const cookie = await registerWith({ NODE_ENV: "production", COOKIE_SAMESITE: "lax" });

    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("always marks the cookie httpOnly and scopes it to the auth routes", async () => {
    const cookie = await registerWith({ NODE_ENV: "production" });

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/auth");
  });
});
