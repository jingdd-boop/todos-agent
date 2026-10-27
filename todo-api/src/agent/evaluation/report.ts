import { mkdir, writeFile } from "node:fs/promises";

export type EvaluationCaseResult = {
  caseId: string;
  category: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  score: number;
  failureReason?: string;
  traceSummary?: { tools?: string[]; events?: string[]; errorCode?: string };
};

export type EvaluationReport = {
  generatedAt: string;
  suiteVersion: string;
  totalCases: number;
  passed: number;
  failed: number;
  skipped: number;
  score: number;
  scoreByCategory: Record<string, number>;
  gates: {
    toolSelection: boolean;
    confirmationSafety: boolean;
    authorization: boolean;
    loopTermination: boolean;
  };
  cases: EvaluationCaseResult[];
};

function safeCase(item: EvaluationCaseResult): EvaluationCaseResult {
  return {
    caseId: item.caseId,
    category: item.category,
    status: item.status,
    durationMs: item.durationMs,
    score: item.score,
    ...(item.failureReason ? { failureReason: item.failureReason } : {}),
    ...(item.traceSummary ? { traceSummary: item.traceSummary } : {}),
  };
}

export function buildEvaluationReport(cases: EvaluationCaseResult[]): EvaluationReport {
  const sanitized = cases.map(safeCase);
  const scoreByCategory: Record<string, number> = {};
  for (const item of sanitized)
    scoreByCategory[item.category] = (scoreByCategory[item.category] ?? 0) + item.score;
  return {
    generatedAt: new Date().toISOString(),
    suiteVersion: "phase-2",
    totalCases: sanitized.length,
    passed: sanitized.filter((item) => item.status === "passed").length,
    failed: sanitized.filter((item) => item.status === "failed").length,
    skipped: sanitized.filter((item) => item.status === "skipped").length,
    score: sanitized.reduce((total, item) => total + item.score, 0),
    scoreByCategory,
    gates: {
      toolSelection: sanitized
        .filter((item) => item.category === "tool-calling")
        .every((item) => item.status === "passed"),
      confirmationSafety: sanitized
        .filter((item) => item.category === "confirmation")
        .every((item) => item.status === "passed"),
      authorization: sanitized
        .filter((item) => item.category === "authorization")
        .every((item) => item.status === "passed"),
      loopTermination: sanitized
        .filter((item) => item.category === "loop")
        .every((item) => item.status === "passed"),
    },
    cases: sanitized,
  };
}

export function renderEvaluationMarkdown(report: EvaluationReport) {
  return [
    "# Todo Agent Evaluation Report",
    "",
    "- Suite: " + report.suiteVersion,
    "- Generated: " + report.generatedAt,
    "- Score: " + report.score,
    "- Cases: " +
      report.passed +
      " passed / " +
      report.failed +
      " failed / " +
      report.skipped +
      " skipped",
    "",
    "## Gates",
    "",
    ...Object.entries(report.gates).map(
      ([name, passed]) => "- " + name + ": " + (passed ? "PASS" : "FAIL"),
    ),
    "",
    "## Cases",
    "",
    "| Case | Category | Status | Score | Duration |",
    "| --- | --- | --- | ---: | ---: |",
    ...report.cases.map(
      (item) =>
        "| " +
        item.caseId +
        " | " +
        item.category +
        " | " +
        item.status +
        " | " +
        item.score +
        " | " +
        item.durationMs +
        "ms |",
    ),
    "",
  ].join("\n");
}

export async function writeEvaluationReport(report: EvaluationReport, directory = "test-results") {
  await mkdir(directory, { recursive: true });
  await writeFile(directory + "/agent-evaluation.json", JSON.stringify(report, null, 2) + "\n");
  await writeFile(directory + "/agent-evaluation.md", renderEvaluationMarkdown(report));
}
