import { Router } from "express";

import { todoController } from "../controllers/todo.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router: Router = Router();

router.get("/", authMiddleware, todoController.getAll);
router.get("/stats", authMiddleware, todoController.getStats);

router.get("/:id", authMiddleware, todoController.getById);

router.post("/", authMiddleware, todoController.create);

router.put("/:id", authMiddleware, todoController.update);
router.patch("/:id", authMiddleware, todoController.update);

router.delete("/:id", authMiddleware, todoController.delete);

export default router;
