import { Request, Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";

import { todoService } from "../services/todo.service";
import { createTodoSchema, updateTodoSchema } from "../schemas/todo.schema";
import { AppError } from "../errors/app-error";

export const todoController = {
  /**
   * GET /api/todos
   */
  async getAll(req: AuthRequest, res: Response) {
    const page = Number(req.query.page ?? 1);

    const pageSize = Number(req.query.pageSize ?? 10);

    if (!Number.isInteger(page) || page < 1) {
      throw new AppError("page must be a positive integer", 400, "INVALID_PAGINATION");
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new AppError("pageSize must be between 1 and 100", 400, "INVALID_PAGINATION");
    }

    const allowedSort = ["id", "createdAt", "title", "completed"] as const;
    const sortValue = String(req.query.sort ?? "id");
    const orderValue = String(req.query.order ?? "desc");
    if (
      !(allowedSort as readonly string[]).includes(sortValue) ||
      !["asc", "desc"].includes(orderValue)
    )
      throw new AppError("Invalid sort or order", 400, "INVALID_SORT");

    let completed: boolean | undefined;

    if (req.query.completed === "true") {
      completed = true;
    }

    if (req.query.completed === "false") {
      completed = false;
    }

    const result = await todoService.getAll(
      {
        page,
        pageSize,
        ...(completed === undefined ? {} : { completed }),
        sort: sortValue as (typeof allowedSort)[number],
        order: orderValue as "asc" | "desc",
      },
      req.user!,
    );

    res.json({ success: true, data: result.data, meta: result.pagination });
  },

  async getStats(req: AuthRequest, res: Response) {
    const stats = await todoService.getStats(req.user!);
    res.json({ success: true, data: stats });
  },

  /**
   * GET /api/todos/:id
   */
  async getById(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid todo id", 400, "INVALID_TODO_ID");
    }

    const todo = await todoService.getById(id, req.user!);

    if (!todo) {
      throw new AppError("Todo not found", 404, "TODO_NOT_FOUND");
    }

    res.json({ success: true, data: todo });
  },

  /**
   * POST /api/todos
   */
  async create(req: AuthRequest, res: Response) {
    const result = createTodoSchema.safeParse(req.body);

    if (!result.success) {
      throw new AppError("Validation failed", 400, "VALIDATION_FAILED");
    }

    const todo = await todoService.create({
      ...result.data,
      userId: req.user!.id,
    });

    res.status(201).json({ success: true, data: todo });
  },

  /**
   * PUT /api/todos/:id
   */
  async update(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid todo id", 400, "INVALID_TODO_ID");
    }

    const result = updateTodoSchema.safeParse(req.body);

    if (!result.success) {
      throw new AppError("Validation failed", 400, "VALIDATION_FAILED");
    }

    const todo = await todoService.update(id, result.data, req.user!);

    if (!todo) {
      throw new AppError("Todo not found", 404, "TODO_NOT_FOUND");
    }

    res.json({ success: true, data: todo });
  },

  /**
   * DELETE /api/todos/:id
   */
  async delete(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid todo id", 400, "INVALID_TODO_ID");
    }

    const deleted = await todoService.delete(id, req.user!);

    if (!deleted) {
      throw new AppError("Todo not found", 404, "TODO_NOT_FOUND");
    }

    res.status(204).send();
  },
};
