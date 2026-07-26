import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "../../src/lib/crypto.js";

const COOKIE = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.fake-leetcode-session-cookie.value";

describe("crypto", () => {
  it("round-trips a session cookie", () => {
    expect(decryptSecret(encryptSecret(COOKIE))).toBe(COOKIE);
  });

  it("emits a versioned four-part envelope", () => {
    const parts = encryptSecret(COOKIE).split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("never repeats a ciphertext for the same plaintext", () => {
    // A fresh IV per call — otherwise identical cookies would be visibly
    // identical at rest.
    expect(encryptSecret(COOKIE)).not.toBe(encryptSecret(COOKIE));
  });

  it("does not leak the plaintext into the stored value", () => {
    expect(encryptSecret(COOKIE)).not.toContain("fake-leetcode-session-cookie");
  });

  it("rejects a tampered ciphertext instead of returning garbage", () => {
    const [version, iv, tag, data] = encryptSecret(COOKIE).split(".");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 0xff;

    expect(decryptSecret([version, iv, tag, flipped.toString("base64")].join("."))).toBeNull();
  });

  it("rejects a forged auth tag", () => {
    const [version, iv, , data] = encryptSecret(COOKIE).split(".");
    const forgedTag = Buffer.alloc(16, 1).toString("base64");

    expect(decryptSecret([version, iv, forgedTag, data].join("."))).toBeNull();
  });

  it("returns null for absent, malformed, or unknown-version payloads", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret("")).toBeNull();
    expect(decryptSecret("not-an-envelope")).toBeNull();
    expect(decryptSecret("v2.a.b.c")).toBeNull();
  });
});
