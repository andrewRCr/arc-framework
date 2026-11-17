/** Required branch coverage and exact confirmations over immutable held comparisons. */
import type { WindowHeldComparisons } from "./held-comparisons.js";
import type { WindowFinding } from "./result.js";
type Branches = Readonly<Record<string, { local: string | null; origin: string | null }>>;

/** Check recorded sides and all late-change confirmations without reading later live tips. */
export function windowCloseHeldFindings(branches: Branches, flip: string, state: WindowHeldComparisons): WindowFinding[] {
  return [...missingRecordedMarks(branches, flip, state), ...state.ranges.flatMap(range => range.confirmation === range.tip ? [] : [{
    subject: `${range.side}/${range.branch}`, condition: `${range.kind} range ${range.from}..${range.tip} has confirmation ${range.confirmation ?? "(missing)"}, which does not match its current mark.`,
    remedy: `Reapply the held range through the store and confirm ${range.branch} at the exact ${range.side} tip ${range.tip}, then retry close.`,
  }])];
}

function missingRecordedMarks(branches: Branches, flip: string, state: WindowHeldComparisons): WindowFinding[] {
  const findings: WindowFinding[] = [];
  for (const [branch, tips] of Object.entries(branches)) {
    if (branch === "main" || branch === flip) continue;
    for (const side of ["local", "origin"] as const) {
      if (tips[side] !== null && !state.marks.some(mark => mark.branch === branch && mark.side === side)) findings.push({
        subject: `${side}/${branch}`, condition: `Recorded tip ${tips[side]} has no comparison mark.`,
        remedy: `Run compare --branch ${branch}, reapply and confirm any range it reports, then retry close.`,
      });
    }
  }
  return findings;
}
