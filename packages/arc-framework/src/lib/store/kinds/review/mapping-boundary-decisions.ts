/** Portable choices retained by a legacy integration boundary and its replay. */
import { OwnerIdentitySchema } from "../../identity.js";
import { parseIntegrationBoundaryLocus } from "../../../../scripts/review-gate/policy/integration-boundary-locus.js";
import { mappingTerminusPassCount } from "./mapping-terminus-count.js";
import type { ReviewMappingInput } from "./mapping-types.js";
import type { MappedReviewOutcome } from "./mapping-source-listing.js";
import { mapReviewReplayDecisions } from "./mapping-replay-decisions.js";
import { mappedReviewDecision, coalesceReviewDecisionRecords } from "./mapping-decisions.js";
import type { ReviewMappingSource } from "./mapping-listing.js";
import type { ReviewMappingResult } from "./mapping-types.js";
import type { ReviewDecision } from "./decision/schema.js";

/** Preserve decisions under the live boundary's imported work-item identity. */
export function mapReviewBoundaryDecisions(source: Extract<ReviewMappingSource, { kind: "boundary" }>,
  context: { input: ReviewMappingInput; outcomes: readonly MappedReviewOutcome[]; records: ReviewMappingResult["records"] }): ReviewMappingResult["records"] {
  if (!source.workItem.live) return [];
  const boundary = parseIntegrationBoundaryLocus(JSON.parse(source.content));
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: source.workItem.slug, uid: source.workItem.uid });
  const decisions: ReviewDecision[] = mapReviewReplayDecisions(boundary, () =>
    mappingTerminusPassCount(source, boundary, context.input, context.outcomes, context.records));
  if (boundary.terminus !== null) decisions.push({ schemaVersion: 1,
    subject: { lineage: { kind: "candidate", candidateId: boundary.candidateId },
      headSha: null, subjectDigest: boundary.candidateSubjectDigest },
    lane: "standard", choice: { kind: "terminus" }, decidedBy: boundary.terminus.acceptedBy, decidedAt: null,
    basis: { passCount: boundary.terminus.completedPasses } });
  for (const { vehicle, terminus } of boundary.deliveryReviewTermini) {
    const { head, ...lineage } = vehicle;
    decisions.push({ schemaVersion: 1, subject: { lineage, headSha: head, subjectDigest: null },
      lane: "standard", choice: { kind: "terminus" }, decidedBy: terminus.acceptedBy, decidedAt: null,
      basis: { passCount: terminus.completedPasses } });
  }
  return coalesceReviewDecisionRecords(decisions.map((decision) => mappedReviewDecision(owner, decision)));
}
