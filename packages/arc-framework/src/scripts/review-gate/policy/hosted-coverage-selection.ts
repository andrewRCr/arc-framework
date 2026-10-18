/** Offer only executable local coverage choices from a proven correction. */
import { canonicalize } from "../../../lib/kernel/index.js";
import type { ReviewNextPassContext } from "./review-next-pass-schema.js";
import { ReviewCoverageSelectionActionSchema, type ReviewCoverageSelectionAction } from "./review-coverage-selection.js";
import { coverageSelectionChoices, type HostedReservationDischarge, type IncrementalCorrectionScopeCandidate } from "./hosted-reservation-support.js";
import type { IncrementalReviewScope } from "../core/incremental-review-scope.js";
import type { DeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import type { StandardReviewObligationProjection } from "./standard-review-projection-schema.js";

/** Request a singleton's proven delta without retaining the earlier review or its source selection. */
export function projectHostedDeltaCheck(input: {
  readonly sources: readonly string[];
  readonly retrigger: StandardReviewObligationProjection["retrigger"];
  readonly nextPassContext?: ReviewNextPassContext;
  readonly currentHeadSha: string;
  readonly vehicle?: DeliveryReviewMemberVehicle;
}): HostedReservationDischarge | null {
  const context = input.nextPassContext;
  if (input.vehicle !== undefined || input.retrigger !== "incremental" || context?.convergence !== "converged"
    || context.responseDue || context.incremental?.basis !== "delta-check"
    || context.incremental.scope.headSha !== input.currentHeadSha || !input.sources.includes("delegated-agent")) return null;
  return { discharged: false, nextSource: "delegated-agent", requestCoverage: "incremental",
    correctionScope: context.incremental.scope,
    detail: "The plain commit requires a local delta check of its proven range." };
}

/** Compose a status-owned choice only for the shared next-pass context's exact proven fix scope. */
export function projectHostedCorrectionCoverageSelection(input: {
  readonly sources: readonly string[];
  readonly nextPassContext?: ReviewNextPassContext;
  readonly scope?: IncrementalReviewScope;
  readonly predecessor: IncrementalCorrectionScopeCandidate;
  readonly completedPasses: number;
  readonly vehicle?: DeliveryReviewMemberVehicle;
}): ReviewCoverageSelectionAction | undefined {
  const basis = input.nextPassContext?.incremental;
  if (input.vehicle === undefined || input.scope === undefined
    || input.nextPassContext?.convergence !== "unconverged" || input.nextPassContext.responseDue
    || !input.sources.includes("delegated-agent") || basis?.basis !== "fix-check"
    || canonicalize(basis.scope) !== canonicalize(input.scope)) return undefined;
  return ReviewCoverageSelectionActionSchema.parse({
    schemaVersion: 1, kind: "review-coverage-selection", workUnitId: input.vehicle.workUnitId,
    sourceId: input.predecessor.sourceId, pass: input.predecessor.logicalPass,
    completedPasses: Math.max(input.completedPasses, input.predecessor.logicalPass), consumedPass: true,
    choices: coverageSelectionChoices(["delegated-agent"], input.scope),
    interactionText: "A local fix check is admitted for the proven correction range. A local complete pass is also admitted; "
      + "it does not replace the fix check. The Owner approves one listed source and coverage pair.",
  });
}

/** Continue inadequate full-final coverage with the ranked complete pass once the look has converged. */
export function projectHostedConvergedComplete(input: {
  readonly sources: readonly string[];
  readonly nextPassContext?: ReviewNextPassContext;
  readonly policyState: string;
}): Partial<Pick<HostedReservationDischarge, "nextSource" | "requestCoverage">> {
  return input.policyState === "coverage-required" && input.nextPassContext?.convergence === "converged"
    && !input.nextPassContext.responseDue
    ? { nextSource: input.sources[0] ?? null, requestCoverage: "complete" } : {};
}

/** Keep the local complete route executable when a settled material response offers no fix-check choice. */
export function projectHostedCorrectionDefault(input: {
  readonly sources: readonly string[];
  readonly nextPassContext?: ReviewNextPassContext;
  readonly selection?: ReviewCoverageSelectionAction;
}): Partial<Pick<HostedReservationDischarge, "nextSource" | "requestCoverage">> {
  if (input.selection !== undefined || input.nextPassContext?.convergence !== "unconverged"
    || input.nextPassContext.responseDue) return {};
  return { nextSource: input.sources.includes("delegated-agent") ? "delegated-agent" : input.sources[0] ?? null,
    requestCoverage: "complete" };
}
