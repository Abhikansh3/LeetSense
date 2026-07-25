import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as authController from "./auth.controller.js";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);
router.put("/leetcode-session", requireAuth, authController.setLeetcodeSession);
router.delete("/leetcode-session", requireAuth, authController.clearLeetcodeSession);

export default router;
