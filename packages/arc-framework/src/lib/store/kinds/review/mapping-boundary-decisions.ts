/** Portable choices retained by a legacy integration boundary and its replay. */
import { OwnerIdentitySchema } from "../../identity.js";
import { parseIntegrationBoundaryLocus, type IntegrationBoundaryLocus } from "../../../../scripts/review-gate/policy/integration-boundary-locus.js";
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

/** Preserve decisions under the live boundary's imported work-item identity. */
export function mapReviewBoundaryDecisions(source: Extract<ReviewMappingSource, { kind: "boundary" }>,
  context: { input: ReviewMappingInput; outcomes: readonly MappedReviewOutcome[]; records: ReviewMappingResult["records"] }): ReviewMappingResult["records"] {
  if (!source.workItem.live) return [];
  const boundary = parseIntegrationBoundaryLocus(JSON.parse(source.content));
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: source.workItem.slug, uid: source.workItem.uid });
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
