import type { Request, Response } from "express";
import { authService } from "../services/auth.service";
import { loginSchema, registerSchema } from "../schemas/auth.schema";
import { AppError } from "../errors/app-error";
import type { ZodType } from "zod";
import type { AuthRequest } from "../middlewares/auth.middleware";

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("Validation failed", 400, "VALIDATION_FAILED");
  return result.data;
}

export const authController = {
  async register(req: Request, res: Response) {
    res.status(201).json(await authService.register(parse(registerSchema, req.body)));
  },
  async login(req: Request, res: Response) {
    res.json(await authService.login(parse(loginSchema, req.body)));
  },
  async createAdmin(req: AuthRequest, res: Response) {
    res.status(201).json(await authService.createAdmin(parse(registerSchema, req.body)));
  },
};
