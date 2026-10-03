/** Shared authority-aware reduction consumed by review request and discharge paths. */

import { canonicalize } from "../../../lib/kernel/canonical/canonical-json.js";
import type { CandidateReviewApplicabilitySelectionV1 } from
  "../../../lib/work-unit/candidate-attestation.js";
import type {
  ReviewContributionApplicabilityResult,
} from "./review-contribution-applicability.js";

type ApplicableProjection = Extract<ReviewContributionApplicabilityResult, { state: "applicable" }>;
type DecisionProjection = Extract<ReviewContributionApplicabilityResult, { state: "decision-required" }>;
type BlockedProjection = Exclude<ReviewContributionApplicabilityResult, ApplicableProjection | DecisionProjection>;

export type ReviewApplicabilityAuthorityResult =
  | {
    readonly state: "applicable";
    readonly authority: "machine";
    readonly projection: ApplicableProjection;
    readonly selection: null;
  }
  | {
    readonly state: "applicable";
    readonly authority: "owner-covered";
    readonly projection: DecisionProjection;
    readonly selection: CandidateReviewApplicabilitySelectionV1;
  }
  | {
    readonly state: "decision-required";
    readonly projection: DecisionProjection;
  }
  | {
    readonly state: "review-required";
    readonly authority: "owner-review-required";
    readonly projection: DecisionProjection;
    readonly selection: CandidateReviewApplicabilitySelectionV1;
  }
  | {
    readonly state: "blocked";
    readonly reason: "classification-blocked" | "selection-conflict";
    readonly projection: BlockedProjection | DecisionProjection;
  };

export type ReviewApplicabilityConsumerAction =
  | "retain-prior-attempt"
  | "request-review"
  | "stop";

/**
 * One Owner selection with the segment from its selected head to the current one.
 *
 * The segment either leaves the contribution unchanged, or is the commit recording the work unit's own
 * Candidate selection, which adds only that record's path to the residual.
 */
export type MechanicallyCarriedReviewApplicabilitySelection =
  | {
    readonly selection: CandidateReviewApplicabilitySelectionV1;
    readonly selectedProjection: DecisionProjection;
    readonly mechanicalProjection: ApplicableProjection;
    readonly ownRecordPath?: undefined;
  }
  | {
    readonly selection: CandidateReviewApplicabilitySelectionV1;
    readonly selectedProjection: DecisionProjection;
    readonly mechanicalProjection: DecisionProjection;
    readonly ownRecordPath: string;
  };

/** Collapse the authority result identically for request and discharge consumers. */
export function reviewApplicabilityConsumerAction(
  result: ReviewApplicabilityAuthorityResult,
): ReviewApplicabilityConsumerAction {
  if (result.state === "applicable") return "retain-prior-attempt";
  if (result.state === "review-required") return "request-review";
  return "stop";
}

/** Reduce factual contribution applicability with only an exact canonical Candidate selection. */
export function reduceReviewApplicabilityAuthority(
  candidateId: string,
  projection: ReviewContributionApplicabilityResult,
  selections: readonly CandidateReviewApplicabilitySelectionV1[],
): ReviewApplicabilityAuthorityResult {
  if (projection.state === "applicable") {
    return { state: "applicable", authority: "machine", projection, selection: null };
  }
  if (projection.state !== "decision-required") {
    return { state: "blocked", reason: "classification-blocked", projection };
  }
  const exact = selections.filter((selection) => (
    selection.candidateId === candidateId
    && canonicalize(selection.selector) === canonicalize(projection.selector)
    && selection.projectionDigest === projection.projectionDigest
    && selection.residualDigest === projection.residualDigest
  ));
  if (exact.length === 0) return { state: "decision-required", projection };
  if (exact.length > 1) return { state: "blocked", reason: "selection-conflict", projection };
  const selection = exact[0];
  if (selection === undefined) return { state: "decision-required", projection };
  return selection.choice === "covered"
    ? { state: "applicable", authority: "owner-covered", projection, selection }
    : { state: "review-required", authority: "owner-review-required", projection, selection };
}

/** Whether the carried segment leaves the current residual exactly what the Owner selected over. */
function carriedSegmentPreservesResidual(
  carried: MechanicallyCarriedReviewApplicabilitySelection,
  projection: DecisionProjection,
): boolean {
  const { selectedProjection, mechanicalProjection, ownRecordPath } = carried;
  if (ownRecordPath === undefined) {
    return mechanicalProjection.contributionChanged === false
      && mechanicalProjection.proof !== "head-unchanged"
      && canonicalize(selectedProjection.paths) === canonicalize(projection.paths);
  }
  // The selection's own record commit adds only the Candidate record to the residual.
  const residual = [...new Set([...selectedProjection.paths, ownRecordPath])].sort();
  return mechanicalProjection.verdict === "clean-divergence"
    && canonicalize(mechanicalProjection.paths) === canonicalize([ownRecordPath])
    && canonicalize(residual) === canonicalize(projection.paths);
}

/** Reduce authority while preserving an exact Owner selection across a separately proved mechanical segment. */
export function reduceReviewApplicabilityAuthorityWithMechanicalCarry(
  candidateId: string,
  projection: ReviewContributionApplicabilityResult,
  selections: readonly CandidateReviewApplicabilitySelectionV1[],
  carried: readonly MechanicallyCarriedReviewApplicabilitySelection[],
): ReviewApplicabilityAuthorityResult {
  const exact = reduceReviewApplicabilityAuthority(candidateId, projection, selections);
  if (projection.state !== "decision-required") return exact;
  if (exact.state !== "decision-required") return exact;
  const matches = carried.filter((entry) => {
    const { selection, selectedProjection, mechanicalProjection } = entry;
    const selected = selection.selector;
    const current = projection.selector;
    const mechanical = mechanicalProjection.selector;
    return selections.some((candidate) => canonicalize(candidate) === canonicalize(selection))
      && selection.candidateId === candidateId
      && canonicalize(selectedProjection.selector) === canonicalize(selected)
      && selectedProjection.projectionDigest === selection.projectionDigest
      && selectedProjection.residualDigest === selection.residualDigest
      && selectedProjection.verdict === projection.verdict
      && selected.repositoryId === current.repositoryId
      && selected.repository === current.repository
      && selected.pullRequest === current.pullRequest
      && selected.sourceId === current.sourceId
      && selected.priorAttemptId === current.priorAttemptId
      && selected.priorHead === current.priorHead
      && selected.priorBase === current.priorBase
      && selected.currentHead === mechanical.priorHead
      && selected.currentBase === mechanical.priorBase
      && mechanical.currentHead === current.currentHead
      && mechanical.currentBase === current.currentBase
      && carriedSegmentPreservesResidual(entry, projection);
  });
  if (matches.length === 0) return exact;
  if (matches.length > 1) {
    return { state: "blocked", reason: "selection-conflict", projection };
  }
  const selection = matches[0]?.selection;
  if (selection === undefined) return exact;
  return selection.choice === "covered"
    ? { state: "applicable", authority: "owner-covered", projection, selection }
    : { state: "review-required", authority: "owner-review-required", projection, selection };
}
