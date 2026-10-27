import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { AppError } from "../errors/app-error";

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is not configured");
  return value;
}

export function signToken(user: { id: number; role: Role }): string {
  return jwt.sign({ sub: user.id, role: user.role }, secret(), {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "1h") as jwt.SignOptions["expiresIn"],
  } as jwt.SignOptions);
}

export function verifyToken(token: string): { id: number; role: Role } {
  try {
    const payload = jwt.verify(token, secret()) as JwtPayload;
    const id = Number(payload.sub);
    const role = payload.role;
    if (!Number.isInteger(id) || id <= 0 || (role !== "USER" && role !== "ADMIN")) {
      throw new Error("Invalid payload");
    }
    return { id, role };
  } catch {
    throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
  }
}
