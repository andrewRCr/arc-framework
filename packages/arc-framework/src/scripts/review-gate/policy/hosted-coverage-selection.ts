/** Offer only executable local coverage choices from a proven correction. */
import { canonicalize } from "../../../lib/kernel/index.js";
import type { ReviewNextPassContext } from "./review-next-pass-schema.js";
import { ReviewCoverageSelectionActionSchema, type ReviewCoverageSelectionAction } from "./review-coverage-selection.js";
import { coverageSelectionChoices, type HostedReservationDischarge, type IncrementalCorrectionScopeCandidate } from "./hosted-reservation-support.js";
import type { IncrementalReviewScope } from "../core/incremental-review-scope.js";
import type { DeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import { reviewStatusRouteCommand, type ReviewStatusRoute } from "../status-route.js";

/** Compose a status-owned choice only for the shared next-pass context's exact proven fix scope. */
export function projectHostedCorrectionCoverageSelection(input: {
  readonly sources: readonly string[];
  readonly nextPassContext?: ReviewNextPassContext;
  readonly scope?: IncrementalReviewScope;
  readonly predecessor: IncrementalCorrectionScopeCandidate;
  readonly completedPasses: number;
  readonly vehicle?: DeliveryReviewMemberVehicle;
  readonly statusRoute?: ReviewStatusRoute;
}): ReviewCoverageSelectionAction | undefined {
  const basis = input.nextPassContext?.incremental;
  const statusRoute = input.statusRoute;
  if (input.vehicle === undefined || statusRoute === undefined || input.scope === undefined
    || !input.sources.includes("delegated-agent") || basis?.basis !== "fix-check"
    || canonicalize(basis.scope) !== canonicalize(input.scope)) return undefined;
  const command = (coverage: string) => reviewStatusRouteCommand(statusRoute,
    ["--source", "delegated-agent", "--coverage", coverage]);
  return ReviewCoverageSelectionActionSchema.parse({
    schemaVersion: 1, kind: "review-coverage-selection", workUnitId: input.vehicle.workUnitId,
    sourceId: input.predecessor.sourceId, pass: input.predecessor.logicalPass,
    completedPasses: Math.max(input.completedPasses, input.predecessor.logicalPass), consumedPass: true,
    choices: coverageSelectionChoices(["delegated-agent"], input.scope),
    interactionText: "Select one listed source and coverage pair. For a fix check, re-run "
      + `\`${command("incremental")}\`; for a complete pass, re-run \`${command("complete")}\`.`,
  });
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
