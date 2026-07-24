import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as chatController from "./chat.controller.js";

const router = Router();

router.post("/", requireAuth, chatController.ask);
router.get("/history", requireAuth, chatController.history);

export default router;
