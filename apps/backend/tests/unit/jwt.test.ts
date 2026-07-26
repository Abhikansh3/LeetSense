import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../src/lib/jwt.js";

describe("jwt", () => {
  it("round-trips an access token's claims", () => {
    const token = signAccessToken({ sub: "user-1", email: "learner@example.com" });
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("learner@example.com");
  });

  it("round-trips a refresh token's subject", () => {
    expect(verifyRefreshToken(signRefreshToken({ sub: "user-1" })).sub).toBe("user-1");
  });

  it("rejects a token signed with the wrong secret", () => {
    const forged = jwt.sign({ sub: "user-1", email: "attacker@example.com" }, "some-other-secret");
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ sub: "user-1", email: "learner@example.com" });
    const [header, , signature] = token.split(".");
    const swappedClaims = Buffer.from(JSON.stringify({ sub: "user-2", email: "x@y.z" })).toString(
      "base64url",
    );

    expect(() => verifyAccessToken(`${header}.${swappedClaims}.${signature}`)).toThrow();
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign({ sub: "user-1", email: "learner@example.com" }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "-1s",
    });
    expect(() => verifyAccessToken(expired)).toThrow(/expired/i);
  });

  it("will not accept a refresh token where an access token is required", () => {
    // The two secrets are distinct precisely so a long-lived refresh token
    // cannot be replayed as an access token.
    const refresh = signRefreshToken({ sub: "user-1" });
    expect(() => verifyAccessToken(refresh)).toThrow();
  });
});
