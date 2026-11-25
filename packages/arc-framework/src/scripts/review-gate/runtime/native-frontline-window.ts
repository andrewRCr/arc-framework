/** Immutable skip decisions close the selected vehicle's opening frontline window. */
import type { ReviewLaneJudgment } from "../policy/review-policy-driver.js";
import { resolveIdentity } from "../../../lib/git/identity.js";
import { readCandidateRecord } from "../../../lib/store/kinds/review/candidate/access.js";
import { ReviewDecisionSchema, type ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import { laneSubjectOwnerMatches, type LaneSubjectLineage } from "../core/lane-admission.js";
import type { NativeReviewFactPorts } from "../core/ports.js";
import type { ReviewInvocationInput } from "./invocation.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ConfirmResponseHeadContinuation } from "../core/response-head-continuation.js";
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";
import { requireReviewWorkItem } from "../../../lib/store/kinds/review/access-shared.js";

/** Bind the native skip writer only when this invocation selected native facts. */
export function createNativeFrontlineSkipRecorder(invocation: ReviewInvocationInput, facts?: NativeReviewFactPorts):
  ((lineage: LaneSubjectLineage, target: ReviewTarget) => Promise<void>) | undefined {
  if (facts === undefined) return undefined;
  return (lineage, target) => recordNativeFrontlineSkip({ invocation, facts, lineage,
    repositoryId: target.repositoryId, headSha: target.headSha, targetDigest: target.targetId, now: new Date().toISOString() });
}

/** Record the actual selected subject and active identity without adding owner authorization. */
export async function recordNativeFrontlineSkip(input: {
  invocation: ReviewInvocationInput;
  facts: NativeReviewFactPorts;
  repositoryId: string;
  lineage: LaneSubjectLineage;
  headSha: string;
  targetDigest?: string;
  now: string;
}): Promise<void> {
  if (await input.facts.readProjectId() !== input.repositoryId) {
    throw new Error("Restore the review subject's project identity before recording its frontline skip.");
  }
  const decidedBy = await resolveIdentity({ exec: (command, args, options) =>
    input.invocation.exec(command, args, { ...options, cwd: input.invocation.cwd }) });
  let subjectDigest = input.targetDigest;
  if (input.lineage.kind === "candidate") {
    const owner = requireReviewWorkItem(input.invocation.workItem, "A native frontline skip");
    const candidate = await readCandidateRecord(input.invocation.cwd, owner.name, {
      ...input.invocation, owner,
    });
    if (candidate?.attestation.candidateId !== input.lineage.candidateId) {
      throw new Error("Restore the selected Candidate before recording its frontline skip.");
    }
    subjectDigest = candidate.subject.subjectDigest;
  }
  if (subjectDigest === undefined) throw new Error("Resolve the review target before recording its frontline skip.");
  const value = ReviewDecisionSchema.parse({ schemaVersion: 1, lane: "frontline", choice: { kind: "lane-skip" },
    subject: { lineage: input.lineage, headSha: input.headSha, subjectDigest }, decidedBy, decidedAt: input.now, basis: null });
  if (await input.facts.decisions.read(reviewDecisionKey(value)) === null) await input.facts.decisions.create(value);
}

/** Read complete selected-owner decisions across the supplied validated lineage reach. */
export async function nativeFrontlineWindowSkipped(facts: NativeReviewFactPorts, input: {
  repositoryId: string; lineages: readonly LaneSubjectLineage[];
}): Promise<boolean> {
  if (await facts.readProjectId() !== input.repositoryId) {
    throw new Error("Restore the review subject's project identity before reading its frontline window.");
  }
  const listing = await facts.decisions.list();
  if (listing.status !== "complete") throw reviewFactListingError(listing);
  const withdrawn = new Set(listing.records.flatMap(({ value }) => value.choice.kind === "withdrawal" ? [value.choice.decisionKey] : []));
  const latest = listing.records.map(({ value }) => value).filter(value => value.lane === "frontline"
    && value.choice.kind === "lane-skip"
    && input.lineages.some(lineage => laneSubjectOwnerMatches(value.subject.lineage, lineage))).sort((left, right) => {
      const a = left.decidedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(left.decidedAt);
      const b = right.decidedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(right.decidedAt);
      if (a !== b) return a < b ? 1 : -1;
      return reviewDecisionKey(right).localeCompare(reviewDecisionKey(left));
    })[0];
  return latest !== undefined && !withdrawn.has(reviewDecisionKey(latest));
}

async function approvedFixPassConsumed(facts: NativeReviewFactPorts, key: string): Promise<boolean> {
  const outcomes = await facts.outcomes.list();
  if (outcomes.status !== "complete") throw reviewFactListingError(outcomes);
  return outcomes.records.some(({ value }) => value.admittedBy === key
    && (value.outcome === "clean" || value.outcome === "findings"));
}

type ExtraPassChoice = Extract<ReviewDecision["choice"], { kind: "extra-pass" }>;
type ApprovedFixChoice = ExtraPassChoice & { precondition: Extract<ExtraPassChoice["precondition"], { kind: "approved-fix" }> };

function matchingApprovedFix(value: ReviewDecision, input: Parameters<typeof readNativeApprovedFixPassJudgment>[1]):
  value is ReviewDecision & { choice: ApprovedFixChoice } {
  const choice = value.choice;
  return choice.kind === "extra-pass" && choice.precondition.kind === "approved-fix"
    && value.lane === input.lane && choice.passCount === input.passCount
    && laneSubjectOwnerMatches(value.subject.lineage, input.lineage)
    && choice.precondition.repositoryId === input.repositoryId
    && (input.producerId === undefined || choice.precondition.producerId === input.producerId);
}

async function selectedFixPerformance(facts: NativeReviewFactPorts, precondition: ApprovedFixChoice["precondition"]) {
  const response = await facts.responses.read(precondition.producerId, "authority");
  if (response.status === "missing-producer" || response.evidence.length === 0) {
    throw new Error("Restore the approved fix response before retrying its frontline continuation.");
  }
  const approval = response.evidence.find(record => record.value.dispositionSet.dispositionSetId === precondition.dispositionSetId);
  return approval?.value.successorDispositionSetId === null && approval.value.dispositionSet.producerId === precondition.producerId
    ? approval.value.performance : undefined;
}

/** Observe a live performed-fix grant that continues the current subject beyond its producer's original cap. */
export async function readNativeApprovedFixPassJudgment(facts: NativeReviewFactPorts, input: {
  repositoryId: string; lineage: LaneSubjectLineage; lane: "frontline" | "standard"; producerId?: string; passCount: number; headSha: string;
  confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
}): Promise<ReviewLaneJudgment["ceilingOverride"]> {
  if (await facts.readProjectId() !== input.repositoryId) {
    throw new Error("Restore the review subject's project identity before reading its frontline continuation.");
  }
  const listing = await facts.decisions.list();
  if (listing.status !== "complete") throw reviewFactListingError(listing);
  for (const { value } of listing.records) {
    if (!matchingApprovedFix(value, input)) continue;
    const precondition = value.choice.precondition;
    const key = reviewDecisionKey(value);
    if (listing.records.some(({ value: other }) => other.choice.kind === "withdrawal" && other.choice.decisionKey === key)) continue;
    const performance = await selectedFixPerformance(facts, precondition);
    if (performance === undefined) continue;
    if (await approvedFixPassConsumed(facts, key)) continue;
    const fromHeadSha = performance.producedHeadSha;
    if (fromHeadSha === input.headSha || await input.confirmResponseHeadContinuation?.({
      repositoryId: input.repositoryId, lineage: input.lineage, producerId: precondition.producerId,
      dispositionSetId: precondition.dispositionSetId, originatingHeadSha: precondition.originatingHeadSha,
      fromHeadSha, toHeadSha: input.headSha })) return {
        exhaustedPassCount: value.choice.passCount, nextPass: value.choice.passCount + 1,
        conditionalPassAuthorizationId: key,
      };
  }
  return undefined;
}

/** Observe whether live performed-fix authority keeps the current frontline cap open. */
export async function nativeFrontlineCapContinues(facts: NativeReviewFactPorts, input: {
  repositoryId: string; lineage: LaneSubjectLineage; producerId: string; passCount: number; headSha: string;
  confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
}): Promise<boolean> {
  return await readNativeApprovedFixPassJudgment(facts, { ...input, lane: "frontline" }) !== undefined;
}
