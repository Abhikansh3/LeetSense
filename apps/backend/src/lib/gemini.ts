import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";

export const isGeminiConfigured = Boolean(env.GEMINI_API_KEY);

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || "missing-key");

function assertConfigured() {
  if (!isGeminiConfigured) {
    throw new Error("GEMINI_API_KEY is not set — AI features are disabled");
  }
}

/** Embeds a single string into a dense vector (text-embedding-004 → 768 dims). */
export async function embedText(text: string): Promise<number[]> {
  assertConfigured();
  const model = genAI.getGenerativeModel({ model: env.GEMINI_EMBED_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/** Embeds many strings (bounded concurrency to stay under rate limits). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  assertConfigured();
  const out: number[][] = [];
  const concurrency = 5;
  for (let i = 0; i < texts.length; i += concurrency) {
    const slice = texts.slice(i, i + concurrency);
    const embedded = await Promise.all(slice.map((t) => embedText(t)));
    out.push(...embedded);
  }
  return out;
}

/** Generates a grounded answer given a system instruction + user prompt. */
export async function generateAnswer(systemInstruction: string, prompt: string): Promise<string> {
  assertConfigured();
  const model = genAI.getGenerativeModel({
    model: env.GEMINI_CHAT_MODEL,
    systemInstruction,
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
