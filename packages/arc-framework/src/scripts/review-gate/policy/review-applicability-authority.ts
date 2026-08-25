/** Shared authority-aware reduction consumed by review request and discharge paths. */

import { canonicalize } from "../../../lib/canonical/canonical-json.js";
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
