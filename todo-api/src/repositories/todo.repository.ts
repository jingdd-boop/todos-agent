import { prisma } from "../lib/prisma";
import { CreateTodoDTO, TodoQuery, UpdateTodoDTO } from "../types/todo";

export const todoRepository = {
  async findAll(query: TodoQuery) {
    const { page, pageSize, completed, sort = "id", order = "desc" } = query;

    const where = {
      ...(completed === undefined ? {} : { completed }),
      ...(query.userId === undefined ? {} : { userId: query.userId }),
    };

    return prisma.todo.findMany({
      where,

      orderBy: { [sort]: order },

      skip: (page - 1) * pageSize,

      take: pageSize,
    });
  },

  async count(completed?: boolean, userId?: number) {
    const where = {
      ...(completed === undefined ? {} : { completed }),
      ...(userId === undefined ? {} : { userId }),
    };

    return prisma.todo.count({
      where,
    });
  },

  async findById(id: number, userId?: number) {
    return prisma.todo.findUnique({
      where: userId === undefined ? { id } : { id, userId },
    });
  },

  async create(data: CreateTodoDTO) {
    return prisma.todo.create({
      data: {
        title: data.title,
        userId: data.userId,
      },
    });
  },

  async update(id: number, data: UpdateTodoDTO, userId?: number) {
    const result = await prisma.todo.updateMany({
      where: {
        id,
        ...(userId === undefined ? {} : { userId }),
        version: data.version,
      },
      data: {
        ...(data.title === undefined ? {} : { title: data.title }),
        ...(data.completed === undefined ? {} : { completed: data.completed }),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return prisma.todo.findUnique({ where: { id } });
  },

  async stats(userId?: number) {
    const where = userId === undefined ? {} : { userId };
    const [total, completed] = await Promise.all([
      prisma.todo.count({ where }),
      prisma.todo.count({ where: { ...where, completed: true } }),
    ]);
    return { total, completed, pending: total - completed };
  },

  async delete(id: number, userId?: number) {
    return prisma.todo.delete({
      where: userId === undefined ? { id } : { id, userId },
    });
  },
};
