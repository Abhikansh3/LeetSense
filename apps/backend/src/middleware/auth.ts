import type { NextFunction, Request, Response } from "express";
import { Unauthorized } from "../lib/errors.js";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt.js";

// Augment Express's Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/** Requires a valid Bearer access token; attaches `req.user`. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw Unauthorized("Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    throw Unauthorized("Invalid or expired access token");
  }
}
