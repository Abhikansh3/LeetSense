import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app, authHeader } from "../helpers/app.js";
import { prisma } from "../mocks/db.js";
import { fetchSessionUsername } from "../mocks/leetcode.js";
import { makeUser } from "../fixtures.js";
import { encryptSecret } from "../../src/lib/crypto.js";
import { signRefreshToken } from "../../src/lib/jwt.js";

const PASSWORD = "correct-horse-battery";

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(makeUser());
    prisma.refreshToken.create.mockResolvedValue({});
  });

  it("creates the account and returns an access token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "learner@example.com", password: PASSWORD, name: "Learner" });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: "user-1",
      email: "learner@example.com",
      name: "Learner",
      leetcodeUsername: "learner",
    });
  });

  it("stores a bcrypt hash, never the password", async () => {
    await request(app).post("/api/auth/register").send({ email: "learner@example.com", password: PASSWORD });

    const { passwordHash } = prisma.user.create.mock.calls[0]![0].data;
    expect(passwordHash).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, passwordHash)).toBe(true);
  });

  it("returns the refresh token as an httpOnly cookie, not in the body", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "learner@example.com", password: PASSWORD });

    expect(res.body.refreshToken).toBeUndefined();
    const cookie = res.headers["set-cookie"]![0]!;
    expect(cookie).toMatch(/^refreshToken=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/auth");
  });

  it("rejects a duplicate email with 409", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "learner@example.com", password: PASSWORD });

    expect(res.status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a short password with a field-level validation error", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "learner@example.com", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.details.password).toContain("Password must be at least 8 characters");
  });

  it("rejects a malformed email", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "nope", password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.details.email).toBeDefined();
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    prisma.refreshToken.create.mockResolvedValue({});
  });

  it("issues tokens for correct credentials", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: await bcrypt.hash(PASSWORD, 4) }));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "learner@example.com", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it("rejects a wrong password", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: await bcrypt.hash(PASSWORD, 4) }));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "learner@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
  });

  it("gives the same answer for an unknown email as for a wrong password", async () => {
    // Distinguishing the two would turn login into an account-enumeration
    // oracle.
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("never returns the password hash", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: await bcrypt.hash(PASSWORD, 4) }));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "learner@example.com", password: PASSWORD });

    expect(JSON.stringify(res.body)).not.toContain("$2a$");
  });
});

describe("POST /api/auth/refresh", () => {
  const token = signRefreshToken({ sub: "user-1" });

  beforeEach(() => {
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.refreshToken.delete.mockResolvedValue({});
  });

  it("rotates the token: the old one is deleted and a new one stored", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      token,
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const res = await request(app).post("/api/auth/refresh").set("Cookie", [`refreshToken=${token}`]);

    expect(res.status).toBe(200);
    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { token } });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(prisma.refreshToken.create.mock.calls[0]![0].data.token).not.toBe(token);
  });

  it("rejects a token that is no longer on file", async () => {
    // Rotation means a replayed token has already been deleted — this is what
    // makes reuse of a stolen refresh token fail.
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    const res = await request(app).post("/api/auth/refresh").set("Cookie", [`refreshToken=${token}`]);

    expect(res.status).toBe(401);
  });

  it("rejects an expired stored token", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      token,
      userId: "user-1",
      expiresAt: new Date(Date.now() - 60_000),
    });

    expect((await request(app).post("/api/auth/refresh").set("Cookie", [`refreshToken=${token}`])).status).toBe(
      401,
    );
  });

  it("rejects a signature it did not issue", async () => {
    const res = await request(app).post("/api/auth/refresh").set("Cookie", ["refreshToken=forged.token.value"]);

    expect(res.status).toBe(401);
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a request with no cookie at all", async () => {
    expect((await request(app).post("/api/auth/refresh")).status).toBe(401);
  });

  it("rejects a valid token whose user has since been deleted", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      token,
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue(null);

    expect((await request(app).post("/api/auth/refresh").set("Cookie", [`refreshToken=${token}`])).status).toBe(
      401,
    );
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the stored token and clears the cookie", async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app).post("/api/auth/logout").set("Cookie", ["refreshToken=some-token"]);

    expect(res.status).toBe(204);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { token: "some-token" } });
    expect(res.headers["set-cookie"]![0]!).toMatch(/^refreshToken=;/);
  });

  it("succeeds even with no session, so logout is idempotent", async () => {
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
  });
});

