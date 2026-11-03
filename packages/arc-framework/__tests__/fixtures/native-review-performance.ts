/** Complete native response facts built through actual producer and approval constructors. */
import { createReviewHarness } from "../helpers/store/review-harness.js";
import { performedEvidenceFixture, reviewEvidenceFixture } from "./review-evidence.js";
import { localOutcome, hostedOutcome } from "./review-outcome.js";
import { createHostedHandleFixture } from "./hosted-review.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../src/lib/store/kinds/review/evidence/access.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { ReviewEvidenceSchema } from "../../src/lib/store/kinds/review/evidence/schema.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";

export async function createNativeReviewPerformanceFixture(kind: "candidate" | "errand" | "delivery-member", options: { pendingPolicy?: boolean; noFix?: boolean } = {}) {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const errand = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "example",
    claimId: "1".repeat(32), intent: "Repair one issue", owner: "test-user", origin: "description", originEntry: null,
    branch: "fix/example", state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (errand.kind !== "errand") throw new Error("Expected ordinary Errand");
  const primary = kind === "errand" ? await h.seedErrand(errand) : await h.seedMeta("example");
  const seed = performedEvidenceFixture(kind), target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  const binding = seed.value.binding;
  if (binding === null) throw new Error("Expected owned response binding");
  if (kind === "delivery-member" && binding.kind !== "delivery-member") throw new Error("Expected member binding");
  const outcome = ReviewOutcomeSchema.parse(kind === "delivery-member" && binding.kind === "delivery-member"
    ? hostedOutcome({ repositoryId: projectId, vehicle: binding.deliveryMember, outcome: "findings",
      findings: seed.outcome.hosted?.sealedResult?.findings })
    : localOutcome({ target, outcome: "findings", findings: seed.outcome.findings, vehicle: { kind: "work-unit", identity: "example" },
      ...(kind === "errand" ? { vehicle: { kind: "errand", identity: errand.slug, claimId: errand.claimId },
        lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: errand.claimId, headSha: target.headSha } } : {}) }));
  const { value: fixed } = performedEvidenceFixture(kind, outcome);
  const noFix = reviewEvidenceFixture(outcome, "reject");
  const performed = options.noFix ? { ...noFix, binding: fixed.binding, performance: {
    schemaVersion: 1, producerId: outcome.attemptId, dispositionSetId: noFix.dispositionSet.dispositionSetId,
    originatingHeadSha: outcome.target.headSha, producedHeadSha: outcome.target.headSha,
    performedAt: "2026-10-20T12:01:00Z" } } : fixed;
  const value = ReviewEvidenceSchema.parse(kind === "errand" ? { ...performed,
    binding: { kind: "errand", errand: { key: errand.slug, claimId: errand.claimId, branch: errand.branch } } } : performed);
  if (value.performance === undefined) throw new Error("Expected complete performance fixture");
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner), evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  const originalOutcome = await outcomes.create(outcome);
  const { performance: ignoredPerformance, ...approved } = value;
  void ignoredPerformance;
  const approval = composeReviewDispositionRecord(outcome, [approved], primary.reference.owner);
  const ports = { outcomes, evidence, readProjectId: h.projectId };
  const initial = await publishNativeReviewApproval({ ...ports, record: { ...approval,
    approvedDispositionLineage: approval.approvedDispositionLineage.map(node => ({ ...node,
      ...(options.pendingPolicy ? { policyProjectionPending: true as const } : {}) })) }, now: () => "2026-10-20T12:01:00Z" });
  const { fixResponse: ignoredResponse, ...performance } = value.performance;
  void ignoredResponse;
  return { h, primary, outcome, originalOutcome, initial, value, ports, approval,
    input: { ...ports, record: composeReviewDispositionRecord(outcome, [value], primary.reference.owner), performance } };
}
