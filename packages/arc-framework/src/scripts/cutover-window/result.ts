/** Typed operation results and complete human reports, with pure JSON on stdout when requested. */
/** One subject the operator must resolve before continuing. */
export interface WindowFinding { subject: string; condition: string; remedy: string }
/** Report produced by a window operation. */
export interface WindowResult {
  operation: string;
  status: "passed" | "refused" | "stopped" | "findings" | "reported";
  findings: readonly WindowFinding[];
  messages?: readonly string[];
  data?: unknown;
}
/** Text boundaries shared by the entry and its tests. */
export interface WindowOutput { stdout(text: string): void; stderr(text: string): void }


/** Emit one result and its report, preserving every finding and remedy. */
export function emitWindowResult(result: WindowResult, json: boolean, output: WindowOutput): number {
  const report = [
    `${result.operation}: ${result.status}`,
    ...(result.messages ?? []),
    ...result.findings.map(finding => `${finding.subject}: ${finding.condition}\n  Remedy: ${finding.remedy}`),
  ].join("\n") + "\n";
  if (json) {
    output.stdout(JSON.stringify(result) + "\n");
    output.stderr(report);
  } else output.stdout(report);
  return result.status === "passed" || result.status === "reported" ? 0 : 1;
}

/** An operational refusal carrying its observed subjects and recovery instructions. */
export class WindowRefusal extends Error {
  /** Keep every finding available to both the human report and JSON output. */
  constructor(readonly findings: readonly WindowFinding[]) {
    super(findings.map(finding => finding.condition).join("\n"));
    this.name = "WindowRefusal";
  }
}

/** A read's value, or the findings of the refusal that kept it from being read. */
export type WindowRead<T> = { value: T } | { findings: WindowFinding[] };

/** Read one input, returning a refusal as its findings so the operation still evaluates every comparison it does not feed. */
export async function windowRead<T>(read: () => Promise<T>): Promise<WindowRead<T>> {
  try {
    return { value: await read() };
  } catch (error) {
    if (error instanceof WindowRefusal) return { findings: [...error.findings] };
    throw error;
  }
}

/** Report a condition whose input cannot be read as its own findings, so the operation still evaluates every other one. */
export async function windowRefusalFindings(read: () => Promise<WindowFinding[]>): Promise<WindowFinding[]> {
  const result = await windowRead(read);
  return "value" in result ? result.value : result.findings;
}
