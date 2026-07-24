import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as syncController from "./sync.controller.js";

const router = Router();

router.post("/", requireAuth, syncController.trigger);
router.get("/status", requireAuth, syncController.status);
// Auth handled inside via ?token= because EventSource can't set headers.
router.get("/stream", syncController.stream);

export default router;
