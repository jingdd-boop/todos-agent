import { Request, Response, NextFunction } from "express";

import { AppError } from "../errors/app-error";
import { Prisma } from "../generated/client";

export function errorMiddleware(err: unknown, req: Request, res: Response, next: NextFunction) {
  const requestId = req.requestId;
  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "Internal Server Error";

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      statusCode = 409;
      code = "USER_ALREADY_EXISTS";
      message = "User already exists";
    } else if (err.code === "P2025") {
      statusCode = 404;
      code = "TODO_NOT_FOUND";
      message = "Todo not found";
    } else {
      code = "DATABASE_ERROR";
      message = "Database operation failed";
    }
  }

  if (statusCode >= 500)
    console.error(JSON.stringify({ event: "http.request.failed", requestId, error: err }));

  return res.status(statusCode).json({
    success: false,
    error: { code, message, ...(requestId ? { requestId } : {}) },
  });
}
