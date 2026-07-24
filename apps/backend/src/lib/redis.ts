import { Redis } from "ioredis";
import { env } from "../config/env.js";

// BullMQ requires `maxRetriesPerRequest: null` on its connections.
const options = { maxRetriesPerRequest: null as null };

/** Shared connection for publishing + queue producers. */
export const redis = new Redis(env.REDIS_URL, options);

/** A fresh connection — needed for blocking ops like SSE subscribers and workers. */
export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, options);
}
