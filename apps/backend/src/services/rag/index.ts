import { prisma } from "@leetsense/db";
import { generateAnswer, isGeminiConfigured } from "../../lib/gemini.js";
import { logger } from "../../lib/logger.js";
import { buildUserChunks } from "./chunker.js";
import { queryChunks, upsertChunks } from "./vectorstore.js";

/** Rebuilds and stores a user's context chunks. Called at the end of a sync. */
export async function indexUserData(userId: string): Promise<number> {
  if (!isGeminiConfigured) {
    logger.warn("Skipping RAG index — GEMINI_API_KEY not set");
    return 0;
  }
  const chunks = await buildUserChunks(userId);
  await upsertChunks(userId, chunks);
  logger.info({ userId, chunks: chunks.length }, "Indexed user data for RAG");
  return chunks.length;
}

const SYSTEM_PROMPT = `You are LeetSense, a coding-interview mentor. You answer questions
about a specific user's LeetCode practice using ONLY the context provided.
Be concrete and encouraging. If the context doesn't contain the answer, say you
don't have enough synced data yet and suggest running a sync. Keep answers tight
(a few sentences) unless asked for detail.`;

export interface ChatResult {
  answer: string;
  sources: string[];
}

/** Answers a question grounded in the user's retrieved context, and persists it. */
export async function answerQuestion(userId: string, question: string): Promise<ChatResult> {
  if (!isGeminiConfigured) {
    return {
      answer: "AI chat is disabled because no Gemini API key is configured on the server.",
      sources: [],
    };
  }

  const context = await queryChunks(userId, question, 6);

  const prompt =
    context.length > 0
      ? `Context about the user's LeetCode practice:\n\n${context
          .map((c, i) => `[${i + 1}] ${c}`)
          .join("\n")}\n\nQuestion: ${question}`
      : `No synced data is available for this user yet.\n\nQuestion: ${question}`;

  const answer = await generateAnswer(SYSTEM_PROMPT, prompt);

  // Persist both turns of the conversation.
  await prisma.chatMessage.createMany({
    data: [
      { userId, role: "user", content: question },
      { userId, role: "assistant", content: answer },
    ],
  });

  return { answer, sources: context };
}
