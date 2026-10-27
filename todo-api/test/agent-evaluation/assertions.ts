import { strict as assert } from "node:assert";
import type { AgentToolExecutor, AssistantReply, ChatMessage } from "../../src/agent/assistant";
import type { AuthUser } from "../../src/types/auth";

export const userA: AuthUser = { id: 101, role: "USER" };
export const userB: AuthUser = { id: 202, role: "USER" };
export const admin: AuthUser = { id: 303, role: "ADMIN" };

export function fakeExecutor(results: Record<string, unknown>, calls: string[] = []) {
  const execute: AgentToolExecutor = async (name, rawArguments, user) => {
    calls.push(`${user.id}:${name}:${rawArguments}`);
    const result = results[name];
    if (!result) throw new Error(`No fake result for ${name}`);
    return {
      record: { name, arguments: JSON.parse(rawArguments || "{}"), result } as never,
      message: {
        role: "tool" as const,
        tool_call_id: "fake-tool-call",
        content: JSON.stringify(result),
      },
    };
  };
  return execute;
}

export function assertTool(reply: AssistantReply, name: string, args: Record<string, unknown>) {
  assert.equal(reply.toolCalls.length, 1);
  assert.equal(reply.toolCalls[0]?.name, name);
  assert.deepEqual(reply.toolCalls[0]?.arguments, args);
}

export function assistantToolCall(name: string, args: Record<string, unknown>): ChatMessage {
  return {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "fake-tool-call",
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}
