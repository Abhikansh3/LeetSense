import { Router } from "express";
import { z } from "zod";
import { prisma, Difficulty, type Prisma } from "@leetsense/db";
import { requireAuth } from "../../middleware/auth.js";

const router = Router();

const querySchema = z.object({
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  tag: z.string().optional(),
  solved: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

/** GET /api/problems — filterable, cursor-paginated problem list. */
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const { difficulty, tag, solved, cursor, limit } = querySchema.parse(req.query);

  const where: Prisma.ProblemWhereInput = {};
  if (difficulty) where.difficulty = difficulty as Difficulty;
  if (tag) where.tags = { has: tag };

  // `Problem` is a global table shared by every user, so it must always be
  // scoped to the caller — otherwise everyone sees the union of all problems
  // ever synced by anyone. Default to "problems I have submissions for";
  // `solved=false` is the one case that deliberately looks outside that set.
  if (solved === "false") where.submissions = { none: { userId } };
  else where.submissions = { some: { userId } };

  const items = await prisma.problem.findMany({
    where,
    take: limit + 1, // fetch one extra to detect next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { titleSlug: "asc" },
    include: { submissions: { where: { userId }, select: { id: true }, take: 1 } },
  });

  const hasNext = items.length > limit;
  const page = hasNext ? items.slice(0, limit) : items;

  res.json({
    items: page.map((p) => ({
      id: p.id,
      titleSlug: p.titleSlug,
      title: p.title,
      difficulty: p.difficulty,
      tags: p.tags,
      solved: p.submissions.length > 0,
    })),
    nextCursor: hasNext ? page[page.length - 1]!.id : null,
  });
});

export default router;
