import { z } from "zod";

export const todoSchema = z.object({
  id: z.number(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
});

export const todosSchema = z.array(todoSchema);

export const createTodoSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "title cannot be empty")
    .max(100, "title must be less than 100 characters"),
});

export const updateTodoSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),

  completed: z.boolean().optional(),
  version: z.number().int().nonnegative(),
});
