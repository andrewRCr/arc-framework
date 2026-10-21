/** Resolve stored native termini without inventing their author or pass-count provenance. */
import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import type { ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import type { NativeReviewFactPorts } from "../core/ports.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import { NativeOwnerAcceptedReviewTerminusSchema, type NativeOwnerAcceptedReviewTerminus } from "../policy/review-terminus.js";

function reaches(value: ReviewDecision, subject: ReviewDecision["subject"]): boolean {
  if (value.choice.kind !== "terminus" || value.lane !== "standard"
    || !laneSubjectOwnerMatches(value.subject.lineage, subject.lineage)) return false;
  return value.subject.lineage.kind === "candidate"
    ? value.subject.subjectDigest === subject.subjectDigest
    : value.subject.headSha === subject.headSha;
}

function newestFirst(left: ReviewDecision, right: ReviewDecision): number {
  const a = left.decidedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(left.decidedAt);
  const b = right.decidedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(right.decidedAt);
  if (a !== b) return a < b ? 1 : -1;
  return reviewDecisionKey(right).localeCompare(reviewDecisionKey(left));
}

/** Read the latest terminus only while it remains live within the selected owner's exact subject reach. */
export async function resolveNativeReviewTerminus(input: {
  facts: Pick<NativeReviewFactPorts, "decisions">;
  subject: ReviewDecision["subject"];
  decisionKey?: CanonicalDigest;
}): Promise<NativeOwnerAcceptedReviewTerminus | undefined> {
  const listing = await input.facts.decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  const decisions = listing.records.map(({ value }) => value);
  const withdrawn = new Set(decisions.flatMap(value => value.choice.kind === "withdrawal" ? [value.choice.decisionKey] : []));
  const newest = decisions.filter(value => reaches(value, input.subject)).sort(newestFirst)[0];
  const selected = newest === undefined || withdrawn.has(reviewDecisionKey(newest)) ? undefined : newest;
  if (input.decisionKey !== undefined && (selected === undefined || reviewDecisionKey(selected) !== input.decisionKey)) {
    throw new Error("The native review terminus reference is missing, withdrawn, superseded, or outside this subject's reach. "
      + "Restore the live terminus key on the selected owner and subject, then retry.");
  }
  if (selected === undefined) return undefined;
  return NativeOwnerAcceptedReviewTerminusSchema.parse({ schemaVersion: 2, semanticsVersion: "review-terminus/v2",
    kind: "owner-accepted", lane: "standard", decisionKey: reviewDecisionKey(selected),
    acceptedBy: selected.decidedBy, completedPasses: selected.basis?.passCount });
}
