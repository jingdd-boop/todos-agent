import { todoRepository } from "../repositories/todo.repository";
import { CreateTodoDTO, TodoQuery, UpdateTodoDTO } from "../types/todo";
import type { AuthUser } from "../types/auth";
import { memoryCache } from "../cache/memory-cache";

const CACHE_TTL = 30_000;
function cacheKey(query: TodoQuery, user: AuthUser) {
  const scope = user.role === "ADMIN" ? "admin" : `user:${user.id}`;
  return `todos:${scope}:page:${query.page}:size:${query.pageSize}:completed:${query.completed ?? "all"}:sort:${query.sort ?? "id"}:order:${query.order ?? "desc"}`;
}

// 因为 Prisma Client 是异步 API。

export const todoService = {
  async getAll(query: TodoQuery, user: AuthUser) {
    const scoped = user.role === "ADMIN" ? query : { ...query, userId: user.id };
    const key = cacheKey(query, user);
    const cached = memoryCache.get<resultShape>(key);
    if (cached) {
      console.log(JSON.stringify({ event: "cache.hit", key }));
      return cached;
    }
    const [data, total] = await Promise.all([
      todoRepository.findAll(scoped),
      todoRepository.count(scoped.completed, scoped.userId),
    ]);

    const result = {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
    memoryCache.set(key, result, CACHE_TTL);
    console.log(JSON.stringify({ event: "cache.miss", key }));
    return result;
  },

  async getById(id: number, user: AuthUser) {
    return todoRepository.findById(id, user.role === "ADMIN" ? undefined : user.id);
  },

  async create(data: CreateTodoDTO) {
    const result = await todoRepository.create(data);
    memoryCache.clearByPrefix("todos:");
    return result;
  },

  async update(id: number, data: UpdateTodoDTO, user: AuthUser) {
    const result = await todoRepository.update(
      id,
      data,
      user.role === "ADMIN" ? undefined : user.id,
    );
    memoryCache.clearByPrefix("todos:");
    return result;
  },

  async getStats(user: AuthUser) {
    return todoRepository.stats(user.role === "ADMIN" ? undefined : user.id);
  },

  async delete(id: number, user: AuthUser) {
    const result = await todoRepository.delete(id, user.role === "ADMIN" ? undefined : user.id);
    memoryCache.clearByPrefix("todos:");
    return result;
  },
};

type resultShape = {
  data: unknown[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
