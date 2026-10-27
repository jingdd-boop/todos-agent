import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authMiddleware, requireRole } from "../middlewares/auth.middleware";

const router: Router = Router();
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/admin/users", authMiddleware, requireRole("ADMIN"), authController.createAdmin);
export default router;
