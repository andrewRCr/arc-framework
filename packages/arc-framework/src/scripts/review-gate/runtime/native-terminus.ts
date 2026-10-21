/** Resolve stored native termini without inventing their author or pass-count provenance. */
import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import type { ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import type { PublishedIntegrationBoundaryLocus } from "../policy/integration-boundary-locus.js";
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

/** Bind only a boundary naming this exact current Candidate subject to its retained decision. */
export function nativeBoundaryTerminusReference(boundary: PublishedIntegrationBoundaryLocus | null | undefined,
  subject: ReviewDecision["subject"]): { decisionKey?: CanonicalDigest; carriedBoundary?: PublishedIntegrationBoundaryLocus } {
  if (boundary?.schemaVersion !== 2 || boundary.terminus === null || boundary.candidateSubjectDigest === null
    || subject.lineage.kind !== "candidate"
    || boundary.candidateId !== subject.lineage.candidateId || boundary.candidateSubjectDigest !== subject.subjectDigest) return {};
  return { decisionKey: boundary.terminus, carriedBoundary: boundary };
}

function carriedSubject(input: { subject: ReviewDecision["subject"]; decisionKey?: CanonicalDigest;
  carriedBoundary?: PublishedIntegrationBoundaryLocus }, decisions: readonly ReviewDecision[]): ReviewDecision["subject"] | undefined {
  const reference = nativeBoundaryTerminusReference(input.carriedBoundary, input.subject);
  if (reference.decisionKey === undefined || reference.decisionKey !== input.decisionKey) return undefined;
  return decisions.find(value => reviewDecisionKey(value) === reference.decisionKey
    && value.choice.kind === "terminus" && value.lane === "standard" && value.subject.lineage.kind === "candidate")?.subject;
}

/** Read live terminus authority on the exact subject or through its retained native boundary. */
export async function resolveNativeReviewTerminus(input: {
  facts: Pick<NativeReviewFactPorts, "decisions">;
  subject: ReviewDecision["subject"];
  decisionKey?: CanonicalDigest;
  carriedBoundary?: PublishedIntegrationBoundaryLocus;
}): Promise<NativeOwnerAcceptedReviewTerminus | undefined> {
  const listing = await input.facts.decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  const decisions = listing.records.map(({ value }) => value);
  const withdrawn = new Set(decisions.flatMap(value => value.choice.kind === "withdrawal" ? [value.choice.decisionKey] : []));
  const carried = carriedSubject(input, decisions);
  const newest = decisions.filter(value => reaches(value, input.subject) || (carried !== undefined && reaches(value, carried)))
    .sort(newestFirst)[0];
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
