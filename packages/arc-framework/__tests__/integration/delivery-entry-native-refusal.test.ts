/** A published native member response retains an inner task-list refusal and resumes after repair. */
import { expect, it } from "vitest";
import { carryNativeDeliveryStatus, seedNativeClosedDeliveryTasks, createNativeCandidateCorrectionFixture, createNativePendingResponseFixture } from "../helpers/store/native-delivery-refusal.js";
import { refuseNativeListing, refuseNativeRecordRead } from "../helpers/store/native-record-fault.js";
import { inspectRepositoryDeliveryEntry } from "../../src/lib/delivery/repository-entry.js";

it("raises the pending response task-list reread refusal whole and routes the same request after repair", async () => {
  const h = await createNativePendingResponseFixture();
  const fault = await refuseNativeRecordRead(h.reference.store, h.taskList.reference, 2);
  const input = { ...h.input, store: fault.store };
  const run = () => inspectRepositoryDeliveryEntry(input);
  await expect(run()).rejects.toMatchObject({ name: "StoreRefusalError", offBranch: true, refusal: fault.refusal });
  expect(fault.injected()).toBe(1);
  fault.repair();
  expect(await run()).toMatchObject({ status: "correction-routing-required", nextAction: "plan-review-fix",
    planId: h.plan.planId, stateRevision: h.stateRevision, selectedDeliverableId: h.vehicle.deliverableId,
    derivedFrom: { kind: "pending-review-response", reviewedHead: h.vehicle.head,
      dispositionSetId: h.value.dispositionSet.dispositionSetId } });
}, 60_000);

it("raises pending Candidate authority's listing refusal whole and recognizes the approved fix after repair", async () => {
  const h = await createNativeCandidateCorrectionFixture();
  const fault = await refuseNativeListing(h.reference.store, { family: "review", kind: "review/evidence",
    owner: h.primary.reference.owner });
  const { createPrePublicationCompositionDependencies } = await import("../../src/scripts/review-gate/policy/pre-publication-composition.js");
  const dependencies = createPrePublicationCompositionDependencies({ ...h.native, store: fault.store,
    workItem: h.primary.reference.owner });
  const run = () => dependencies.readCandidate("example");
  await expect(run()).rejects.toMatchObject({ name: "StoreRefusalError", offBranch: true, refusal: fault.refusal });
  expect(fault.injected()).toBe(1);
  fault.repair();
  expect(await run()).toMatchObject({ status: "current", candidateId: h.candidate.attestation.candidateId,
    pendingReviewTarget: h.outcome.target, pendingFixRootHeadSha: h.correctionHead });
}, 60_000);

it("retains terminal-delta owner-read diagnostics and re-enters its real correction route after repair", async () => {
  const h = await createNativeCandidateCorrectionFixture();
  await seedNativeClosedDeliveryTasks(h);
  await carryNativeDeliveryStatus(h);
  const fault = await refuseNativeRecordRead(h.reference.store, h.primary.reference);
  const { DeliveryEntryInspectionRequestSchema } = await import("../../src/lib/delivery/entry-inspection.js");
  const input = { ...h.native, store: fault.store, workItem: h.primary.reference.owner,
    taskListPath: ".arc/active/tasks-example.md", baseBranch: "main",
    request: DeliveryEntryInspectionRequestSchema.parse({ workUnitId: "example", entryMode: "integrating" }) };
  const run = () => inspectRepositoryDeliveryEntry(input);
  const refused = await run();
  expect(refused, JSON.stringify({ injected: fault.injected(), trace: fault.trace, refused })).toMatchObject({ status: "refused", reason: "evidence-unavailable",
    recommendedActionText: expect.stringContaining(fault.refusal.condition) });
  expect(refused).toHaveProperty("recommendedActionText", expect.stringContaining(fault.refusal.remedy.text));
  expect(fault.injected()).toBe(1);
  fault.repair();
  expect(await run()).toMatchObject({ status: "correction-route-ambiguous", nextAction: "stop",
    planId: h.plan.planId, terminalDelta: { kind: "carries-non-lifecycle", nonLifecyclePaths: ["member-2.ts"] } });
}, 60_000);
