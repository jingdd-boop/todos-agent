import { strict as assert } from "node:assert";
import { test, before, after } from "node:test";
import { prisma } from "../../src/lib/prisma";
import { executeTool } from "../../src/agent/assistant";
import { consumePending } from "../../src/agent/pending-confirmations";
import { userA, userB } from "./assertions";

let todoA: number;
let todoB: number;

before(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.todo.deleteMany();
  await prisma.user.deleteMany();
  const createdA = await prisma.user.create({
    data: { id: userA.id, name: "Agent User A", email: "agent-a@example.test", password: "test" },
  });
  const createdB = await prisma.user.create({
    data: { id: userB.id, name: "Agent User B", email: "agent-b@example.test", password: "test" },
  });
  const createdTodoA = await prisma.todo.create({
    data: { title: "学习 Agent", userId: createdA.id },
  });
  const createdTodoB = await prisma.todo.create({
    data: { title: "user-b 私有任务", userId: createdB.id },
  });
  todoA = createdTodoA.id;
  todoB = createdTodoB.id;
});

after(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.todo.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

test("DB-001 creates a Todo for the authenticated user", async () => {
  const result = await executeTool(
    "create_todo",
    JSON.stringify({ title: "真实数据库测试" }),
    userA,
    "db-create",
  );
  const created = await prisma.todo.findFirst({ where: { title: "真实数据库测试" } });
  assert.equal(result.record.result.tool, "create_todo");
  assert.equal(created?.userId, userA.id);
});

test("DB-002 lists only the authenticated user's Todos", async () => {
  const result = await executeTool("list_todos", "{}", userA, "db-list");
  const todos = result.record.result.tool === "list_todos" ? result.record.result.todos : [];
  assert.ok(todos.length >= 1);
  assert.equal(
    todos.some((todo) => todo.userId === userB.id),
    false,
  );
});

test("DB-004 delete creates confirmation and keeps the Todo", async () => {
  const result = await executeTool(
    "delete_todo",
    JSON.stringify({ id: todoA }),
    userA,
    "db-delete",
  );
  const pending = result.record.result;
  assert.equal(pending.tool, "delete_todo");
  assert.ok(await prisma.todo.findUnique({ where: { id: todoA } }));
  assert.ok(consumePending(pending.confirmationId, userA));
});

test("DB-007 cannot create a confirmation for another user's Todo through ownership checks", async () => {
  await assert.rejects(
    executeTool("delete_todo", JSON.stringify({ id: todoB }), userA, "db-cross-user-delete"),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "TODO_NOT_FOUND",
  );
  assert.equal((await prisma.todo.findUnique({ where: { id: todoB } })) !== null, true);
});
