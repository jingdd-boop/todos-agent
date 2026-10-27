import { strict as assert } from "node:assert";
import { test } from "node:test";
import { executeTool, runAssistant } from "../../src/agent/assistant";
import { consumePending, createPending } from "../../src/agent/pending-confirmations";
import { admin, assertTool, assistantToolCall, fakeExecutor, userA, userB } from "./assertions";
import { scriptedModel } from "./fake-llm";

test("TC-001 selects create_todo and generates minimal arguments", async () => {
  const llm = scriptedModel([
    assistantToolCall("create_todo", { title: "学习 Agent" }),
    { role: "assistant", content: "已创建 Todo：学习 Agent。" },
  ]);
  const reply = await runAssistant("创建一个 Todo：学习 Agent", userA, [], {
    model: llm.run,
    execute: fakeExecutor({ create_todo: { tool: "create_todo" } }),
  });
  assertTool(reply, "create_todo", { title: "学习 Agent" });
  assert.equal(reply.answer, "已创建 Todo：学习 Agent。");
});

test("TC-002 selects list_todos with completed=false", async () => {
  const llm = scriptedModel([
    assistantToolCall("list_todos", { completed: false }),
    { role: "assistant", content: "你有 2 个未完成任务。" },
  ]);
  const reply = await runAssistant("列出未完成任务", userA, [], {
    model: llm.run,
    execute: fakeExecutor({ list_todos: { tool: "list_todos", todos: [] } }),
  });
  assertTool(reply, "list_todos", { completed: false });
});

test("ARG-005 does not trust model supplied userId", async () => {
  const calls: string[] = [];
  const llm = scriptedModel([
    assistantToolCall("create_todo", { title: "隔离测试", userId: userB.id }),
    { role: "assistant", content: "已处理。" },
  ]);
  await runAssistant("创建隔离测试", userA, [], {
    model: llm.run,
    execute: fakeExecutor({ create_todo: { tool: "create_todo" } }, calls),
  });
  assert.match(calls[0] ?? "", /^101:create_todo:/);
  assert.match(calls[0] ?? "", /隔离测试/);
});

test("CONF-001 creates a pending confirmation without consuming it", () => {
  const confirmationId = createPending(userA, 7);
  assert.ok(confirmationId);
  assert.deepEqual(consumePending(confirmationId, userA)?.todoId, 7);
});

test("CONF-005 binds confirmation to the originating user", async () => {
  const confirmationId = createPending(userA, 8);
  assert.equal(consumePending(confirmationId, userB), null);
  assert.equal(consumePending(confirmationId, userA), null);
});

test("CTX-003 sends previous tool results into the next model step", async () => {
  const llm = scriptedModel([
    assistantToolCall("list_todos", {}),
    { role: "assistant", content: "第一个任务是学习 Agent。" },
  ]);
  const reply = await runAssistant(
    "它是什么？",
    userA,
    [{ role: "user", content: "列出我的任务" }],
    {
      model: llm.run,
      execute: fakeExecutor({ list_todos: { tool: "list_todos", todos: [{ id: 1 }] } }),
    },
  );
  assert.equal(reply.modelSteps.length, 2);
  assert.equal(
    llm.calls[1]?.some((message) => message.role === "tool"),
    true,
  );
});

test("AUTH-003 always executes with the authenticated user", async () => {
  const seen: number[] = [];
  const llm = scriptedModel([
    assistantToolCall("list_todos", { userId: userB.id }),
    { role: "assistant", content: "只能查看当前用户的任务。" },
  ]);
  await runAssistant("查看 user-b 的任务", admin, [], {
    model: llm.run,
    execute: async (name, args, user) => {
      seen.push(user.id);
      return {
        record: { name, arguments: JSON.parse(args), result: { tool: "list_todos" } } as never,
        message: { role: "tool", tool_call_id: "call", content: "{}" },
      };
    },
  });
  assert.deepEqual(seen, [admin.id]);
});

test("AGENT_MAX_STEPS terminates a looping model", async () => {
  const llm = scriptedModel([assistantToolCall("list_todos", {})]);
  await assert.rejects(
    runAssistant("一直查询", userA, [], {
      model: async () => ({ assistant: assistantToolCall("list_todos", {}), model: "fake" }),
      execute: fakeExecutor({ list_todos: { tool: "list_todos", todos: [] } }),
      maxSteps: 2,
    }),
    /maximum number of steps/,
  );
  void llm;
});
