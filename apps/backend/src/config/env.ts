import { z } from "zod";

/**
 * Validates and types all environment variables at boot. If anything required
 * is missing or malformed, the process exits with a clear message instead of
 * failing mysteriously at runtime.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default("http://localhost:3001"),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  // 32 bytes of hex — encrypts users' stored LeetCode session cookies.
  // Generate with: openssl rand -hex 32
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Run the BullMQ sync worker inside the API process. Defaults to on in
  // development (so `pnpm dev` alone can complete a sync) and off elsewhere,
  // where the worker runs as its own process.
  WORKER_IN_PROCESS: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),

  GEMINI_API_KEY: z.string().default(""),
  GEMINI_CHAT_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),

  CHROMA_URL: z.string().default("http://localhost:8000"),
  CHROMA_API_KEY: z.string().default(""),
  CHROMA_TENANT: z.string().default(""),
  CHROMA_DATABASE: z.string().default(""),

  LEETCODE_SESSION: z.string().default(""),
  LEETCODE_CSRF: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
