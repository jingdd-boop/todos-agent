import { AppError } from "../errors/app-error";
import type { AuthUser } from "../types/auth";
import { createTodoTool, listTodosTool } from "./tools";
import type { AgentToolName, AgentToolResult } from "./types";
import { createPending } from "./pending-confirmations";
import { todoService } from "../services/todo.service";

export type AssistantReply = {
  answer: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown>; result: AgentToolResult }>;
  modelSteps: Array<{
    step: number;
    phase: "intent" | "final_answer";
    model: string;
    messageCount: number;
    decision: string;
    toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  }>;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};
type ToolCallRecord = {
  name: AgentToolName;
  arguments: Record<string, unknown>;
  result: AgentToolResult;
};

export const agentTools = [
  {
    type: "function",
    function: {
      name: "list_todos",
      description: "查询当前登录用户可访问的 Todo。",
      parameters: {
        type: "object",
        properties: {
          completed: { type: "boolean", description: "true 已完成，false 未完成；不传表示全部" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_todo",
      description: "删除 Todo。此操作必须等待用户确认，不能直接执行。",
      parameters: {
        type: "object",
        properties: { id: { type: "integer", minimum: 1 } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_todo",
      description: "为当前登录用户创建一个 Todo。",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "Todo 标题" } },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
] as const;

export function llmConfig() {
  if (!process.env.LLM_API_KEY)
    throw new AppError("LLM_API_KEY is not configured", 503, "LLM_NOT_CONFIGURED");
  return {
    apiKey: process.env.LLM_API_KEY,
    baseUrl: (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 6),
  };
}

async function callModel(messages: ChatMessage[]) {
  const settings = llmConfig();
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      messages,
      tools: agentTools,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: ChatMessage }>;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new AppError(body.error?.message ?? "LLM request failed", 502, "LLM_REQUEST_FAILED");
  const rawAssistant = body.choices?.[0]?.message;
  const assistant = rawAssistant
    ? { ...rawAssistant, content: rawAssistant.content ?? "" }
    : undefined;
  if (!assistant)
    throw new AppError("LLM returned an invalid response", 502, "LLM_INVALID_RESPONSE");
  return { assistant, model: settings.model };
}

export type AgentModel = (messages: ChatMessage[]) => Promise<{
  assistant: ChatMessage;
  model: string;
}>;

export type AgentToolExecutor = (
  name: string,
  rawArguments: string,
  user: AuthUser,
  toolCallId: string,
) => ReturnType<typeof executeTool>;

export type RunAssistantOptions = {
  model?: AgentModel;
  execute?: AgentToolExecutor;
  maxSteps?: number;
};

export async function executeTool(
  name: string,
  rawArguments: string,
  user: AuthUser,
  toolCallId: string,
) {
  if (name !== "list_todos" && name !== "create_todo" && name !== "delete_todo")
    throw new AppError(`Unsupported tool: ${name}`, 400, "UNSUPPORTED_TOOL");
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawArguments || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    args = parsed as Record<string, unknown>;
  } catch {
    throw new AppError("Tool arguments are invalid JSON", 400, "INVALID_TOOL_ARGUMENTS");
  }
  if (name === "delete_todo") {
    if (typeof args.id !== "number" || !Number.isInteger(args.id) || args.id <= 0)
      throw new AppError("id is required", 400, "VALIDATION_FAILED");
    const target = await todoService.getById(args.id, user);
    if (!target) throw new AppError("Todo not found", 404, "TODO_NOT_FOUND");
    const confirmationId = createPending(user, args.id);
    return {
      record: {
        name: "delete_todo",
        arguments: args,
        result: { tool: "delete_todo", todoId: args.id, confirmationId },
      } as ToolCallRecord,
      message: {
        role: "tool" as const,
        tool_call_id: toolCallId,
        content: JSON.stringify({ confirmationRequired: true, confirmationId, todoId: args.id }),
      },
    };
  }
  const result =
    name === "list_todos"
      ? await listTodosTool(
          user,
          typeof args.completed === "boolean" ? { completed: args.completed } : {},
        )
      : await createTodoTool(user, args);
  return {
    record: { name, arguments: args, result } as ToolCallRecord,
    message: { role: "tool" as const, tool_call_id: toolCallId, content: JSON.stringify(result) },
  };
}

export async function runAssistant(
  message: string,
  user: AuthUser,
  history: ChatMessage[] = [],
  options: RunAssistantOptions = {},
): Promise<AssistantReply> {
  if (!message.trim())
    return { answer: "请告诉我你想查询或创建什么 Todo。", toolCalls: [], modelSteps: [] };
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是 Todo 任务助手。只能通过提供的工具查询或创建 Todo，不要编造工具结果；信息不足时先提问；使用中文简洁回答。",
    },
    ...history.slice(-20),
    { role: "user", content: message.trim() },
  ];
  const toolCalls: ToolCallRecord[] = [];
  const modelSteps: AssistantReply["modelSteps"] = [];
  const maxSteps = options.maxSteps ?? llmConfig().maxSteps;
  const model = options.model ?? callModel;
  const execute = options.execute ?? executeTool;
  for (let step = 0; step < maxSteps; step += 1) {
    const modelResult = await model(messages);
    const assistant = modelResult.assistant;
    const requestedTools = (assistant.tool_calls ?? []).map((call) => {
      try {
        return {
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments || "{}") as Record<string, unknown>,
        };
      } catch {
        return { name: call.function.name, arguments: {} };
      }
    });
    modelSteps.push({
      step: step + 1,
      phase: assistant.tool_calls?.length ? "intent" : "final_answer",
      model: modelResult.model,
      messageCount: messages.length,
      decision: assistant.tool_calls?.length ? "模型识别到需要调用工具" : "模型生成最终回答",
      toolCalls: requestedTools,
    });
    messages.push(assistant);
    if (!assistant.tool_calls?.length)
      return { answer: assistant.content ?? "我暂时无法生成回复。", toolCalls, modelSteps };
    for (const call of assistant.tool_calls) {
      const executed = await execute(call.function.name, call.function.arguments, user, call.id);
      toolCalls.push(executed.record);
      messages.push(executed.message);
    }
  }
  throw new AppError("Agent exceeded the maximum number of steps", 502, "AGENT_MAX_STEPS");
}
