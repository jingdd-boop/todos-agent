import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../errors/app-error";
import { runAssistant, type ChatMessage } from "../agent/assistant";
import { consumePending } from "../agent/pending-confirmations";
import { todoService } from "../services/todo.service";
import { conversationService } from "../services/conversation.service";

export const assistantController = {
  async chat(req: AuthRequest, res: Response) {
    const message = req.body?.message;
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new AppError("message is required", 400, "VALIDATION_FAILED");
    }

    let conversationId =
      req.body?.conversationId === undefined ? undefined : Number(req.body.conversationId);
    if (conversationId !== undefined && (!Number.isInteger(conversationId) || conversationId <= 0))
      throw new AppError("Invalid conversation id", 400, "INVALID_CONVERSATION_ID");
    if (conversationId === undefined)
      conversationId = (await conversationService.create(req.user!, message.slice(0, 40))).id;
    const conversation = await conversationService.get(req.user!, conversationId);
    if (!conversation) throw new AppError("Conversation not found", 404, "CONVERSATION_NOT_FOUND");
    await conversationService.addMessage(req.user!, conversationId, {
      role: "user",
      content: message,
    });
    const history: ChatMessage[] = conversation.messages
      .slice(-20)
      .filter((item) => item.role === "user" || item.role === "assistant")
      .map((item) => ({
        role: item.role as ChatMessage["role"],
        content: item.content ?? "",
        ...(item.toolCallId ? { tool_call_id: item.toolCallId } : {}),
      }));
    const result = await runAssistant(message, req.user!, history);
    for (const call of result.toolCalls)
      await conversationService.addMessage(req.user!, conversationId, {
        role: "tool",
        toolName: call.name,
        toolArguments: JSON.stringify(call.arguments),
        toolResult: JSON.stringify(call.result),
      });
    await conversationService.addMessage(req.user!, conversationId, {
      role: "assistant",
      content: result.answer,
    });
    res.json({ success: true, data: { ...result, conversationId } });
  },

  async confirm(req: AuthRequest, res: Response) {
    const confirmationId = req.body?.confirmationId;
    if (typeof confirmationId !== "string")
      throw new AppError("confirmationId is required", 400, "VALIDATION_FAILED");
    const pending = consumePending(confirmationId, req.user!);
    if (!pending)
      throw new AppError("Confirmation expired or invalid", 400, "INVALID_CONFIRMATION");
    const todo = await todoService.delete(pending.todoId, req.user!);
    if (!todo) throw new AppError("Todo not found", 404, "TODO_NOT_FOUND");
    res.json({ success: true, data: { message: "Todo deleted", todoId: pending.todoId } });
  },
};
