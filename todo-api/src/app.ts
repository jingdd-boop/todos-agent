import "dotenv/config";
import express, { type Express } from "express";
import todoRoutes from "./routes/todo.routes";
import { loggerMiddleware } from "./middlewares/logger.middleware";
import { errorMiddleware } from "./middlewares/error.middleware";
import authRoutes from "./routes/auth.routes";
import assistantRoutes from "./routes/assistant.routes";
import conversationRoutes from "./routes/conversation.routes";

const app: Express = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "todo-api" });
});

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", corsOrigin);
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// 解析 JSON
app.use(express.json());
app.use(loggerMiddleware);
app.use("/api/auth", authRoutes);

// Todo API
app.use("/api/todos", todoRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/conversations", conversationRoutes);

// 路由不存在
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// Error Middleware 必须放在后面
app.use(errorMiddleware); // 一定放在路由之后。

export default app;
