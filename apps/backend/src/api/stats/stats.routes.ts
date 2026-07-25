import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import * as stats from "./stats.service.js";

const router = Router();

router.use(requireAuth);

const activityQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(25),
});

router.get("/overview", async (req, res) => {
  res.json(await stats.getOverview(req.user!.sub));
});

router.get("/profile", async (req, res) => {
  res.json(await stats.getProfileStats(req.user!.sub));
});

router.get("/heatmap", async (req, res) => {
  res.json({ days: await stats.getHeatmap(req.user!.sub) });
});

router.get("/snapshots", async (req, res) => {
  res.json({ snapshots: await stats.getSnapshots(req.user!.sub) });
});

router.get("/radar", async (req, res) => {
  res.json({ topics: await stats.getTopicRadar(req.user!.sub) });
});

router.get("/activity", async (req, res) => {
  const { cursor, limit } = activityQuery.parse(req.query);
  res.json(await stats.getActivity(req.user!.sub, cursor, limit));
});

export default router;
