import { Router, type Router as RouterType } from "express";
import { conversationController } from "../controllers/conversation.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router: RouterType = Router();
router.use(authMiddleware);
router.post("/", conversationController.create);
router.get("/", conversationController.list);
router.get("/:id", conversationController.get);
router.delete("/:id", conversationController.remove);
export default router;
