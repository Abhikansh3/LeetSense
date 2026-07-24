import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as stats from "./stats.service.js";

const router = Router();

router.use(requireAuth);

router.get("/overview", async (req, res) => {
  res.json(await stats.getOverview(req.user!.sub));
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

export default router;
