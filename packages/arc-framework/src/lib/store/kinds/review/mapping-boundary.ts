/** Convert legacy publication boundaries while preserving their continuation locus. */
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import { parseIntegrationBoundaryLocus } from
  "../../../../scripts/review-gate/policy/integration-boundary-locus.js";
import { mapBoundaryPostAttestContinuation, mapReviewBoundaryAction } from "./mapping-boundary-actions.js";
import { mapReviewReadinessBinding } from "./mapping-readiness.js";
import { reviewDecisionKey } from "./decision/key.js";
import { mapReviewBoundaryDecisions, mappingBoundaryTermini } from "./mapping-boundary-decisions.js";
import { reviewMappingListingEntry, type ReviewMappingSource } from "./mapping-listing.js";
import type { ReviewMappingInput, ReviewMappingResult } from "./mapping-types.js";
import type { MappedReviewOutcome } from "./mapping-source-listing.js";
import type { ReviewMappingSources } from "./mapping-sources.js";

/** Shared imported records and native operation facts used by boundary conversion. */
export interface ReviewMappingBoundaryContext {
  input: ReviewMappingInput; outcomes: readonly MappedReviewOutcome[];
  records: ReviewMappingResult["records"]; indexed: ReviewMappingSources;
}

/** Map one live boundary and list every record contributed by its continuation. */
export function mapReviewBoundarySource(source: Extract<ReviewMappingSource, { kind: "boundary" }>,
  context: ReviewMappingBoundaryContext): { records: ReviewMappingResult["records"]; listing: ReviewMappingResult["listing"][number] } {
  if (!source.workItem.live) return { records: [], listing: reviewMappingListingEntry({ source: source.source,
    records: [], leftBehind: ["No live work item owns this review fact."] }) };
  const boundary = parseIntegrationBoundaryLocus(JSON.parse(source.content));
  const workItem = OwnerIdentitySchema.parse({ type: "work-item", name: source.workItem.slug, uid: source.workItem.uid });
  const owner = { repositoryId: context.input.projectId, workItem };
  const records = mapReviewBoundaryDecisions(source, boundary, workItem, context);
  const termini = mappingBoundaryTermini(boundary);
  const value: Record<string, unknown> = { ...boundary, schemaVersion: 2,
    terminus: termini.candidate === null ? null : reviewDecisionKey(termini.candidate),
    deliveryReviewTermini: termini.members.map(({ vehicle, decision }) => ({ vehicle, terminus: reviewDecisionKey(decision) })),
    nextAction: mapReviewBoundaryAction(boundary.nextAction, boundary.workUnit, context.outcomes, owner) };
  delete value.policy;
  delete value.standardLaneOwnerVersion;
  if ("postAttestContinuation" in boundary && boundary.postAttestContinuation !== undefined) {
    value.postAttestContinuation = mapBoundaryPostAttestContinuation(boundary.postAttestContinuation, boundary.workUnit, context.outcomes, owner);
  }
  if (boundary.locus === "candidate-publish-ready" || boundary.locus === "publication-pending") value.readinessBinding = mapReviewReadinessBinding(source, boundary, { ...context, records: [...context.records, ...records] });
  records.push({ reference: recordReferences["review/integration-boundary"](workItem), contents: [JSON.stringify(value)] });
  return { records, listing: reviewMappingListingEntry({ source: source.source,
    records: records.map(({ reference }) => reference), leftBehind: [] }) };
}
