/** Native pending admissions cite immutable approved-fix authority without rewriting the decision. */
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import type { ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import { requireConsumedReviewRetryAttempts, localReviewRetryActorContract, requireCompleteConditionalCoverage } from "../core/conditional-retry-contract.js";
import type { NativeReviewFactPorts, ReviewOperationStateStore, ReviewOperationStateSnapshotIndex,
  ReviewOperationStateSnapshot } from "../core/ports.js";
import { LaneProgressStateSchema, type LaneProgressState, type LaneResponsePerformance } from "../core/operation-state-schema.js";
import type { ConditionalPendingAdmission } from "../lane-progress-conditional.js";

type CompleteSnapshot = Extract<ReviewOperationStateSnapshot, { status: "complete" }>;
type ApprovedFixPrecondition = Extract<Extract<ReviewDecision["choice"], { kind: "extra-pass" }>["precondition"], { kind: "approved-fix" }>;

async function readBoundConditionalPass(facts: NativeReviewFactPorts, input: ConditionalPendingAdmission) {
  const projectId = await facts.readProjectId();
  if (input.repositoryId !== projectId) throw new Error("Restore the admission's project identity before retrying its conditional pass.");
  const decision = await facts.decisions.read(input.authorizationId);
  if (decision === null) throw new Error("Restore the approved-fix decision before retrying its pending admission.");
  const choice = decision.value.choice;
  if (choice.kind !== "extra-pass" || choice.precondition.kind !== "approved-fix") {
    throw new Error("Choose the approved-fix decision for this pending admission, then retry.");
  }
  const precondition = choice.precondition;
  const withdrawal = await facts.decisions.read(reviewDecisionKey({ ...decision.value,
    choice: { kind: "withdrawal", decisionKey: input.authorizationId }, decidedAt: null }));
  if (withdrawal !== null) throw new Error("This conditional pass was withdrawn; obtain a new approved pass before retrying.");
  const approval = await facts.evidence.read(precondition.dispositionSetId);
  if (approval === null) throw new Error("Restore the approved response before retrying its conditional admission.");
  if (approval.value.successorDispositionSetId !== null
    || !await input.confirmDispositionSetCurrent(precondition.producerId, precondition.dispositionSetId)) {
    throw new Error("This conditional pass was superseded; use the current approved response before retrying.");
  }
  const performance = approval.value.performance;
  if (performance === undefined) {
    throw new Error("The approved fix is not performed; record its verified performance before retrying the conditional admission.");
  }
  return { decision, precondition, passCount: choice.passCount, performance };
}

function assertNamedAdmission(expected: Pick<ConditionalPendingAdmission, "repositoryId" | "lane" | "lineage" | "nextPass">,
  input: ConditionalPendingAdmission, next: LaneProgressState): void {
  if (expected.lane !== input.lane || expected.repositoryId !== input.repositoryId
    || !laneSubjectOwnerMatches(expected.lineage, input.lineage) || expected.nextPass !== input.nextPass
    || next.lane !== input.lane || next.repositoryId !== input.repositoryId || !laneSubjectOwnerMatches(next.lineage, input.lineage)) {
    throw new Error("Conditional pass authority does not match the named admission; restore its lane, lineage, and next pass, then retry.");
  }
}

async function assertProducedHead(input: ConditionalPendingAdmission, performance: LaneResponsePerformance,
  precondition: ApprovedFixPrecondition): Promise<void> {
  if (performance.producedHeadSha !== input.producedHeadSha && !await input.confirmResponseHeadContinuation?.({
    repositoryId: input.repositoryId, lineage: input.lineage, producerId: precondition.producerId,
    dispositionSetId: precondition.dispositionSetId, originatingHeadSha: precondition.originatingHeadSha,
    fromHeadSha: performance.producedHeadSha, toHeadSha: input.producedHeadSha })) {
    throw new Error("Conditional pass authority does not match the produced head; restore the verified head or prove its continuation, then retry.");
  }
}

async function observeNativeAdmission(store: Partial<ReviewOperationStateSnapshotIndex>, ownerVersion: number,
  next: LaneProgressState): Promise<{ snapshot: CompleteSnapshot; owner: LaneProgressState }> {
  if (store.readOperationSnapshot === undefined) throw new Error("Bind the native execution snapshot reader before retrying conditional admission.");
  const snapshot = await store.readOperationSnapshot();
  if (snapshot.status !== "complete") throw new Error(`Restore the complete conditional admission snapshot and retry: ${snapshot.reason}`);
  const current = snapshot.records.find(record => record.state.operationId === next.operationId);
  if (current?.version !== ownerVersion || current.state.kind !== "lane-progress") {
    throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
  }
  return { snapshot, owner: current.state };
}

async function assertNativeConsumedRetry(facts: NativeReviewFactPorts, view: { snapshot: CompleteSnapshot; owner: LaneProgressState },
  input: ConditionalPendingAdmission, next: LaneProgressState): Promise<void> {
  const listing = await facts.outcomes.list();
  if (listing.status !== "complete") throw reviewFactListingError(listing);
  const admitted = listing.records.map(record => record.value).filter(outcome => outcome.admittedBy === input.authorizationId)
    .sort((a, b) => a.retryGeneration - b.retryGeneration);
  const original = admitted[0];
  if (original === undefined) return;
  const { replacement } = requireConsumedReviewRetryAttempts(view.owner, original.attemptId, input, next);
  if (original.local === undefined) return;
  const current = view.snapshot.records.find(record => record.state.kind === "local-review"
    && record.state.operationId === replacement.attemptId)?.state;
  if (current?.kind !== "local-review"
    || canonicalize(localReviewRetryActorContract(original.local)) !== canonicalize(localReviewRetryActorContract(current))) {
    throw new Error("Conditional pass retry must retain its original admission's actors and policy; restore the original contract and retry.");
  }
}

/** Bind a pending attempt to its original approval-gated extra pass. */
export async function bindNativeConditionalAdmission(facts: NativeReviewFactPorts,
  store: ReviewOperationStateStore & Partial<ReviewOperationStateSnapshotIndex>, input: ConditionalPendingAdmission,
  ownerVersion: number, next: LaneProgressState): Promise<LaneProgressState> {
  const bound = await readBoundConditionalPass(facts, input);
  assertNamedAdmission({ lane: bound.decision.value.lane, repositoryId: bound.precondition.repositoryId,
    lineage: bound.decision.value.subject.lineage, nextPass: bound.passCount + 1 }, input, next);
  await assertProducedHead(input, bound.performance, bound.precondition);
  const pending = next.attempts.find(attempt => attempt.attemptId === input.admissionId && attempt.outcome === "pending"
    && attempt.logicalPass === input.nextPass && attempt.headSha === input.producedHeadSha);
  if (pending === undefined) throw new Error("Restore the pending admission for this produced head and logical pass, then retry.");
  requireCompleteConditionalCoverage(input.lane, pending);
  const view = await observeNativeAdmission(store, ownerVersion, next);
  if (view.owner.attempts.some(attempt => attempt.logicalPass === input.nextPass && attempt.terminalProducer)) {
    throw new Error("The conditional pass is already complete; obtain a new approved pass for further review.");
  }
  await assertNativeConsumedRetry(facts, view, input, next);
  return LaneProgressStateSchema.parse({ ...next, attempts: next.attempts.map(attempt =>
    attempt.attemptId === input.admissionId ? { ...attempt, admittedBy: input.authorizationId } : attempt) });
}
