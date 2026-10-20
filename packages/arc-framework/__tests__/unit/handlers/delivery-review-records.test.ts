/** Delivery review access binds the selected native owner before opening its family. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";
import { createDeliveryReviewRecordContext, readDeliveryLocalReviewResponse, publishDeliveryReviewFixResponse } from "../../../src/handlers/delivery-review-records.js";
import { createLocalReviewPreparationFixture, createDeliveryLocalReviewAdmission } from "../../fixtures/local-review-preparation.js";
import { localOutcome, hostedOutcome } from "../../fixtures/review-outcome.js";
import { reviewEvidenceFixture } from "../../fixtures/review-evidence.js";
import { ReviewOutcomeSchema } from "../../../src/lib/store/kinds/review/outcome/schema.js";
import { createReviewOutcomePort } from "../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../src/lib/store/kinds/review/evidence/access.js";
import { composeReviewDispositionRecord } from "../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewApproval } from "../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { advanceDeliveryReviewFixResponse } from "../../../src/lib/delivery/review-fix.js";
import { reviewOutcomeKey } from "../../../src/lib/store/kinds/review/outcome/key.js";
import { selectPendingDeliveryReviewFixAuthority, selectDurableDeliveryReviewFixResponseReplay } from "../../../src/lib/delivery/review-fix-continuation.js";
import { currentApprovedDispositionNode } from "../../../src/scripts/review-gate/core/advisory-records.js";
import { DeliveryLocalReviewAdmissionSchema } from "../../../src/scripts/review-gate/policy/delivery-local-review-admission.js";

it("opens and retains the branch-linked native owner without projected metadata or an injected owner", async () => {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "topic/opaque", linkedAs: "adopted", excluded: [] }],
  });
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  await checkout.occupy("topic/opaque", { kind: "work-unit", name: "example" });
  const open = createDeliveryReviewRecordContext(checkout);
  const context = await open();
  expect(context.workItem).toEqual(primary.reference.owner);
  expect(context.family.mode).toBe("stored");
  expect(await open()).toBe(context);
  const listing = await context.family.ports.dispositions.listDispositionRecords();
  expect(listing).toEqual([]);
});

async function localMemberResponse() {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const target = createLocalReviewPreparationFixture({ repositoryId: projectId }).memberTarget;
  const admission = DeliveryLocalReviewAdmissionSchema.parse(createDeliveryLocalReviewAdmission(target.headSha));
  const primary = await h.seedMeta(admission.vehicle.workUnitId);
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ target, deliveryAdmission: admission,
    lineage: { kind: "delivery-member", planId: admission.vehicle.planId, workUnitId: admission.vehicle.workUnitId,
      deliverableId: admission.vehicle.deliverableId }, vehicle: { kind: "delivery-member", identity: admission.vehicle.deliverableId },
    outcome: "findings", findings: [{ findingId: "finding-1", severity: "major", locus: "src/example.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner), evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  await outcomes.create(outcome);
  const record = composeReviewDispositionRecord(outcome, [{ ...reviewEvidenceFixture(outcome, "fix"),
    binding: { kind: "delivery-member", deliveryMember: admission.vehicle } }], primary.reference.owner);
  await publishNativeReviewApproval({ outcomes, evidence, record, readProjectId: h.projectId, now: () => "2026-10-20T18:00:00Z" });
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  return { h, primary, outcome, record, checkout, outcomes, evidence };
}

it("reads an ended local member's exact source after working-state pruning and from a fresh checkout", async () => {
  const f = await localMemberResponse();
  const expected = { oldTarget: f.outcome.target, settlement: { repositoryId: f.outcome.target.repositoryId,
    headSha: f.outcome.target.headSha, lineage: f.outcome.lineage, attemptId: f.outcome.attemptId,
    dispositionSetId: f.record.currentDispositionSetId } };
  expect(await readDeliveryLocalReviewResponse(f.checkout, f.record)).toEqual(expected);
  const second = await createReviewCheckout(f.h);
  onTestFinished(second.cleanup);
  expect(await readDeliveryLocalReviewResponse(second, f.record)).toEqual(expected);
  const other = await f.h.seedMeta("other");
  expect(await readDeliveryLocalReviewResponse({ ...second, workItem: other.reference.owner }, f.record)).toBeNull();
  expect(await readDeliveryLocalReviewResponse({ ...second, workItem: f.primary.reference.owner }, f.record)).toEqual(expected);
});

it("publishes a member fix and performance together, retaining replay and the original outcome", async () => {
  const f = await localMemberResponse();
  const context = await createDeliveryReviewRecordContext({ ...f.checkout, workItem: f.primary.reference.owner })();
  const local = await readDeliveryLocalReviewResponse({ ...f.checkout, ...context }, f.record);
  expect(local).not.toBeNull();
  const prior = await f.evidence.read(f.record.currentDispositionSetId);
  const historyBefore = await f.h.store.history({ reference: prior!.reference });
  const originalOutcome = await f.outcomes.read(reviewOutcomeKey(f.outcome));
  const producedHeadSha = "a".repeat(40), verifiedAt = "2026-10-20T18:01:00Z";
  const advanced = advanceDeliveryReviewFixResponse({ record: f.record, oldTarget: f.outcome.target, hostedTarget: null,
    currentHead: producedHeadSha, currentTree: "b".repeat(40), applicability: "full",
    verificationEvidenceRefs: ["test:delivery-fix"], verifiedAt });
  expect(advanced.status).toBe("recorded");
  if (advanced.status === "refused" || local === null) throw new Error("expected a verified response");
  const input = { record: advanced.record, settlement: local.settlement, producedHeadSha, verifiedAt };
  await publishDeliveryReviewFixResponse(context, input);
  const performed = await f.evidence.read(f.record.currentDispositionSetId);
  expect(performed?.value.performance).toMatchObject({ producerId: f.outcome.attemptId,
    originatingHeadSha: f.outcome.target.headSha, producedHeadSha, performedAt: verifiedAt,
    fixResponse: { oldTarget: f.outcome.target, newTarget: advanced.newTarget } });
  expect(performed?.version).not.toEqual(prior?.version);
  expect(performed?.value.binding).toEqual(prior?.value.binding);
  expect(performed?.value.responsePolicyRequest).toEqual(prior?.value.responsePolicyRequest);
  const historyAfter = await f.h.store.history({ reference: prior!.reference });
  if (historyBefore.status !== "ok" || historyAfter.status !== "ok") throw new Error("expected evidence history");
  expect(historyAfter.result.length).toBe(historyBefore.result.length + 1);
  await publishDeliveryReviewFixResponse(context, { ...input, verifiedAt: "2026-10-20T18:02:00Z" });
  expect(await f.evidence.read(f.record.currentDispositionSetId)).toEqual(performed);
  expect(await f.outcomes.read(reviewOutcomeKey(f.outcome))).toEqual(originalOutcome);
  const beforeVerificationOnly = await f.h.store.version();
  await publishDeliveryReviewFixResponse(context, { record: null, settlement: null, producedHeadSha, verifiedAt });
  expect(await f.h.store.version()).toEqual(beforeVerificationOnly);
});

it("continues a native hosted fix from its approved policy snapshot after pruning", async () => {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const member = DeliveryLocalReviewAdmissionSchema.parse(createDeliveryLocalReviewAdmission("c".repeat(40))).vehicle;
  const primary = await h.seedMeta(member.workUnitId);
  const outcome = ReviewOutcomeSchema.parse(hostedOutcome({ repositoryId: projectId, vehicle: member,
    outcome: "findings", findings: [{ findingId: "thread-1", severity: "major", sourceOrdinal: 1, origin: "review-thread",
      commentId: "comment-1", threadId: "thread-1", settlement: "reply-and-resolve", locus: "src/main.ts:1",
      url: "https://example.invalid/thread-1" }] }));
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner), evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  await outcomes.create(outcome);
  const approved = { ...reviewEvidenceFixture(outcome, "fix"), binding: { kind: "delivery-member" as const, deliveryMember: member } };
  const record = composeReviewDispositionRecord(outcome, [approved], primary.reference.owner);
  await publishNativeReviewApproval({ outcomes, evidence, record, readProjectId: h.projectId, now: () => "2026-10-20T18:00:00Z" });
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const context = await createDeliveryReviewRecordContext({ ...checkout, workItem: primary.reference.owner })();
  expect(selectPendingDeliveryReviewFixAuthority({ workUnitId: member.workUnitId,
    records: await context.family.ports.dispositions.listDispositionRecords() })).toMatchObject({ status: "selected",
    operationId: outcome.attemptId, planId: member.planId, selectedDeliverableId: member.deliverableId });
  const advanced = advanceDeliveryReviewFixResponse({ record, oldTarget: outcome.target, hostedTarget: outcome.hosted!.target,
    currentHead: "d".repeat(40), currentTree: "e".repeat(40), applicability: "full",
    verificationEvidenceRefs: ["test:hosted-fix"], verifiedAt: "2026-10-20T18:01:00Z" });
  if (advanced.status === "refused") throw new Error(advanced.reason);
  await publishDeliveryReviewFixResponse(context, { record: advanced.record, settlement: null,
    producedHeadSha: advanced.newTarget.headSha, verifiedAt: "2026-10-20T18:01:00Z" });
  const fresh = await createReviewCheckout(h);
  onTestFinished(fresh.cleanup);
  const reopened = await createDeliveryReviewRecordContext({ ...fresh, workItem: primary.reference.owner })();
  const records = await reopened.family.ports.dispositions.listDispositionRecords();
  expect(selectPendingDeliveryReviewFixAuthority({ workUnitId: member.workUnitId, records })).toEqual({ status: "none" });
  if (record.source.kind !== "hosted") throw new Error("expected hosted response");
  const replay = selectDurableDeliveryReviewFixResponseReplay({ workUnitId: member.workUnitId, records,
    responsePlan: { schemaVersion: 1, target: outcome.target, source: record.source,
      findings: outcome.findings } });
  expect(replay).toMatchObject({ status: "selected", operationId: outcome.attemptId,
    request: { policyRequest: currentApprovedDispositionNode(record).responsePolicyRequest,
      verifiedFix: { applicability: "full", verificationEvidenceRefs: ["test:hosted-fix"] } } });
});
