/** Exact Owner-stop eligibility and disclosure for delivery status continuations. */
import type { z } from "zod";
import type { DeliveryReviewConjunctionMemberSchema, ReviewStatusResult } from "./status.js";
import { DeliveryReviewTerminusAcceptanceActionSchema, type DeliveryReviewTerminusAcceptanceAction }
  from "./policy/delivery-review-terminus.js";

/** Current Candidate and boundary version authorizing one exact member offer. */
export interface DeliveryTerminusOfferBinding {
  readonly workUnitId: string;
  readonly remote?: string;
  readonly expectedBoundaryVersion: string;
  readonly candidateId: string;
  readonly candidateSubjectDigest: string;
}

function hasCompletedCompleteReviewPass(
  member: z.infer<typeof DeliveryReviewConjunctionMemberSchema>,
): boolean {
  return member.progress.completedPasses > 0 && member.progress.attempts.some((attempt) => (
    (attempt.outcome === "clean"
      || attempt.outcome === "findings"
      || attempt.outcome === "settled-findings")
    && (attempt.requestedCoverage === "complete" || attempt.effectiveCoverage === "complete")
  ));
}

/** Project the exact acceptance action only from an eligible delivery continuation. */
export function projectDeliveryTerminusOffer(
  result: ReviewStatusResult,
  binding: DeliveryTerminusOfferBinding,
): DeliveryReviewTerminusAcceptanceAction | undefined {
  const isCeiling = result.nextAction === "obtain-ceiling-override";
  const isBaseMoved = result.state === "base-moved";
  const uncheckedFixes = result.nextAction === "select-coverage"
    || (result.state === "blocked" && result.reason === "material-fix-local-source-unconfigured");
  const isEligibleContinuation = result.nextAction === "review-hosted-request"
    || result.nextAction === "review-local-prepare"
    || result.nextAction === "resolve-review-applicability";
  if (!isCeiling && !isBaseMoved && !uncheckedFixes && !isEligibleContinuation) return undefined;
  const member = result.deliveryCursor?.currentMember;
  if (member === undefined || member === null) {
    if (isCeiling) {
      throw new Error("A delivery-member ceiling stop requires one exact first-outstanding member.");
    }
    return undefined;
  }
  if (!isCeiling && !uncheckedFixes && !hasCompletedCompleteReviewPass(member)) return undefined;
  return DeliveryReviewTerminusAcceptanceActionSchema.parse({
    schemaVersion: 1,
    offer: {
      schemaVersion: 1,
      kind: "delivery-member-owner-terminus",
      workUnitId: binding.workUnitId,
      remote: binding.remote ?? "origin",
      expectedBoundaryVersion: binding.expectedBoundaryVersion,
      candidateId: binding.candidateId,
      candidateSubjectDigest: binding.candidateSubjectDigest,
      target: member.target,
      vehicle: member.vehicle,
      completedPasses: member.progress.completedPasses,
      interactionText: "Accept the standard-review terminus for this exact delivery member without claiming a "
        + "clean or converged pass."
        + (uncheckedFixes ? " The approved material fixes have not been re-examined." : ""),
    },
  });
}

