import type { CookieOptions, Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import * as authService from "./auth.service.js";

const REFRESH_COOKIE = "refreshToken";

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).optional(),
});

export async function register(req: Request, res: Response) {
  const { email, password, name } = credentialsSchema.parse(req.body);
  const { refreshToken, ...result } = await authService.register(email, password, name);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const { refreshToken, ...result } = await authService.login(email, password);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  res.json(result);
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] ?? "";
  const { refreshToken, ...result } = await authService.refresh(token);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  res.json(result);
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] ?? "";
  await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await authService.getMe(req.user!.sub);
  res.json({ user });
}

const leetcodeSessionSchema = z.object({
  session: z.string().min(10, "LEETCODE_SESSION looks too short"),
  csrf: z.string().min(10, "csrftoken looks too short"),
});

/** PUT /api/auth/leetcode-session — store the caller's own LeetCode cookies. */
export async function setLeetcodeSession(req: Request, res: Response) {
  const { session, csrf } = leetcodeSessionSchema.parse(req.body ?? {});
  const result = await authService.setLeetcodeSession(req.user!.sub, session, csrf);
  res.json(result);
}

/** DELETE /api/auth/leetcode-session — forget them. */
export async function clearLeetcodeSession(req: Request, res: Response) {
  await authService.clearLeetcodeSession(req.user!.sub);
  res.status(204).end();
}
