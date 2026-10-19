/** Canonical review-progress binding for publication readiness. */
import { canonicalDigest, sortByCanonicalBytes, type CanonicalDigest } from "../../../../kernel/index.js";
import { laneSubjectOwner, type LaneSubjectOwner } from "../../../../../scripts/review-gate/core/lane-admission.js";
import type { ListingOutcome } from "../../../read.js";
import { parseReviewOutcome } from "../outcome/parser.js";
import { reviewOutcomeKey } from "../outcome/key.js";
import { parseReviewEvidence } from "../evidence/parser.js";
import { parseReviewDecision } from "../decision/parser.js";
import { reviewDecisionKey } from "../decision/key.js";

/** Identity-bearing portion of a pending attempt; the entire supplied state is hashed. */
export interface ReadinessInFlightAttempt {
  attemptId: string;
  hosted?: { admission: { admissionId: string } };
}
export interface ReviewReadinessInput {
  outcomes: ListingOutcome;
  evidence: ListingOutcome;
  decisions: ListingOutcome;
  subjectOwner: LaneSubjectOwner;
  inFlight: readonly ReadinessInFlightAttempt[];
}
export type ReviewReadinessBinding = { status: "complete"; digest: CanonicalDigest }
  | { status: "incomplete"; condition: string };

/** Select standard-lane progress for one subject owner without backend-version dependence. */
export function deriveReviewReadinessBinding(input: ReviewReadinessInput): ReviewReadinessBinding {
  try {
    const outcomes = readListing(input.outcomes, "review/outcome", parseReviewOutcome, reviewOutcomeKey)
      .filter(({ value }) => value.lane === "standard"
        && canonicalDigest(laneSubjectOwner(value.lineage)) === canonicalDigest(input.subjectOwner));
    const outcomeKeys = new Set(outcomes.map(({ key }) => key));
    const evidence = readListing(input.evidence, "review/evidence", parseReviewEvidence, (value) => value.dispositionSet.dispositionSetId)
      .filter(({ value }) => outcomeKeys.has(value.result.outcomeKey));
    const decisions = readListing(input.decisions, "review/decision", parseReviewDecision, reviewDecisionKey);
    const grants = decisions.filter(({ value }) => value.lane === "standard"
      && canonicalDigest(laneSubjectOwner(value.subject.lineage)) === canonicalDigest(input.subjectOwner)
      && value.choice.kind === "extra-pass" && value.choice.precondition.kind === "approved-fix");
    const grantKeys = new Set(grants.map(({ key }) => key));
    const withdrawals = decisions.filter(({ value }) => value.choice.kind === "withdrawal" && grantKeys.has(value.choice.decisionKey));
    const endedAttempts = new Set(outcomes.map(({ value }) => value.attemptId));
    const endedAdmissions = new Set(outcomes.flatMap(({ value }) => value.hosted === undefined ? [] : [value.hosted.admission.admissionId]));
    const inFlight = input.inFlight.filter((attempt) => !endedAttempts.has(attempt.attemptId)
      && (attempt.hosted === undefined || !endedAdmissions.has(attempt.hosted.admission.admissionId)))
      .map((attempt) => ({ attemptId: attempt.attemptId, digest: canonicalDigest(attempt) }));
    return { status: "complete", digest: canonicalDigest({ domain: "arc.review.readiness/v1",
      outcomes: bindingEntries(outcomes), evidence: bindingEntries(evidence),
      decisions: bindingEntries([...grants, ...withdrawals]), inFlight: sortByCanonicalBytes(inFlight) }) };
  } catch (error) {
    return { status: "incomplete", condition: error instanceof Error ? error.message : String(error) };
  }
}

interface BindingRecord<T> { key: string; digest: CanonicalDigest; value: T }

function bindingEntries(records: readonly BindingRecord<unknown>[]) {
  return sortByCanonicalBytes(records.map(({ key, digest }) => ({ key, digest })));
}

function readListing<T>(listing: ListingOutcome, kind: string, parse: (content: string) => T | null,
  keyOf: (value: T) => string): BindingRecord<T>[] {
  if (listing.status === "absent") return [];
  if (listing.status === "unreadable") throw new Error(`${kind}: ${listing.condition}`);
  if (listing.missed || listing.diagnostics.length > 0) throw new Error(`${kind}: incomplete listing`);
  const keys = new Set<string>();
  return listing.records.map((record) => {
    const value = parse(record.content), key = record.reference.key;
    if (value === null || record.reference.kind !== kind || typeof key !== "string"
      || key !== keyOf(value) || keys.has(key)) throw new Error(`${kind}: invalid content or duplicate/mismatched key`);
    keys.add(key);
    return { key, value, digest: canonicalDigest(JSON.parse(record.content) as unknown) };
  });
}
