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
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

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
