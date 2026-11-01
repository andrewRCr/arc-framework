/** Attribute shared legacy evidence to the outcomes that retain it. */
import type { RecordReference } from "../../identity.js";
import type { ReviewOutcome } from "./outcome/schema.js";
import type { ReviewMappingSources } from "./mapping-sources.js";
import { reviewMappingListingEntry, type ReviewMappingSource } from "./mapping-listing.js";
import type { ReviewMappingResult } from "./mapping-types.js";

/** Ended outcomes paired with the imported identity that stores them. */
export interface MappedReviewOutcome { reference: RecordReference; outcome: ReviewOutcome }

function workingStateReason(source: ReviewMappingSource, indexed: ReviewMappingSources): string {
  const discarded = indexed.discarded.get(source.source);
  if (discarded !== undefined) return discarded;
  const state = indexed.operations.get(source.source);
  if (state?.kind === "frontline-run") return "Frontline run state is machine-local working state.";
  if (state?.kind === "review-suspension") return "Review suspension is machine-local working state.";
  if (state?.kind === "local-review") return "Local-review operation is working state read only for joins.";
  if (source.source.startsWith("arc/review-gate/quarantine/")) return "Quarantined disposition records are machine-local.";
  if (source.source.startsWith("arc/review-gate/retired/")) return "Retired snapshot of an earlier review store.";
  if (source.source === "arc/review-gate/identity/repository-identity.json") return "Repository identity adopted as the project ID.";
  return "Working state read only for legacy review joins.";
}

/**
 * The listing a frontline outcome with no mapped outcome takes from the lane holding its attempt: that lane's
 * in-flight or not-live reason, or the retired reason when no indexed lane attempt carries its admission.
 */
function unjoinedFrontlineListing(source: string, operationId: string, indexed: ReviewMappingSources,
  listings: ReadonlyMap<string, ReviewMappingResult["listing"][number]>): ReviewMappingResult["listing"][number] {
  for (const [laneSource, state] of indexed.operations) {
    if (state.kind !== "lane-progress"
      || !state.attempts.some(attempt => attempt.frontline?.admission.operationId === operationId)) continue;
    const lane = listings.get(laneSource);
    if (lane?.outcome === "in-flight") {
      return reviewMappingListingEntry({ source, records: [], leftBehind: [], inFlight: `Its frontline attempt is pending in ${laneSource}.` });
    }
    if (lane?.outcome === "left-behind" && lane.reason !== undefined) {
      return reviewMappingListingEntry({ source, records: [], leftBehind: [lane.reason] });
    }
  }
  return reviewMappingListingEntry({ source, records: [],
    leftBehind: ["No current attempt joins this frontline outcome; its attempt was retired."] });
}

/** Account for an evidence file after all lane outcomes have been collected. */
export function reviewMappingJoinedSourceListing(source: ReviewMappingSource, indexed: ReviewMappingSources,
  outcomes: readonly MappedReviewOutcome[],
  listings: ReadonlyMap<string, ReviewMappingResult["listing"][number]>): ReviewMappingResult["listing"][number] {
  const records: RecordReference[] = [];
  const leftBehind: string[] = [];
  const ledger = indexed.receipts.find((item) => item.source === source.source);
  const frontline = indexed.frontline.get(source.source);
  if (ledger !== undefined) {
    for (const receipt of ledger.receipts) {
      const joined = outcomes.find(({ outcome }) => outcome.local?.receipt?.requestId === receipt.requestId);
      if (joined === undefined) leftBehind.push(`Receipt ${receipt.requestId} has no mapped live attempt.`);
      else records.push(joined.reference);
    }
  } else if (frontline !== undefined) {
    const joined = outcomes.find(({ outcome }) => outcome.frontline?.admission.operationId === frontline.operationId);
    if (joined === undefined) return unjoinedFrontlineListing(source.source, frontline.operationId, indexed, listings);
    records.push(joined.reference);
  }
  if (records.length === 0 && leftBehind.length === 0) leftBehind.push(workingStateReason(source, indexed));
  return reviewMappingListingEntry({ source: source.source, records, leftBehind });
}
