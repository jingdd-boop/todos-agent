import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "../errors/http-errors";
import { verifyToken } from "../utils/jwt";
import type { AuthUser } from "../types/auth";
import { userRepository } from "../repositories/user.repository";

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export async function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return next(new UnauthorizedError());
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return next(new UnauthorizedError());
  try {
    const tokenUser = verifyToken(token);
    const user = await userRepository.findById(tokenUser.id);
    if (!user) return next(new UnauthorizedError("User no longer exists"));
    req.user = { id: user.id, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}
