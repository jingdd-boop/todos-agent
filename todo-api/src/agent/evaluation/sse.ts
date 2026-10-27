export type SseEvent = { event: string; data: unknown };

export function parseSseChunk(input: string): SseEvent[] {
  return input
    .split(/\n\n+/)
    .map((block) => {
      const event = block.match(/^event:\s*(.+)$/m)?.[1];
      const rawData = block.match(/^data:\s*(.+)$/m)?.[1];
      if (!event || rawData === undefined) return null;
      try {
        return { event, data: JSON.parse(rawData) };
      } catch {
        return { event, data: rawData };
      }
    })
    .filter((item): item is SseEvent => item !== null);
}

export function assertEventOrder(events: SseEvent[], expected: string[]) {
  let cursor = -1;
  for (const name of expected) {
    const next = events.findIndex((event, index) => index > cursor && event.event === name);
    if (next === -1) throw new Error("Missing or out-of-order SSE event: " + name);
    cursor = next;
  }
  if (events.filter((event) => event.event === "done").length > 1)
    throw new Error("SSE stream emitted done more than once");
}

export function assertConfirmationStream(events: SseEvent[]) {
  assertEventOrder(events, [
    "tool_call_ready",
    "tool_start",
    "tool_result",
    "confirmation_required",
    "done",
  ]);
  const result = events.find((event) => event.event === "tool_result");
  const confirmationId = (result?.data as { result?: { confirmationId?: string } } | undefined)
    ?.result?.confirmationId;
  if (!confirmationId) throw new Error("Confirmation stream did not include confirmationId");
}
