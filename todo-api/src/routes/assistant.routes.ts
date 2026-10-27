import { Router, type Router as RouterType } from "express";
import { assistantController } from "../controllers/assistant.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { assistantStream } from "../controllers/assistant-stream.controller";

const router: RouterType = Router();
router.post("/chat", authMiddleware, assistantController.chat);
router.post("/chat/stream", authMiddleware, assistantStream);
router.post("/confirm", authMiddleware, assistantController.confirm);

export default router;
