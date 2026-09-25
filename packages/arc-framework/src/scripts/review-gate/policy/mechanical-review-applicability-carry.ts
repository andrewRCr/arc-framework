/** Validate a Candidate selection and its mechanically unchanged extension. */

import type { CandidateReviewApplicabilitySelectionV1 } from
  "../../../lib/work-unit/candidate-attestation.js";
import type {
  ReviewContributionApplicabilityResult,
  ReviewContributionApplicabilitySelector,
} from "./review-contribution-applicability.js";
import type { MechanicallyCarriedReviewApplicabilitySelection } from
  "./review-applicability-authority.js";

type DecisionProjection = Extract<ReviewContributionApplicabilityResult, { state: "decision-required" }>;

function sameSelectorOwner(
  selected: ReviewContributionApplicabilitySelector,
  current: ReviewContributionApplicabilitySelector,
): boolean {
  return selected.repositoryId === current.repositoryId
    && selected.repository === current.repository
    && selected.pullRequest === current.pullRequest
    && selected.sourceId === current.sourceId
    && selected.priorAttemptId === current.priorAttemptId
    && selected.priorHead === current.priorHead
    && selected.priorBase === current.priorBase;
}

function sameVehicle(
  selected: ReviewContributionApplicabilitySelector["currentVehicle"],
  current: ReviewContributionApplicabilitySelector["currentVehicle"],
): boolean {
  if (selected === undefined || current === undefined) return selected === current;
  return selected.planId === current.planId
    && selected.deliverableId === current.deliverableId
    && selected.workUnitId === current.workUnitId;
}

/** Reproject both legs; the reducer checks their exact identity, digest, and contribution equivalence. */
export async function projectMechanicalReviewApplicabilityCarry(input: {
  readonly candidateId: string;
  readonly projection: DecisionProjection;
  readonly selections: readonly CandidateReviewApplicabilitySelectionV1[];
  readonly projectSelector: (
    selector: ReviewContributionApplicabilitySelector,
  ) => Promise<ReviewContributionApplicabilityResult>;
}): Promise<MechanicallyCarriedReviewApplicabilitySelection[]> {
  const current = input.projection.selector;
  const projected = await Promise.all(input.selections.map(async (selection) => {
    const selected = selection.selector;
    if (selection.candidateId !== input.candidateId
      || !sameSelectorOwner(selected, current)
      || (selected.currentHead === current.currentHead
        && selected.currentBase === current.currentBase)
      || !sameVehicle(selected.currentVehicle, current.currentVehicle)) return null;
    const selectedVehicle = selected.currentVehicle;
    const currentVehicle = current.currentVehicle;
    const selectedProjection = await input.projectSelector(selected);
    const mechanicalProjection = await input.projectSelector({
      ...current,
      priorHead: selected.currentHead,
      priorBase: selected.currentBase,
      ...(selectedVehicle === undefined || currentVehicle === undefined
        ? {}
        : { priorVehicle: selectedVehicle, currentVehicle }),
    });
    return selectedProjection.state === "decision-required"
      && mechanicalProjection.state === "applicable"
      ? { selection, selectedProjection, mechanicalProjection }
      : null;
  }));
  return projected.filter((value) => value !== null);
}
