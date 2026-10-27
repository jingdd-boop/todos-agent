import crypto from "node:crypto";
import type { AuthUser } from "../types/auth";

type Pending = { id: string; user: AuthUser; todoId: number; expiresAt: number };
const pending = new Map<string, Pending>();

export function createPending(user: AuthUser, todoId: number) {
  const id = crypto.randomUUID();
  pending.set(id, { id, user, todoId, expiresAt: Date.now() + 5 * 60_000 });
  return id;
}

export function consumePending(id: string, user: AuthUser) {
  const item = pending.get(id);
  pending.delete(id);
  if (
    !item ||
    item.expiresAt < Date.now() ||
    item.user.id !== user.id ||
    item.user.role !== user.role
  )
    return null;
  return item;
}
