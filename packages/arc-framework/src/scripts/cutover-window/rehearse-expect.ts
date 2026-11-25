/** Compare an operation's result with the outcome a run expects: its status, and its findings one for one. */
import { WindowRefusal, type WindowFinding, type WindowResult } from "./result.js";
import type { WindowRequest } from "./main.js";
import { WindowRehearsalStop } from "./rehearse-run.js";

/** A finding a run expects: its exact subject, and a phrase its condition states. */
export interface WindowRehearsalExpectedFinding { subject: string; condition: string }
/** The outcome a run expects of one operation. */
export interface WindowRehearsalExpectation { status: WindowResult["status"]; findings: readonly WindowRehearsalExpectedFinding[] }

/** Run a window operation in process, returning a refusal as its result. */
export async function settleWindowOperation(operation: string, handler: (request: WindowRequest) => Promise<WindowResult>,
  request: WindowRequest): Promise<WindowResult> {
  try {
    return await handler(request);
  } catch (error) {
    if (error instanceof WindowRefusal) return { operation, status: "refused", findings: error.findings };
    throw error;
  }
}

/** Stop unless the result has the expected status and its findings match the expected ones one for one. */
export function expectWindowRehearsalResult(result: WindowResult, expected: WindowRehearsalExpectation): string {
  const { unmatchedFindings, unmatchedExpectations } = matchFindings(result.findings, expected.findings);
  if (result.status === expected.status && unmatchedFindings.length === 0 && unmatchedExpectations.length === 0) {
    return `${result.operation} ${result.status}${result.findings.length > 0 ? ` with ${result.findings.length} expected finding(s)` : ""}.`;
  }
  throw new WindowRehearsalStop([`${result.operation} ${result.status}, expected ${expected.status}.`,
    ...unmatchedFindings.map(finding => `Unexpected finding — ${finding.subject}: ${finding.condition}`),
    ...unmatchedExpectations.map(finding => `Missing finding — ${finding.subject}: …${finding.condition}…`)].join("\n"));
}

function matchFindings(findings: readonly WindowFinding[], expected: readonly WindowRehearsalExpectedFinding[]) {
  const owner = new Array<number>(findings.length).fill(-1);
  const meets = (finding: WindowFinding, expectation: WindowRehearsalExpectedFinding) =>
    finding.subject === expectation.subject && finding.condition.includes(expectation.condition);
  const assign = (index: number, seen: Set<number>): boolean => {
    const expectation = expected[index];
    if (expectation === undefined) return false;
    for (const [position, finding] of findings.entries()) {
      if (seen.has(position) || !meets(finding, expectation)) continue;
      seen.add(position);
      const current = owner[position] ?? -1;
      if (current === -1 || assign(current, seen)) { owner[position] = index; return true; }
    }
    return false;
  };
  const unmatchedExpectations = expected.filter((_, index) => !assign(index, new Set()));
  const unmatchedFindings = findings.filter((_, position) => owner[position] === -1);
  return { unmatchedFindings, unmatchedExpectations };
}
