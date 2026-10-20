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
