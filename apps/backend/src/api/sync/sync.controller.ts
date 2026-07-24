import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@leetsense/db";
import { BadRequest, Unauthorized } from "../../lib/errors.js";
import { verifyAccessToken } from "../../lib/jwt.js";
import { createRedis } from "../../lib/redis.js";
import { createSyncJob, progressChannel } from "../../services/sync.service.js";
import { enqueueSync } from "../../queue/sync.queue.js";

const triggerSchema = z.object({
  leetcodeUsername: z.string().min(1).optional(),
});

/** POST /api/sync — optionally links a LeetCode username, then queues a sync. */
export async function trigger(req: Request, res: Response) {
  const userId = req.user!.sub;
  const { leetcodeUsername } = triggerSchema.parse(req.body ?? {});

  if (leetcodeUsername) {
    await prisma.user.update({ where: { id: userId }, data: { leetcodeUsername } });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.leetcodeUsername) {
    throw BadRequest("Link a LeetCode username first (pass leetcodeUsername)");
  }

  const job = await createSyncJob(userId);
  await enqueueSync({ userId, jobId: job.id });
  res.status(202).json({ jobId: job.id, status: job.status });
}

/** GET /api/sync/status — latest sync job for the user. */
export async function status(req: Request, res: Response) {
  const userId = req.user!.sub;
  const job = await prisma.syncJob.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
  });
  res.json({ job });
}

/**
 * GET /api/sync/stream?token=... — Server-Sent Events stream of progress.
 * EventSource cannot set headers, so the access token comes via query param.
 */
export async function stream(req: Request, res: Response) {
  const token = String(req.query.token ?? "");
  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    throw Unauthorized("Invalid or missing token");
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const channel = progressChannel(userId);
  const sub = createRedis();
  await sub.subscribe(channel);

  sub.on("message", (_ch, message) => {
    res.write(`data: ${message}\n\n`);
  });

  // Keep the connection alive through proxies.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    void sub.unsubscribe(channel).then(() => sub.quit());
    res.end();
  });
}
