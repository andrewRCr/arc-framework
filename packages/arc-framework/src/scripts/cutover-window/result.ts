/** Typed operation results and complete human reports, with pure JSON on stdout when requested. */
/** One subject the operator must resolve before continuing. */
export interface WindowFinding { subject: string; condition: string; remedy: string }
/** Report produced by a window operation. */
export interface WindowResult {
  operation: string;
  status: "passed" | "refused" | "stopped" | "findings" | "reported";
  findings: readonly WindowFinding[];
  data?: unknown;
}
/** Text boundaries shared by the entry and its tests. */
export interface WindowOutput { stdout(text: string): void; stderr(text: string): void }


/** Emit one result and its report, preserving every finding and remedy. */
export function emitWindowResult(result: WindowResult, json: boolean, output: WindowOutput): number {
  const report = [
    `${result.operation}: ${result.status}`,
    ...result.findings.map(finding => `${finding.subject}: ${finding.condition}\n  Remedy: ${finding.remedy}`),
  ].join("\n") + "\n";
  if (json) {
    output.stdout(JSON.stringify(result) + "\n");
    output.stderr(report);
  } else output.stdout(report);
  return result.status === "passed" || result.status === "reported" ? 0 : 1;
}