describe("GET /api/auth/me", () => {
  it("requires a bearer token", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authorization header/);
  });

  it("rejects a malformed Authorization header", async () => {
    expect((await request(app).get("/api/auth/me").set("Authorization", "token abc")).status).toBe(401);
  });

  it("rejects a forged token", async () => {
    expect((await request(app).get("/api/auth/me").set("Authorization", "Bearer a.b.c")).status).toBe(401);
  });

  it("reports a stored LeetCode session as a boolean and nothing more", async () => {
    // The cookie is a full LeetCode account credential; no endpoint may ever
    // return it, so /me exposes only its presence.
    prisma.user.findUnique.mockResolvedValue(
      makeUser({
        leetcodeSessionEnc: encryptSecret("super-secret-session-cookie"),
        leetcodeCsrfEnc: encryptSecret("super-secret-csrf-token"),
      }),
    );

    const res = await request(app).get("/api/auth/me").set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.user.hasLeetcodeSession).toBe(true);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("super-secret-session-cookie");
    expect(body).not.toContain("leetcodeSessionEnc");
    expect(body).not.toContain("passwordHash");
  });

  it("reports false when only one half of the pair is on file", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ leetcodeSessionEnc: encryptSecret("x"), leetcodeCsrfEnc: null }));

    const res = await request(app).get("/api/auth/me").set("Authorization", authHeader());

    expect(res.body.user.hasLeetcodeSession).toBe(false);
  });
});

describe("PUT /api/auth/leetcode-session", () => {
  const cookies = { session: "a-long-enough-session-cookie", csrf: "a-long-enough-csrf-token" };

  it("stores the cookies encrypted, never in plaintext", async () => {
    fetchSessionUsername.mockResolvedValue("learner");
    prisma.user.findUnique.mockResolvedValue({ leetcodeUsername: "learner" });
    prisma.user.update.mockResolvedValue(makeUser());

    const res = await request(app)
      .put("/api/auth/leetcode-session")
      .set("Authorization", authHeader())
      .send(cookies);

    expect(res.status).toBe(200);
    const stored = prisma.user.update.mock.calls[0]![0].data;
    expect(stored.leetcodeSessionEnc).toMatch(/^v1\./);
    expect(stored.leetcodeSessionEnc).not.toContain(cookies.session);
    expect(stored.leetcodeCsrfEnc).not.toContain(cookies.csrf);
  });

  it("refuses cookies belonging to a different LeetCode account", async () => {
    // Otherwise a user could paste someone else's cookie and ingest their
    // history into their own dashboard.
    fetchSessionUsername.mockResolvedValue("someone-else");
    prisma.user.findUnique.mockResolvedValue({ leetcodeUsername: "learner" });

    const res = await request(app)
      .put("/api/auth/leetcode-session")
      .set("Authorization", authHeader())
      .send(cookies);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("someone-else");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses cookies LeetCode does not recognise", async () => {
    fetchSessionUsername.mockResolvedValue(null);

    const res = await request(app)
      .put("/api/auth/leetcode-session")
      .set("Authorization", authHeader())
      .send(cookies);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("adopts the verified handle for an account with none linked yet", async () => {
    fetchSessionUsername.mockResolvedValue("learner");
    prisma.user.findUnique.mockResolvedValue({ leetcodeUsername: null });
    prisma.user.update.mockResolvedValue(makeUser());

    const res = await request(app)
      .put("/api/auth/leetcode-session")
      .set("Authorization", authHeader())
      .send(cookies);

    expect(res.body).toEqual({ username: "learner" });
    expect(prisma.user.update.mock.calls[0]![0].data.leetcodeUsername).toBe("learner");
  });

  it("requires authentication", async () => {
    expect((await request(app).put("/api/auth/leetcode-session").send(cookies)).status).toBe(401);
  });

  it("rejects an obviously truncated cookie before calling LeetCode", async () => {
    const res = await request(app)
      .put("/api/auth/leetcode-session")
      .set("Authorization", authHeader())
      .send({ session: "short", csrf: "short" });

    expect(res.status).toBe(400);
    expect(fetchSessionUsername).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/auth/leetcode-session", () => {
  it("clears both halves of the credential", async () => {
    prisma.user.update.mockResolvedValue(makeUser());

    const res = await request(app).delete("/api/auth/leetcode-session").set("Authorization", authHeader());

    expect(res.status).toBe(204);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { leetcodeSessionEnc: null, leetcodeCsrfEnc: null },
    });
  });
});
