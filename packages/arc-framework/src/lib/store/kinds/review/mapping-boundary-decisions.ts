/** Portable choices retained by a legacy integration boundary and its replay. */
import type { OwnerIdentity } from "../../identity.js";
import type { IntegrationBoundaryLocus } from "../../../../scripts/review-gate/policy/integration-boundary-locus.js";
import { mappingTerminusPassCount } from "./mapping-terminus-count.js";
import type { ReviewMappingInput } from "./mapping-types.js";
import type { MappedReviewOutcome } from "./mapping-source-listing.js";
import { mapReviewReplayDecisions } from "./mapping-replay-decisions.js";
import { mappedReviewDecision, coalesceReviewDecisionRecords } from "./mapping-decisions.js";
import type { ReviewMappingSource } from "./mapping-listing.js";
import type { ReviewMappingResult } from "./mapping-types.js";
import type { OwnerAcceptedReviewTerminus } from "../../../../scripts/review-gate/policy/review-terminus.js";
import type { DeliveryReviewMemberVehicle } from "../../../delivery/review-vehicle.js";
import type { ReviewDecision } from "./decision/schema.js";

/** Preserve a live boundary's decisions, parsed by its caller, under the boundary's imported work item. */
export function mapReviewBoundaryDecisions(source: Extract<ReviewMappingSource, { kind: "boundary" }>,
  boundary: IntegrationBoundaryLocus, owner: OwnerIdentity,
  context: { input: ReviewMappingInput; outcomes: readonly MappedReviewOutcome[]; records: ReviewMappingResult["records"] }): ReviewMappingResult["records"] {
  const decisions: ReviewDecision[] = mapReviewReplayDecisions(boundary, () =>
    mappingTerminusPassCount(source, boundary, context.input, context.outcomes, context.records));
  const termini = mappingBoundaryTermini(boundary);
  if (termini.candidate !== null) decisions.push(termini.candidate);
  decisions.push(...termini.members.map(({ decision }) => decision));
  return coalesceReviewDecisionRecords(decisions.map((decision) => mappedReviewDecision(owner, decision)));
}

function terminusDecision(subject: ReviewDecision["subject"], terminus: OwnerAcceptedReviewTerminus): ReviewDecision {
  return { schemaVersion: 1, subject, lane: "standard", choice: { kind: "terminus" },
    decidedBy: terminus.acceptedBy, decidedAt: null, basis: { passCount: terminus.completedPasses } };
}

/** Construct the exact stored termini once for both decision records and boundary references. */
export function mappingBoundaryTermini(boundary: IntegrationBoundaryLocus): {
  candidate: ReviewDecision | null; members: { vehicle: DeliveryReviewMemberVehicle; decision: ReviewDecision }[];
} {
  return { candidate: boundary.terminus === null ? null : terminusDecision({
    lineage: { kind: "candidate", candidateId: boundary.candidateId }, headSha: null,
    subjectDigest: boundary.candidateSubjectDigest }, boundary.terminus),
  members: boundary.deliveryReviewTermini.map(({ vehicle, terminus }) => {
    const { head, ...lineage } = vehicle;
    return { vehicle, decision: terminusDecision({ lineage, headSha: head, subjectDigest: null }, terminus) };
  }) };
}
