/** Actual native approvals and conditional capture inputs shared by admission and withdrawal tests. */
import type { LaneSubjectLineage } from "../../src/scripts/review-gate/core/lane-admission.js";
import { performedEvidenceFixture } from "./review-evidence.js";
import { createReviewCheckout } from "../helpers/store/review-checkout.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";
import { reviewDecisionKey } from "../../src/lib/store/kinds/review/decision/key.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { NativeReviewInFlightStateStore } from "../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { publishNativeConditionalPass } from "../../src/scripts/review-gate/runtime/native-conditional-pass.js";
import { publishNativeReviewPerformance } from "../../src/scripts/review-gate/runtime/native-review-performance.js";
import { createNativeReviewApprovalFixture } from "./native-review-approval.js";
import { createReviewDecisionPort } from "../../src/lib/store/kinds/review/decision/access.js";
import { publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { createFrontlineFixture } from "./frontline-review.js";
import { createFrontlineAdmission } from "../../src/scripts/review-gate/core/frontline-admission.js";
import { normalizeFrontlineOutcome } from "../../src/scripts/review-gate/policy/frontline-outcome.js";
import { executeFrontlineRun } from "../../src/scripts/review-gate/policy/frontline-operation.js";
import { LocalFrontlineOutcomeStore } from "../../src/scripts/review-gate/hosts/local/frontline-outcome-store.js";
import { recordFrontlineAttempt } from "../../src/scripts/review-gate/lane-progress.js";
import { createDispositionSet, approveDispositionSet } from "../../src/scripts/review-gate/core/dispositions.js";
import { publishNativeReviewSuccessor } from "../../src/scripts/review-gate/runtime/native-review-successor.js";


export async function createNativeConditionalPassFixture(kind: "local" | "frontline" | "hosted", approve = true, lineage?: LaneSubjectLineage) {
  const f = await createNativeReviewApprovalFixture(kind, "fix", lineage);
  const approval = approve ? await publishNativeReviewApproval(f.input) : null;
  const decisions = createReviewDecisionPort(f.h.store, f.primary.reference.owner);
  const capture = { lane: f.outcome.lane, repositoryId: f.outcome.target.repositoryId, headSha: f.outcome.target.headSha,
    lineage: f.outcome.lineage, producerId: f.outcome.attemptId, dispositionSetId: f.approved.dispositionSet.dispositionSetId,
    authorizedBy: f.approved.approval.approvedBy, exhaustedPassCount: f.outcome.logicalPass,
    nextPass: f.outcome.logicalPass + 1, now: "2026-10-20T13:00:00Z" };
  return { ...f, approval, approvalInput: f.input, input: { outcomes: f.input.outcomes, evidence: f.input.evidence,
    decisions, readProjectId: f.input.readProjectId, capture } };
}

export async function createNativeConditionalAdmissionFixture(kind: "local" | "frontline", perform = true, lineage?: LaneSubjectLineage) {
  const f = await createNativeConditionalPassFixture(kind, true, lineage);
  const decision = await publishNativeConditionalPass(f.input), authorizationId = reviewDecisionKey(decision.value);
  const { value } = performedEvidenceFixture("candidate", f.outcome);
  if (value.performance === undefined) throw new Error("Expected a complete performance");
  const performanceInput = { ...f.input,
    record: composeReviewDispositionRecord(f.outcome, [value], f.primary.reference.owner), performance: value.performance };
  if (perform) await publishNativeReviewPerformance(performanceInput);
  const { targetId: ignored, ...coordinates } = f.outcome.target;
  void ignored;
  const target = createReviewTarget({ ...coordinates, headSha: value.performance.producedHeadSha, headTree: "f".repeat(40) });
  const checkout = await createReviewCheckout(f.h);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = new NativeReviewInFlightStateStore({ publisher, workItem: f.primary.reference.owner,
    outcomes: f.input.outcomes, evidence: f.input.evidence, decisions: f.input.decisions, projectId: f.input.readProjectId });
  return { ...checkout, f, decision, authorizationId, target, publisher, operations, performanceInput };
}

export async function createNativeConditionalFrontlineFixture(perform = true) {
  const common = await createNativeConditionalAdmissionFixture("frontline", perform,
    { kind: "candidate", candidateId: canonicalDigest({ candidate: "conditional-review" }) });
  const { f, authorizationId, target } = common;
  const fixture = createFrontlineFixture(target, { lineage: f.outcome.lineage });
  const admission = createFrontlineAdmission({ ...fixture.admission, logicalPass: f.input.capture.nextPass });
  const pendingInput = { lane: "frontline" as const, repositoryId: target.repositoryId,
    changeRequestId: null, headSha: target.headSha, lineage: admission.lineage, logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration, attemptId: admission.operationId, sourceId: fixture.outcomeRecord.sourceIdentity,
    outcome: "pending" as const, consumedPass: false, frontline: { admission, effectiveCoverage: null }, now: "2026-10-20T14:00:00Z",
    conditionalPendingAdmission: { authorizationId, repositoryId: target.repositoryId, lane: "frontline" as const, lineage: admission.lineage,
      producedHeadSha: target.headSha, nextPass: admission.logicalPass, admissionId: admission.operationId, now: "2026-10-20T14:00:00Z",
      confirmDispositionSetCurrent: async (producer: string, id: string) => {
        const evidence = await f.input.evidence.read(id);
        return evidence?.value.dispositionSet.producerId === producer && evidence.value.successorDispositionSetId === null;
      } } };
  return { ...common, fixture, admission, pendingInput };
}

export async function completeNativeConditionalFrontline(h: Awaited<ReturnType<typeof createNativeConditionalFrontlineFixture>>, result: "clean" | "malformed",
  retryOfOperationId?: string) {
  const outcome = normalizeFrontlineOutcome({ providerResult: result === "clean" ? { kind: "clean" } : { kind: "malformed" },
    source: h.fixture.outcomeRecord.outcome.source, target: h.admission.target,
    pass: h.admission.logicalPass, maxPasses: h.admission.maxPasses });
  await executeFrontlineRun({ operationStore: h.operations, outcomeStore: new LocalFrontlineOutcomeStore(h.publisher),
    outcomes: h.f.input.outcomes, withOperationLock: async (_id, _wait, action) => action(),
    execute: async () => ({ outcome, executableIdentity: h.fixture.outcomeRecord.executableIdentity }),
    now: () => "2026-10-20T14:01:00Z" }, { admission: h.admission, lockWaitMs: 1,
    ...(retryOfOperationId === undefined ? {} : { retryOfOperationId }) });
  await recordFrontlineAttempt(h.operations, { admission: h.admission, outcome, now: "2026-10-20T14:02:00Z" });
}

export async function approveNextNativeConditionalFix(h: Awaited<ReturnType<typeof createNativeConditionalFrontlineFixture>>) {
  const id = h.f.input.capture.dispositionSetId, prior = await h.f.input.evidence.read(id);
  if (prior === null) throw new Error("Expected prior approval");
  const { dispositionSetId: ignored, ...identity } = prior.value.dispositionSet;
  void ignored;
  const dispositionSet = createDispositionSet({ ...identity, proposedBy: "next-response-proposer" });
  const next = { ...prior.value, dispositionSet, approval: approveDispositionSet({ dispositionSet,
    approvedBy: h.f.input.capture.authorizedBy, approvedAt: "2026-10-20T13:01:00Z" }), predecessorDispositionSetId: id };
  const record = composeReviewDispositionRecord(h.f.outcome, [{ ...prior.value,
    successorDispositionSetId: dispositionSet.dispositionSetId }, next], h.f.primary.reference.owner);
  await publishNativeReviewSuccessor({ ...h.f.approvalInput, record, store: h.f.h.store, inFlight: h.operations });
  const grant = await publishNativeConditionalPass({ ...h.f.input, capture: { ...h.f.input.capture,
    dispositionSetId: dispositionSet.dispositionSetId, now: "2026-10-20T13:02:00Z" } });
  const current = await h.f.input.evidence.readDispositionRecord(h.f.outcome.attemptId);
  if (current === null) throw new Error("Expected current approval");
  await publishNativeReviewPerformance({ ...h.performanceInput, record: current,
    performance: { ...h.performanceInput.performance, dispositionSetId: dispositionSet.dispositionSetId,
      performedAt: "2026-10-20T13:03:00Z" } });
  return { ...h.pendingInput, conditionalPendingAdmission: { ...h.pendingInput.conditionalPendingAdmission,
    authorizationId: reviewDecisionKey(grant.value) } };
}
