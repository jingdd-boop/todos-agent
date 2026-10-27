import { prisma } from "../lib/prisma";
import type { AuthUser } from "../types/auth";

export const conversationService = {
  async create(user: AuthUser, title?: string) {
    return prisma.conversation.create({ data: { userId: user.id, ...(title ? { title } : {}) } });
  },
  async list(user: AuthUser) {
    return prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
  },
  async get(user: AuthUser, id: number) {
    return prisma.conversation.findFirst({
      where: { id, userId: user.id },
      include: { messages: { orderBy: { sequence: "asc" } } },
    });
  },
  async remove(user: AuthUser, id: number) {
    const result = await prisma.conversation.deleteMany({ where: { id, userId: user.id } });
    return result.count > 0;
  },
  async addMessage(
    user: AuthUser,
    conversationId: number,
    data: {
      role: string;
      content?: string;
      toolCallId?: string;
      toolName?: string;
      toolArguments?: string;
      toolResult?: string;
    },
  ) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: user.id },
      select: { id: true },
    });
    if (!conversation) return null;
    const last = await prisma.message.findFirst({
      where: { conversationId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    return prisma.message.create({
      data: {
        conversationId,
        role: data.role,
        sequence: (last?.sequence ?? 0) + 1,
        ...(data.content === undefined ? {} : { content: data.content }),
        ...(data.toolCallId === undefined ? {} : { toolCallId: data.toolCallId }),
        ...(data.toolName === undefined ? {} : { toolName: data.toolName }),
        ...(data.toolArguments === undefined ? {} : { toolArguments: data.toolArguments }),
        ...(data.toolResult === undefined ? {} : { toolResult: data.toolResult }),
      },
    });
  },
};
