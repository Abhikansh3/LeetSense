import pino from "pino";
import { env } from "../config/env.js";

function level(): pino.Level | "silent" {
  // Tests assert on responses, not on log output; leaving this at debug buries
  // failures under a request log for every supertest call.
  if (env.NODE_ENV === "test") return "silent";
  return env.NODE_ENV === "production" ? "info" : "debug";
}

export const logger = pino({
  level: level(),
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});
