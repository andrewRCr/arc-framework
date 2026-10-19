/** Pure translation of legacy repository review facts to portable records. */
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import { collectReviewMappingSources, reviewMappingListingEntry } from "./mapping-listing.js";
import { createReviewMappingWorkItemResolver } from "./mapping-work-items.js";
import { indexReviewMappingSources, type ReviewMappingSources } from "./mapping-sources.js";
import { mapReviewAttempt } from "./mapping-outcomes.js";
import { reviewOutcomeKey } from "./outcome/key.js";
import { reviewMappingJoinedSourceListing, type MappedReviewOutcome } from "./mapping-source-listing.js";
import type { LaneProgressState } from "../../../../scripts/review-gate/core/operation-state-schema.js";
import type { ReviewMappingInput, ReviewMappingResult } from "./mapping-types.js";

function mapLane(source: string, state: LaneProgressState, indexed: ReviewMappingSources,
  resolveOwner: ReturnType<typeof createReviewMappingWorkItemResolver>): {
    records: MappedReviewOutcome[]; listing: ReviewMappingResult["listing"][number];
  } {
  const laneOwner = resolveOwner(state.lineage);
  if (laneOwner.outcome === "left-behind") return { records: [],
    listing: reviewMappingListingEntry({ source, records: [], leftBehind: [laneOwner.reason] }) };
  if (state.attempts.some((attempt) => attempt.outcome === "pending")) return { records: [],
    listing: reviewMappingListingEntry({ source, records: [], leftBehind: [], inFlight: "A live review attempt is pending." }) };
  const leftBehind: string[] = [];
  const records: MappedReviewOutcome[] = [];
  for (const [index, attempt] of state.attempts.entries()) {
    const endedAt = index === state.attempts.length - 1 ? state.updatedAt
      : new Date(Date.parse(state.updatedAt) - state.attempts.length + index + 1).toISOString();
    const outcome = mapReviewAttempt(attempt, state, endedAt, indexed);
    const owner = resolveOwner(outcome.lineage);
    if (owner.outcome === "left-behind") { leftBehind.push(owner.reason); continue; }
    const identity = OwnerIdentitySchema.parse({ type: "work-item", name: owner.workItem.slug, uid: owner.workItem.uid });
    records.push({ reference: recordReferences["review/outcome"](identity, reviewOutcomeKey(outcome)), outcome });
  }
  return { records, listing: reviewMappingListingEntry({ source,
    records: records.map(({ reference }) => reference), leftBehind }) };
}

/** Map supplied review bytes without reading or writing repository state. */
export function mapReviewRecords(input: ReviewMappingInput): ReviewMappingResult {
  const sources = collectReviewMappingSources(input);
  const indexed = indexReviewMappingSources(sources, input.projectId);
  const resolveOwner = createReviewMappingWorkItemResolver(input);
  const outcomes: MappedReviewOutcome[] = [];
  const laneListings = new Map<string, ReviewMappingResult["listing"][number]>();
  for (const [source, state] of indexed.operations) {
    if (state.kind !== "lane-progress") continue;
    const mapped = mapLane(source, state, indexed, resolveOwner);
    outcomes.push(...mapped.records);
    laneListings.set(source, mapped.listing);
  }
  return {
    records: outcomes.map(({ reference, outcome }) => ({ reference, contents: [JSON.stringify(outcome)] })),
    listing: sources.map((source) => laneListings.get(source.source)
      ?? reviewMappingJoinedSourceListing(source, indexed, outcomes)),
  };
}
