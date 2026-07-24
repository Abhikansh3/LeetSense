import { Router } from "express";
import { prisma } from "@leetsense/db";

const router = Router();

/** Liveness: is the process up? */
router.get("/", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/** Readiness: can we reach the database? */
router.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", db: "up" });
  } catch {
    res.status(503).json({ status: "not-ready", db: "down" });
  }
});

export default router;
