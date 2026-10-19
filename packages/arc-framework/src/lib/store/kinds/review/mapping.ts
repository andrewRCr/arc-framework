/** Pure translation of legacy repository review facts to portable records. */
import { collectReviewMappingSources } from "./mapping-listing.js";
import { createReviewMappingWorkItemResolver } from "./mapping-work-items.js";
import { indexReviewMappingSources } from "./mapping-sources.js";
import { mapReviewCandidateSources } from "./mapping-candidates.js";
import { mapReviewOperations } from "./mapping-operations.js";
import { mapReviewBoundarySource } from "./mapping-boundary.js";
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
  const candidates = mapReviewCandidateSources(sources);
  records.push(...candidates.records);
  for (const entry of candidates.listing) sourceListings.set(entry.source, entry);
  for (const source of sources) {
    if (source.kind !== "boundary") continue;
    const mapped = mapReviewBoundarySource(source, { input, outcomes, records, indexed });
    records.push(...mapped.records);
    sourceListings.set(source.source, mapped.listing);
  }
  return { records: coalesceReviewDecisionRecords(records),
    listing: sources.map((source) => sourceListings.get(source.source)
      ?? reviewMappingJoinedSourceListing(source, indexed, outcomes)),
  };
}
