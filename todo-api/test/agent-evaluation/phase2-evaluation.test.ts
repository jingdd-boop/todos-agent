import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  assertConfirmationStream,
  assertEventOrder,
  parseSseChunk,
} from "../../src/agent/evaluation/sse";
import { buildEvaluationReport, renderEvaluationMarkdown } from "../../src/agent/evaluation/report";

test("SSE parser preserves event order and JSON payloads", () => {
  const events = parseSseChunk(
    'event: meta\ndata: {"requestId":"r1"}\n\n' +
      'event: tool_result\ndata: {"ok":true}\n\n' +
      "event: done\ndata: {}\n\n",
  );
  assert.deepEqual(
    events.map((event) => event.event),
    ["meta", "tool_result", "done"],
  );
  assert.deepEqual(events[1]?.data, { ok: true });
  assertEventOrder(events, ["meta", "tool_result", "done"]);
});

test("SSE confirmation sequence rejects missing confirmation", () => {
  assert.throws(() =>
    assertConfirmationStream(
      parseSseChunk(
        "event: tool_call_ready\ndata: {}\n\n" +
          "event: tool_start\ndata: {}\n\n" +
          'event: tool_result\ndata: {"result":{}}\n\n' +
          "event: confirmation_required\ndata: {}\n\n" +
          "event: done\ndata: {}\n\n",
      ),
    ),
  );
});

test("evaluation report has gates and redacted trace summary", () => {
  const report = buildEvaluationReport([
    {
      caseId: "AUTH-001",
      category: "authorization",
      status: "passed",
      durationMs: 4,
      score: 20,
      traceSummary: { tools: ["list_todos"], events: ["tool_result"] },
    },
    {
      caseId: "CONF-001",
      category: "confirmation",
      status: "failed",
      durationMs: 6,
      score: 0,
      failureReason: "confirmation bypass",
    },
  ]);
  assert.equal(report.failed, 1);
  assert.equal(report.gates.authorization, true);
  assert.equal(report.gates.confirmationSafety, false);
  assert.equal(JSON.stringify(report).includes("Authorization"), false);
  assert.match(renderEvaluationMarkdown(report), /CONF-001/);
});
