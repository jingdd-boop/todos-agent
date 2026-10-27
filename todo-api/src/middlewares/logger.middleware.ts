import { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

export function loggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.header("x-request-id");
  const requestId =
    incomingId && /^[a-zA-Z0-9._-]{1,100}$/.test(incomingId) ? incomingId : `req_${randomUUID()}`;
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.log(
      JSON.stringify({
        level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
        event: "http.request.completed",
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ...(req.user ? { userId: req.user.id, role: req.user.role } : {}),
      }),
    );
  });

  next();
}
