import { db } from "../database";
import { CreateTodoDTO, TodoQuery, UpdateTodoDTO } from "../types/todo";

interface TodoRecord {
  id: number;
  title: string;
  completed: number;
  created_at: string;
}

function toTodo(record: TodoRecord) {
  return {
    id: record.id,
    title: record.title,
    completed: record.completed === 1,
    createdAt: record.created_at,
  };
}

export const todoRepository = {
  /**
   * 查询 Todo 列表
   */
  findAll(query: TodoQuery) {
    const { page, pageSize, completed } = query;

    const offset = (page - 1) * pageSize;

    let sql = `
      SELECT
        id,
        title,
        completed,
        created_at
      FROM todos
    `;

    const params: Record<string, unknown> = {};

    // 条件查询
    if (completed !== undefined) {
      sql += `
        WHERE completed = @completed
      `;

      params.completed = completed ? 1 : 0;
    }

    // 排序 + 分页
    sql += `
      ORDER BY id DESC
      LIMIT @pageSize
      OFFSET @offset
    `;

    params.pageSize = pageSize;
    params.offset = offset;

    const records = db.prepare(sql).all(params) as TodoRecord[];

    return records.map(toTodo);
  },

  /**
   * 查询总数量
   */
  count(completed?: boolean) {
    let sql = `
      SELECT COUNT(*) as count
      FROM todos
    `;

    const params: Record<string, unknown> = {};

    if (completed !== undefined) {
      sql += `
        WHERE completed = @completed
      `;

      params.completed = completed ? 1 : 0;
    }

    const result = db.prepare(sql).get(params) as { count: number };

    return result.count;
  },

  /**
   * 根据 ID 查询
   */
  findById(id: number) {
    const record = db
      .prepare(
        `
        SELECT
          id,
          title,
          completed,
          created_at
        FROM todos
        WHERE id = @id
      `,
      )
      .get({ id }) as TodoRecord | undefined;

    if (!record) {
      return undefined;
    }

    return toTodo(record);
  },

  /**
   * 创建
   */
  create(data: CreateTodoDTO) {
    const createdAt = new Date().toISOString();

    const result = db
      .prepare(
        `
        INSERT INTO todos (
          title,
          completed,
          created_at
        )
        VALUES (
          @title,
          @completed,
          @createdAt
        )
      `,
      )
      .run({
        title: data.title,
        completed: 0,
        createdAt,
      });

    return this.findById(Number(result.lastInsertRowid))!;
  },

  /**
   * 更新
   */
  update(id: number, data: UpdateTodoDTO) {
    const todo = this.findById(id);

    if (!todo) {
      return undefined;
    }

    const title = data.title ?? todo.title;

    const completed = data.completed === undefined ? todo.completed : data.completed;

    db.prepare(
      `
      UPDATE todos
      SET
        title = @title,
        completed = @completed
      WHERE id = @id
    `,
    ).run({
      id,
      title,
      completed: completed ? 1 : 0,
    });

    return this.findById(id);
  },

  /**
   * 删除
   */
  delete(id: number) {
    const result = db
      .prepare(
        `
        DELETE FROM todos
        WHERE id = @id
      `,
      )
      .run({ id });

    return result.changes > 0;
  },
};
