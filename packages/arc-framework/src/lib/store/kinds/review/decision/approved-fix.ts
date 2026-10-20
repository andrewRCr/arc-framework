/** Shared immutable projection for an approved-fix extra pass. */
import type { ConditionalPassAuthorization } from "../../../../../scripts/review-gate/core/operation-state-schema.js";
import type { ReviewDecision } from "./schema.js";

/** Project the original approval-gated authorization identity without storing mutable status. */
export function createApprovedFixReviewDecision(authorization: Pick<ConditionalPassAuthorization,
  "lineage" | "originatingHeadSha" | "lane" | "exhaustedPassCount" | "repositoryId" | "producerId"
  | "dispositionSetId" | "authorizedBy" | "capturedAt">): ReviewDecision {
  return { schemaVersion: 1,
    subject: { lineage: authorization.lineage, headSha: authorization.originatingHeadSha, subjectDigest: null },
    lane: authorization.lane, choice: { kind: "extra-pass", passCount: authorization.exhaustedPassCount,
      precondition: { kind: "approved-fix", repositoryId: authorization.repositoryId, producerId: authorization.producerId,
        dispositionSetId: authorization.dispositionSetId, originatingHeadSha: authorization.originatingHeadSha,
        exhaustedPassCount: authorization.exhaustedPassCount } },
    decidedBy: authorization.authorizedBy, decidedAt: authorization.capturedAt, basis: null };
}
