/** Qualification-only baseline playback followed by the fixed advertised shard group. */
import type { CheckDeclaration } from "../../src/lib/checks/declaration.js";
import type { PreparedCheckExecution, CheckExecutionRunResult } from "../../src/lib/checks/runner/execution.js";
import type { TerminalOutcome } from "../../src/lib/checks/runner/contract.js";
import { executePreparedCheckPlan } from "../../src/lib/checks/runner/dispatch.js";
import { reduceCheckPlanOutcomes, type CheckPlanReduction } from "../../src/lib/checks/runner/parent.js";
import { runnerDisplayText } from "../../src/lib/checks/display-text.js";

type QualificationCheck = Pick<CheckDeclaration["checks"][string], "shards" | "no_evidence_exit">;

/** Keep default qualification dispatch unchanged unless the caller explicitly opts in. */
export async function executeNativeQualificationPlan(execution: PreparedCheckExecution,
  check: QualificationCheck, baselineThenGroup = false): Promise<CheckPlanReduction> {
  if (!baselineThenGroup) return executePreparedCheckPlan(execution, check);
  const ids = execution.plan.invocations.map(invocation => invocation.id);
  const observed = new Map<string, Readonly<TerminalOutcome>>();
  const incomplete: string[] = [];
  const retain = (result: CheckExecutionRunResult) => {
    for (const [id, outcome] of result.outcomes) observed.set(id, outcome);
    if (result.status === "incomplete") incomplete.push(runnerDisplayText(result.reason));
  };
  try {
    if (!execution.supportsRunGroup) incomplete.push("Native baseline/group qualification requires advertised check/runGroup capability.");
    else if (check.shards === undefined || ids.length !== check.shards.count + 1) {
      incomplete.push("Native baseline/group qualification requires one baseline and the complete declared shard matrix.");
    } else {
      const baseline = await execution.run(ids[0]!);
      retain(baseline);
      // Ordinary completed native failures still dispatch the fixed diagnostics.
      // Only incomplete work withholds new requests, as in ordinary dispatch.
      if (baseline.status === "settled") retain(await execution.runGroup(ids.slice(1)));
    }
  } catch (cause) { incomplete.push(runnerDisplayText(String(cause))); }
  for (const [id, outcome] of execution.observedOutcomes) if (!observed.has(id)) observed.set(id, outcome);
  return reduceCheckPlanOutcomes(execution.plan, observed, check.no_evidence_exit, incomplete);
}
