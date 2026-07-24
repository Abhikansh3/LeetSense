import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/** Catches thrown errors and returns a consistent JSON error shape. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten().fieldErrors });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}

/** 404 fallthrough for unknown routes. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}
