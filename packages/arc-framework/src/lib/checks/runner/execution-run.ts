/** Run fixed prepared IDs while preserving independently observed native terminal evidence. */
import type { TerminalOutcome } from "./contract.js";
import type { CheckExecutionRunResult } from "./execution.js";
import type { CheckRunnerSession } from "./session.js";
import type { ExecutionAttemptControl } from "./execution-attempt.js";

/** Submit one fixed single or explicit group without replacing outcomes on incomplete work. */
export async function runPreparedInvocations(session: CheckRunnerSession, contextId: string,
  selection: string | readonly string[], control: ExecutionAttemptControl): Promise<CheckExecutionRunResult> {
  const ids = typeof selection === "string" ? [selection] : [...selection];
  try {
    if (control.cancelled) throw new Error("Runner attempt was cancelled; retry explicitly with a fresh attempt before dispatching new work.");
    const settlement = typeof selection === "string"
      ? await session.request({ method: "check/run", params: { contextId, invocationId: selection } })
      : await session.request({ method: "check/runGroup", params: { contextId, invocationIds: ids } });
    return { status: "settled", settlement, outcomes: requestedOutcomes(session, ids) };
  } catch (cause) {
    return { status: "incomplete", reason: cause instanceof Error ? cause.message : "Runner execution did not establish complete settlement.",
      outcomes: requestedOutcomes(session, ids) };
  }
}

function requestedOutcomes(session: CheckRunnerSession, ids: readonly string[]): ReadonlyMap<string, Readonly<TerminalOutcome>> {
  const observed = session.observedOutcomes;
  return new Map(ids.flatMap(id => {
    const outcome = observed.get(id);
    return outcome === undefined ? [] : [[id, outcome] as const];
  }));
}
