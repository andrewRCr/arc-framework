/** Pure translation of legacy repository review facts to portable records. */
import { collectReviewMappingSources, reviewMappingListingEntry } from "./mapping-listing.js";
import { createReviewMappingWorkItemResolver } from "./mapping-work-items.js";
import { indexReviewMappingSources } from "./mapping-sources.js";
import { mapReviewOperations } from "./mapping-operations.js";
import { mapReviewBoundaryDecisions } from "./mapping-boundary-decisions.js";
import { coalesceReviewDecisionRecords } from "./mapping-decisions.js";
import { mapReviewEvidenceSource } from "./mapping-evidence.js";
import { reviewMappingJoinedSourceListing } from "./mapping-source-listing.js";
import type { ReviewMappingInput, ReviewMappingResult } from "./mapping-types.js";

/** Map supplied review bytes without reading or writing repository state. */
export function mapReviewRecords(input: ReviewMappingInput): ReviewMappingResult {
  const sources = collectReviewMappingSources(input);
  const indexed = indexReviewMappingSources(sources, input.projectId);
  const resolveOwner = createReviewMappingWorkItemResolver(input);
  const { outcomes, records, sourceListings } = mapReviewOperations(indexed, resolveOwner);
  for (const source of sources) {
    const evidence = mapReviewEvidenceSource(source, input.projectId, outcomes, indexed);
    if (evidence === null) continue;
    records.push(...evidence.records);
    sourceListings.set(source.source, evidence.listing);
  }
  for (const source of sources) {
    if (source.kind !== "boundary") continue;
    const mapped = mapReviewBoundaryDecisions(source, { input, outcomes, records });
    records.push(...mapped);
    sourceListings.set(source.source, reviewMappingListingEntry({ source: source.source,
      records: mapped.map(({ reference }) => reference),
      leftBehind: source.workItem.live ? [] : ["No live work item owns this review fact."] }));
  }
  return { records: coalesceReviewDecisionRecords(records),
    listing: sources.map((source) => sourceListings.get(source.source)
      ?? reviewMappingJoinedSourceListing(source, indexed, outcomes)),
  };
}
