import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/**
 * AES-256-GCM for credentials we must store but never expose — currently
 * users' LeetCode session cookies, which are full account credentials.
 *
 * Format: v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>. The version prefix
 * lets the scheme be rotated later without guessing at old rows.
 */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard

function key(): Buffer {
  const raw = Buffer.from(env.ENCRYPTION_KEY, "hex");
  if (raw.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes as 64 hex characters");
  }
  return raw;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

/** Returns null rather than throwing when a value can't be decrypted, so a
 *  rotated key degrades to "no session on file" instead of breaking sync. */
export function decryptSecret(payload: string | null): string | null {
  if (!payload) return null;
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;

  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
