/** Stable content identities for immutable review decisions. */
import { canonicalDigest, type CanonicalDigest } from "../../../../kernel/index.js";
import { computeConditionalPassAuthorizationId } from "../../../../../scripts/review-gate/core/operation-state-schema.js";
import { ReviewDecisionSchema, type ReviewDecision } from "./schema.js";

/** Key one decision independently of recording time, preserving approved-fix authorization identity. */
export function reviewDecisionKey(input: ReviewDecision): CanonicalDigest {
  const value = ReviewDecisionSchema.parse(input);
  const choice = value.choice;
  if (choice.kind === "extra-pass" && choice.precondition.kind === "approved-fix") {
    const precondition = choice.precondition;
    if (value.decidedBy === null) throw new Error("approved-fix decisions require their original authorizer");
    return computeConditionalPassAuthorizationId({ authorizedBy: value.decidedBy, repositoryId: precondition.repositoryId,
      lane: value.lane, lineage: value.subject.lineage, producerId: precondition.producerId,
      dispositionSetId: precondition.dispositionSetId, originatingHeadSha: precondition.originatingHeadSha,
      exhaustedPassCount: precondition.exhaustedPassCount, nextPass: precondition.exhaustedPassCount + 1 });
  }
  return canonicalDigest({ domain: "arc.review.decision/v1", decision: { subject: value.subject, lane: value.lane,
    choice: value.choice, decidedBy: value.decidedBy, basis: value.basis } });
}
