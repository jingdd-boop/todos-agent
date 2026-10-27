import { AppError } from "../errors/app-error";
import { todoService } from "../services/todo.service";
import type { AuthUser } from "../types/auth";
import type { Todo } from "../types/todo";
import type { AgentToolResult } from "./types";

export async function listTodosTool(
  user: AuthUser,
  input: { completed?: boolean },
): Promise<AgentToolResult> {
  const result = await todoService.getAll(
    {
      page: 1,
      pageSize: 100,
      ...(input.completed === undefined ? {} : { completed: input.completed }),
      sort: "id",
      order: "desc",
    },
    user,
  );

  return { tool: "list_todos", todos: result.data as Todo[], total: result.pagination.total };
}

export async function createTodoTool(
  user: AuthUser,
  input: { title?: unknown },
): Promise<AgentToolResult> {
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    throw new AppError("title is required", 400, "VALIDATION_FAILED");
  }

  const todo = await todoService.create({ title: input.title.trim(), userId: user.id });
  return { tool: "create_todo", todo };
}
