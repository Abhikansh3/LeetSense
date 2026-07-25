import bcrypt from "bcryptjs";
import { prisma } from "@leetsense/db";
import { BadRequest, Conflict, Unauthorized } from "../../lib/errors.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt.js";
import { encryptSecret } from "../../lib/crypto.js";
import { fetchSessionUsername } from "../../fetchers/leetcode.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function issueTokens(user: { id: string; email: string }) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id });
  return { accessToken, refreshToken };
}

async function persistRefreshToken(userId: string, token: string) {
  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
}

export async function register(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Conflict("An account with that email already exists");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  const tokens = issueTokens(user);
  await persistRefreshToken(user.id, tokens.refreshToken);
  return { user: publicUser(user), ...tokens };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Unauthorized("Invalid credentials");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw Unauthorized("Invalid credentials");

  const tokens = issueTokens(user);
  await persistRefreshToken(user.id, tokens.refreshToken);
  return { user: publicUser(user), ...tokens };
}

/** Verifies + rotates a refresh token, returning a fresh token pair. */
export async function refresh(oldToken: string) {
  if (!oldToken) throw Unauthorized("Missing refresh token");

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(oldToken);
  } catch {
    throw Unauthorized("Invalid refresh token");
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: oldToken } });
  if (!stored || stored.expiresAt < new Date()) {
    throw Unauthorized("Refresh token expired or revoked");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw Unauthorized("User no longer exists");

  // Rotate: delete the old token, issue a new pair.
  await prisma.refreshToken.delete({ where: { token: oldToken } });
  const tokens = issueTokens(user);
  await persistRefreshToken(user.id, tokens.refreshToken);
  return { user: publicUser(user), ...tokens };
}

export async function logout(token: string) {
  if (!token) return;
  await prisma.refreshToken.deleteMany({ where: { token } });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw BadRequest("User not found");
  // Only whether a session is on file — never the credential itself.
  return { ...publicUser(user), hasLeetcodeSession: Boolean(user.leetcodeSessionEnc && user.leetcodeCsrfEnc) };
}

/**
 * Stores a user's own LeetCode cookies so their sync can read their full
 * submission history. Verifies the cookies against LeetCode first and rejects
 * them unless they belong to the handle the account is linked to — otherwise a
 * user could paste someone else's cookie and ingest their history.
 */
export async function setLeetcodeSession(userId: string, session: string, csrf: string) {
  const owner = await fetchSessionUsername({ session, csrf });
  if (!owner) {
    throw BadRequest("Those LeetCode cookies were rejected — they may be expired. Copy them again while signed in.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { leetcodeUsername: true } });
  if (user?.leetcodeUsername && user.leetcodeUsername.toLowerCase() !== owner.toLowerCase()) {
    throw BadRequest(
      `Those cookies belong to @${owner}, but this account is linked to @${user.leetcodeUsername}. Sync @${owner} first, or use your own cookies.`,
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      leetcodeSessionEnc: encryptSecret(session),
      leetcodeCsrfEnc: encryptSecret(csrf),
      // Adopt the verified handle so the two can never drift apart.
      leetcodeUsername: owner,
    },
  });

  return { username: owner };
}

export async function clearLeetcodeSession(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { leetcodeSessionEnc: null, leetcodeCsrfEnc: null },
  });
}

function publicUser(user: {
  id: string;
  email: string;
  name: string | null;
  leetcodeUsername: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    leetcodeUsername: user.leetcodeUsername,
  };
}
