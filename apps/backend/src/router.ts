import { Router } from "express";
import authRoutes from "./api/auth/auth.routes.js";
import healthRoutes from "./api/health/health.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);

export default router;
