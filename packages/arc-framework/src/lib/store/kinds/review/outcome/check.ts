/** Cross-record admission rules for immutable review outcomes. */
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { laneSubjectOwnerMatches } from "../../../../../scripts/review-gate/core/lane-admission.js";
import { checkReviewOutcomeSet } from "./set-rules.js";
import type { ReviewOutcome } from "./schema.js";
import { brokenRule, observeRecords } from "../../rule-support.js";
import { parseReviewOutcome } from "./parser.js";
import { reviewOutcomeKey } from "./key.js";
import { reviewRecordConflict } from "../check-conflicts.js";

/** Check an outcome against its key and every proposed outcome of the same lane owner. */
export async function checkReviewOutcome(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.next === undefined) return [brokenRule("review.outcome.removal", "Review outcomes cannot be removed.",
    "Preserve this outcome; later attempts and decisions cite it.")];
  const value = parseReviewOutcome(input.next.content);
  if (value === null) return [];
  const rules = input.reference.key === reviewOutcomeKey(value) ? [] : [brokenRule("review.outcome.key",
    "The outcome's storage key differs from its stable producer identity.",
    "Store this outcome under the key computed from its attempt or hosted admission.")];
  const observed = await observeRecords(input.after, { family: "review", kind: "review/outcome", owner: input.reference.owner });
  if (observed.status !== "known") return [...rules, brokenRule("review.outcome.complete-listing",
    `Outcome history for ${input.reference.owner.name} (${value.lane}): ${observed.status === "unavailable" ? observed.condition : "could not be enumerated"}`,
    "Restore the complete outcome listing and retry the write.")];
  const outcomes: ReviewOutcome[] = [];
  for (const record of observed.value) {
    const conflict = reviewRecordConflict(record, "review.outcome.complete-listing");
    if (conflict !== null) return [...rules, conflict];
    const parsed = parseReviewOutcome(record.content);
    if (parsed === null) return [...rules, brokenRule("review.outcome.complete-listing",
      `Outcome ${JSON.stringify(record.reference.key)} is malformed and cannot be read.`,
      "Repair the malformed outcome and retry the complete listing.")];
    if (parsed.lane === value.lane && laneSubjectOwnerMatches(parsed.lineage, value.lineage)) outcomes.push(parsed);
  }
  return [...rules, ...checkReviewOutcomeSet(outcomes)];
}
