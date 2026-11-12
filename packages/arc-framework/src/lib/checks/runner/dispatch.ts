/** Execute one complete prepared plan through optional grouping or ordered mandatory singles. */
import type { CheckDeclaration } from "../declaration.js";
import type { TerminalOutcome } from "./contract.js";
import type { PreparedCheckExecution } from "./execution.js";
import { runnerDisplayText } from "../display-text.js";
import { reduceCheckPlanOutcomes, type CheckPlanReduction } from "./parent.js";

/** Collect independently retained evidence without retrying work or stopping on ordinary native failure. */
export async function executePreparedCheckPlan(execution: PreparedCheckExecution, check: Pick<CheckDeclaration["checks"][string], "shards" | "no_evidence_exit">): Promise<CheckPlanReduction> {
  const noEvidenceExit = check.no_evidence_exit;
  const ids = execution.plan.invocations.map(invocation => invocation.id);
  const requests = check.shards?.routed === true && execution.supportsRunGroup ? [() => execution.runGroup(ids)] : ids.map(id => () => execution.run(id));
  const observed = new Map<string, Readonly<TerminalOutcome>>();
  const incomplete: string[] = [];
  try {
    for (const request of requests) {
      const result = await request();
      for (const [id, outcome] of result.outcomes) observed.set(id, outcome);
      if (result.status === "incomplete") { incomplete.push(runnerDisplayText(result.reason)); break; }
    }
  } catch (cause) { incomplete.push(runnerDisplayText(String(cause))); }
  for (const [id, outcome] of execution.observedOutcomes) if (!observed.has(id)) observed.set(id, outcome);
  return reduceCheckPlanOutcomes(execution.plan, observed, noEvidenceExit, incomplete);
}
