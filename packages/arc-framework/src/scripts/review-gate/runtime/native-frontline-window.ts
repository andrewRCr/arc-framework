/** Immutable skip decisions close the selected vehicle's opening frontline window. */
import { readConfiguredIdentity } from "../../../lib/git/identity.js";
import { readCandidateRecord } from "../../../lib/store/kinds/review/candidate/access.js";
import { ReviewDecisionSchema } from "../../../lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import { laneSubjectOwnerMatches, type LaneSubjectLineage } from "../core/lane-admission.js";
import type { NativeReviewFactPorts } from "../core/ports.js";
import type { ReviewInvocationInput } from "./invocation.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ConfirmResponseHeadContinuation } from "../core/response-head-continuation.js";

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
  const decidedBy = await readConfiguredIdentity(input.invocation.exec, input.invocation.cwd);
  if (decidedBy === null) throw new Error("Set git config --local arc.identity <identity>, then retry the frontline skip.");
  let subjectDigest = input.targetDigest;
  if (input.lineage.kind === "candidate") {
    const owner = input.invocation.workItem;
    if (owner === undefined) throw new Error("Resolve the Candidate's work item before recording its frontline skip.");
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
  if (listing.status !== "complete") throw new Error(listing.reason);
  return listing.records.some(({ value }) => value.lane === "frontline" && value.choice.kind === "lane-skip"
    && input.lineages.some(lineage => laneSubjectOwnerMatches(value.subject.lineage, lineage)));
}

/** Observe a live performed-fix grant that continues the current subject beyond its producer's original cap. */
export async function nativeFrontlineCapContinues(facts: NativeReviewFactPorts, input: {
  repositoryId: string; lineage: LaneSubjectLineage; producerId: string; passCount: number; headSha: string;
  confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
}): Promise<boolean> {
  if (await facts.readProjectId() !== input.repositoryId) {
    throw new Error("Restore the review subject's project identity before reading its frontline continuation.");
  }
  const listing = await facts.decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  for (const { value } of listing.records) {
    if (value.lane !== "frontline" || value.choice.kind !== "extra-pass"
      || value.choice.precondition.kind !== "approved-fix" || value.choice.passCount !== input.passCount
      || !laneSubjectOwnerMatches(value.subject.lineage, input.lineage)) continue;
    const precondition = value.choice.precondition;
    if (precondition.repositoryId !== input.repositoryId || precondition.producerId !== input.producerId) continue;
    const key = reviewDecisionKey(value);
    if (listing.records.some(({ value: other }) => other.choice.kind === "withdrawal" && other.choice.decisionKey === key)) continue;
    const approval = await facts.evidence.read(precondition.dispositionSetId);
    if (approval === null) throw new Error("Restore the approved fix response before retrying its frontline continuation.");
    if (approval.value.successorDispositionSetId !== null || approval.value.performance === undefined) continue;
    const fromHeadSha = approval.value.performance.producedHeadSha;
    if (fromHeadSha === input.headSha || await input.confirmResponseHeadContinuation?.({
      repositoryId: input.repositoryId, lineage: input.lineage, producerId: input.producerId,
      dispositionSetId: precondition.dispositionSetId, originatingHeadSha: precondition.originatingHeadSha,
      fromHeadSha, toHeadSha: input.headSha })) return true;
  }
  return false;
}
