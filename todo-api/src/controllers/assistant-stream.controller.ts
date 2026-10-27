import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../errors/app-error";
import { agentTools, executeTool, llmConfig, type ChatMessage } from "../agent/assistant";
import { searchProjectDocs } from "../rag/retriever";

type PendingCall = { id: string; name: string; arguments: string };

export async function assistantStream(req: AuthRequest, res: Response) {
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim())
    throw new AppError("message is required", 400, "VALIDATION_FAILED");
  const config = llmConfig();
  const sources = await searchProjectDocs(message);
  const context = sources.map((source) => `[${source.file}]\n${source.content}`).join("\n\n");
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是 Todo Agent。可以查询、创建和删除 Todo。删除必须等待用户确认。优先参考以下项目文档回答：\n${context}`,
    },
    { role: "user", content: message.trim() },
  ];
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("meta", { model: config.model });
  send("retrieval", { sources: sources.map(({ file, title }) => ({ file, title })) });

  try {
    for (let step = 0; step < config.maxSteps; step += 1) {
      const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          temperature: 0.2,
          messages,
          tools: agentTools,
          tool_choice: "auto",
        }),
      });
      if (!upstream.ok || !upstream.body)
        throw new AppError("LLM stream request failed", 502, "LLM_REQUEST_FAILED");
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let finishReason: string | null = null;
      const calls = new Map<number, PendingCall>();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          let chunk: any;
          try {
            chunk = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          const choice = chunk.choices?.[0];
          finishReason = choice?.finish_reason ?? finishReason;
          const delta = choice?.delta;
          if (delta?.content) {
            answer += delta.content;
            send("token", { text: delta.content });
          }
          for (const part of delta?.tool_calls ?? []) {
            const current = calls.get(part.index) ?? { id: "", name: "", arguments: "" };
            if (part.id) {
              current.id = part.id;
              send("tool_call_start", {
                index: part.index,
                id: part.id,
                name: part.function?.name ?? "",
              });
            }
            if (part.function?.name) current.name += part.function.name;
            if (part.function?.arguments) {
              current.arguments += part.function.arguments;
              send("tool_call_delta", { index: part.index, arguments: part.function.arguments });
            }
            calls.set(part.index, current);
          }
        }
      }
      if (!calls.size || finishReason !== "tool_calls") {
        send("done", {});
        return res.end();
      }
      const toolCallMessages = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        }));
      messages.push({ role: "assistant", content: answer, tool_calls: toolCallMessages });
      for (const call of toolCallMessages) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(call.function.arguments || "{}");
        } catch {
          throw new AppError("Invalid tool arguments", 400, "INVALID_TOOL_ARGUMENTS");
        }
        send("tool_call_ready", { id: call.id, name: call.function.name, arguments: parsed });
        send("tool_start", { name: call.function.name });
        const executed = await executeTool(
          call.function.name,
          call.function.arguments,
          req.user!,
          call.id,
        );
        send("tool_result", { name: call.function.name, result: executed.record.result });
        if (call.function.name === "delete_todo")
          send("confirmation_required", executed.record.result);
        messages.push(executed.message);
      }
    }
    throw new AppError("Agent exceeded the maximum number of steps", 502, "AGENT_MAX_STEPS");
  } catch (error) {
    const message = error instanceof Error ? error.message : "流式请求失败";
    if (!res.writableEnded) {
      send("error", { message });
      send("done", { ok: false });
      res.end();
    }
  }
}
