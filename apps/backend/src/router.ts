import { Router } from "express";
import authRoutes from "./api/auth/auth.routes.js";
import chatRoutes from "./api/chat/chat.routes.js";
import healthRoutes from "./api/health/health.routes.js";
import problemsRoutes from "./api/problems/problems.routes.js";
import statsRoutes from "./api/stats/stats.routes.js";
import syncRoutes from "./api/sync/sync.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/sync", syncRoutes);
router.use("/chat", chatRoutes);
router.use("/stats", statsRoutes);
router.use("/problems", problemsRoutes);

export default router;
