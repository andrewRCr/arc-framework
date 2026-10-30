/** Map native operation files with source-level liveness and in-flight admission. */
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import type { LaneProgressState, FrontlinePhaseState } from "../../../../scripts/review-gate/core/operation-state-schema.js";
import { reviewMappingListingEntry } from "./mapping-listing.js";
import type { createReviewMappingWorkItemResolver } from "./mapping-work-items.js";
import type { ReviewMappingSources } from "./mapping-sources.js";
import { mapReviewAttempt } from "./mapping-outcomes.js";
import { reviewOutcomeKey } from "./outcome/key.js";
import { mapReviewLaneDecisions, mappedReviewDecision } from "./mapping-decisions.js";
import type { MappedReviewOutcome } from "./mapping-source-listing.js";
import type { ReviewMappingResult } from "./mapping-types.js";
import { mapReviewSource } from "./mapping-error.js";

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

function mapSkip(source: string, state: FrontlinePhaseState,
  resolveOwner: ReturnType<typeof createReviewMappingWorkItemResolver>) {
  const lineage = { kind: "candidate" as const, candidateId: state.candidateId };
  const owner = resolveOwner(lineage);
  const records = owner.outcome === "left-behind" ? [] : [mappedReviewDecision(OwnerIdentitySchema.parse({
    type: "work-item", name: owner.workItem.slug, uid: owner.workItem.uid }), { schemaVersion: 1,
    subject: { lineage, headSha: null, subjectDigest: null }, lane: "frontline", choice: { kind: "lane-skip" },
    decidedBy: null, decidedAt: state.updatedAt, basis: null })];
  return { records, listing: reviewMappingListingEntry({ source, records: records.map(({ reference }) => reference),
    leftBehind: owner.outcome === "left-behind" ? [owner.reason] : [] }) };
}

/** Collect ended outcomes and operation decisions before serializing consumption citations. */
export function mapReviewOperations(indexed: ReviewMappingSources,
  resolveOwner: ReturnType<typeof createReviewMappingWorkItemResolver>): {
    outcomes: MappedReviewOutcome[]; records: ReviewMappingResult["records"];
    sourceListings: Map<string, ReviewMappingResult["listing"][number]>;
  } {
  const outcomes: MappedReviewOutcome[] = [];
  const sourceListings = new Map<string, ReviewMappingResult["listing"][number]>();
  const decisions: ReviewMappingResult["records"] = [];
  for (const [source, state] of indexed.operations) {
    if (state.kind === "lane-progress") {
      const mapped = mapReviewSource(source, () => mapLane(source, state, indexed, resolveOwner),
        "the operations, frontline outcomes, and receipts its attempts cite");
      outcomes.push(...mapped.records);
      sourceListings.set(source, mapped.listing);
    } else if (state.kind === "frontline-phase") {
      const mapped = mapReviewSource(source, () => mapSkip(source, state, resolveOwner), "the work units it names");
      decisions.push(...mapped.records);
      sourceListings.set(source, mapped.listing);
    }
  }
  for (const [source, state] of indexed.operations) {
    const listing = sourceListings.get(source);
    if (state.kind !== "lane-progress" || listing?.outcome !== "mapped") continue;
    const mapped = mapReviewSource(source, () => mapReviewLaneDecisions(state, outcomes), "the review outcomes it cites");
    decisions.push(...mapped);
    listing.records.push(...mapped.map(({ reference }) => reference));
  }
  return { outcomes, sourceListings, records: [
    ...outcomes.map(({ reference, outcome }) => ({ reference, contents: [JSON.stringify(outcome)] })), ...decisions] };
}
