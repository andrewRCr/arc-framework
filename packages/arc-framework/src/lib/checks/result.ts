/** Normalize native terminal observations before reducing complete or incomplete check work. */

/** A completed native process or an explicitly unavailable invocation, independent of transport. */
export type CheckInvocationObservation =
  | { readonly status: "completed"; readonly exitCode: number; readonly notice?: string; readonly notRunReason?: string }
  | { readonly status: "unavailable" | "cancelled"; readonly reason: string; readonly remedy?: string; readonly notice?: string };

/** Native interpretation retained independently from final check publication policy. */
export type NormalizedCheckInvocationOutcome =
  | { readonly kind: "success" | "failure" | "no-evidence"; readonly exitCode: number; readonly notice?: string }
  | { readonly kind: "unavailable"; readonly reason: string; readonly remedy?: string; readonly exitCode?: number; readonly notice?: string };

/** Reduced terminal evidence; unavailable fallback codes never assert native completion. */
export interface CheckInvocationReduction {
  readonly kind: "success" | "failure" | "no-evidence" | "unavailable";
  readonly exitCode: number;
  readonly incomplete: readonly string[];
  /** Repair instructions an executor supplied with unavailable invocations. */
  readonly remedies: readonly string[];
  readonly notices: readonly string[];
}

/** Native shell/runner status convention for SIGKILL, unless declared as no evidence. */
const KILLED_EXIT_CODE = 137;
/** Actionable interpretation of the native killed-before-completion status. */
const KILLED_REASON = "killed before it finished: SIGKILL, most often for lack of memory";

/** Interpret exact native status and explicit unavailability with declared no-evidence precedence. */
export function normalizeCheckInvocationOutcome(outcome: CheckInvocationObservation | undefined,
  noEvidenceExit?: number): NormalizedCheckInvocationOutcome {
  if (outcome === undefined) return { kind: "unavailable", reason: "A required invocation has no terminal outcome." };
  const notice = outcome.notice === undefined ? {} : { notice: outcome.notice };
  if (outcome.status !== "completed") return { kind: "unavailable", reason: outcome.reason,
    ...("remedy" in outcome && outcome.remedy !== undefined ? { remedy: outcome.remedy } : {}), ...notice };
  const { exitCode } = outcome;
  if (outcome.notRunReason !== undefined) return { kind: "unavailable", exitCode, reason: outcome.notRunReason, ...notice };
  if (exitCode === noEvidenceExit) return { kind: "no-evidence", exitCode, ...notice };
  if (exitCode === KILLED_EXIT_CODE) return { kind: "unavailable", exitCode, reason: KILLED_REASON, ...notice };
  return { kind: exitCode === 0 ? "success" : "failure", exitCode, ...notice };
}

/** Preserve completed failures beside incomplete work, requiring complete evidence for success. */
export function reduceCheckInvocationOutcomes(outcomes: readonly NormalizedCheckInvocationOutcome[],
  noEvidenceExit?: number, incompleteWork: readonly string[] = []): CheckInvocationReduction {
  const incomplete = [...incompleteWork];
  const notices = [...new Set(outcomes.flatMap(outcome => outcome.notice === undefined ? [] : [outcome.notice]))];
  const remedies = [...new Set(outcomes.flatMap(outcome => outcome.kind === "unavailable" && outcome.remedy !== undefined ? [outcome.remedy] : []))];
  let failure: number | undefined;
  let success = false;
  for (const outcome of outcomes) {
    if (outcome.kind === "failure") failure = outcome.exitCode;
    if (outcome.kind === "success") success = true;
    if (outcome.kind === "unavailable") incomplete.push(outcome.reason);
  }
  if (failure !== undefined) return { kind: "failure", exitCode: failure, incomplete, remedies, notices };
  if (incomplete.length > 0) return { kind: "unavailable",
    exitCode: outcomes.find(outcome => outcome.kind === "unavailable")?.exitCode ?? 1, incomplete, remedies, notices };
  const noEvidence = outcomes.find(outcome => outcome.kind === "no-evidence")?.exitCode ?? noEvidenceExit;
  return success || noEvidence === undefined ? { kind: "success", exitCode: 0, incomplete, remedies, notices }
    : { kind: "no-evidence", exitCode: noEvidence, incomplete, remedies, notices };
}
