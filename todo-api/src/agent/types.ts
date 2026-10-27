import type { Todo } from "../types/todo";

export type AgentToolName = "list_todos" | "create_todo" | "delete_todo";

export type AgentToolResult =
  | { tool: "list_todos"; todos: Todo[]; total: number }
  | { tool: "create_todo"; todo: Todo }
  | { tool: "delete_todo"; todoId: number; confirmationId: string };
