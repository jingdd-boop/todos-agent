// title：
// 必填
// 必须是字符串
// 长度 1～100
export function validateTitle(title: unknown): string | null {
  if (typeof title !== "string") {
    return "title must be a string";
  }

  if (title.trim().length === 0) {
    return "title cannot be empty";
  }

  if (title.length > 100) {
    return "title must be less than 100 characters";
  }

  return null;
}

export function validateUpdateTodo(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return "request body must be an object";
  }

  const body = data as Record<string, unknown>;

  if ("title" in body) {
    const titleError = validateTitle(body.title);

    if (titleError) {
      return titleError;
    }
  }

  if ("completed" in body) {
    if (typeof body.completed !== "boolean") {
      return "completed must be a boolean";
    }
  }

  return null;
}

export function validateId(id: string): number | null {
  const numberId = Number(id);

  if (!Number.isInteger(numberId) || numberId <= 0) {
    return null;
  }

  return numberId;
}
