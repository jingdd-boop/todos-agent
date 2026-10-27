import type { Response } from "express";
import { AppError } from "../errors/app-error";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { conversationService } from "../services/conversation.service";

function idOf(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0)
    throw new AppError("Invalid conversation id", 400, "INVALID_CONVERSATION_ID");
  return id;
}

export const conversationController = {
  async create(req: AuthRequest, res: Response) {
    const title =
      typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 100) : undefined;
    res
      .status(201)
      .json({ success: true, data: await conversationService.create(req.user!, title) });
  },
  async list(req: AuthRequest, res: Response) {
    res.json({ success: true, data: await conversationService.list(req.user!) });
  },
  async get(req: AuthRequest, res: Response) {
    const conversation = await conversationService.get(req.user!, idOf(req.params.id));
    if (!conversation) throw new AppError("Conversation not found", 404, "CONVERSATION_NOT_FOUND");
    res.json({ success: true, data: conversation });
  },
  async remove(req: AuthRequest, res: Response) {
    if (!(await conversationService.remove(req.user!, idOf(req.params.id))))
      throw new AppError("Conversation not found", 404, "CONVERSATION_NOT_FOUND");
    res.status(204).send();
  },
};
