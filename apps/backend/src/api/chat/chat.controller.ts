import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@leetsense/db";
import { answerQuestion } from "../../services/rag/index.js";

const askSchema = z.object({
  question: z.string().min(1).max(1000),
});

/** POST /api/chat — ask a grounded question about your practice. */
export async function ask(req: Request, res: Response) {
  const userId = req.user!.sub;
  const { question } = askSchema.parse(req.body);
  const result = await answerQuestion(userId, question);
  res.json(result);
}

/** GET /api/chat/history — recent conversation, oldest first. */
export async function history(req: Request, res: Response) {
  const userId = req.user!.sub;
  const messages = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  res.json({ messages });
}
