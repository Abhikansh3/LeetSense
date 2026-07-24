import bcrypt from "bcryptjs";
import { prisma } from "@leetsense/db";
import { BadRequest, Conflict, Unauthorized } from "../../lib/errors.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt.js";

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
  return publicUser(user);
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
