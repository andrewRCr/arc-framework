/** Attribute validated terminal observations to the complete fixed invocation matrix. */
import type { CheckInvocationCoordinate } from "../shards.js";
import type { TerminalOutcome } from "./contract.js";
import type { CheckExecutionPlan } from "./planning.js";
import { displayRunnerOutcome } from "../display-text.js";
import { normalizeCheckInvocationOutcome, reduceCheckInvocationOutcomes,
  type CheckInvocationReduction, type NormalizedCheckInvocationOutcome } from "../result.js";

/** One expected pair and its native interpreted evidence, independent of request settlement. */
export interface CheckInvocationDetail extends CheckInvocationCoordinate {
  readonly invocationId: string;
  readonly outcome: NormalizedCheckInvocationOutcome;
  /** Collected display bytes, which never substitute for native terminal evidence. */
  readonly output?: string;
}

/** Parent evidence and the complete expected matrix, including unexecuted pairs. */
export interface CheckPlanReduction {
  readonly evidence: CheckInvocationReduction;
  readonly invocations: readonly CheckInvocationDetail[];
}

/** Reduce observations already validated by the runner facade against the expected matrix. */
export function reduceCheckPlanOutcomes(plan: CheckExecutionPlan, observed: ReadonlyMap<string, Readonly<TerminalOutcome>>,
  noEvidenceExit?: number, incompleteWork: readonly string[] = []): CheckPlanReduction {
  const invocations = plan.invocations.map((invocation, index) => ({
    ...(plan.coordinates?.[index] ?? { batch: index + 1 }), invocationId: invocation.id,
    outcome: normalizeCheckInvocationOutcome(displayRunnerOutcome(observed.get(invocation.id)), noEvidenceExit),
  }));
  const expected = new Set(plan.invocations.map(invocation => invocation.id));
  const incomplete = [...incompleteWork];
  if ([...observed.keys()].some(id => !expected.has(id))) incomplete.push("An unplanned invocation reported a terminal outcome.");
  if (invocations.length === 0) incomplete.push("The execution plan has no expected invocations.");
  const outcomes = invocations.map(detail => detail.outcome.kind === "unavailable"
    ? { ...detail.outcome, reason: `${checkInvocationLabel(detail)}: ${detail.outcome.reason}` } : detail.outcome);
  return { evidence: reduceCheckInvocationOutcomes(outcomes, noEvidenceExit, incomplete), invocations };
}

/** Human coordinate label shared by complete-plan diagnostics and result rendering. */
export function checkInvocationLabel(coordinate: CheckInvocationCoordinate): string {
  return `Batch ${coordinate.batch}${coordinate.shard === undefined ? "" : `, shard ${coordinate.shard.index}/${coordinate.shard.count}`}`;
}
