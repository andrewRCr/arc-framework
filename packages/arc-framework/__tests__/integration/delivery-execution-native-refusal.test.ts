/** Native delivery execution retains inner Store remedies through verification and resumes the exact request. */
import { expect, it } from "vitest";
import { createNativePendingResponseFixture, createNativeVerificationFixture, invokeNativeDelivery, createNativePublishedDeliveryFixture, seedNativeClosedDeliveryTasks, carryNativeDeliveryStatus } from "../helpers/store/native-delivery-refusal.js";
import { refuseNativeListing, refuseNativeRecordRead } from "../helpers/store/native-record-fault.js";

it("preserves acknowledgment's native review-listing remedy and acknowledges after repair", async () => {
  const h = await createNativeVerificationFixture();
  const fault = await refuseNativeListing(h.reference.store, { family: "review", kind: "review/evidence",
    owner: h.primary.reference.owner });
  const run = () => invokeNativeDelivery(h, "review-fix-acknowledge", h.request, fault.store);
  const refused = await run();
  expect(refused.result, refused.output).toMatchObject({ status: "refused", reason: "candidate-verification-unavailable",
    recommendedActionText: expect.stringContaining(fault.refusal.condition) });
  expect(refused.result).toHaveProperty("recommendedActionText", expect.stringContaining(fault.refusal.remedy.text));
  expect(fault.injected()).toBe(1);
  fault.repair();
  const repaired = await run();
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result).toMatchObject({ status: "acknowledged", nextAction: "resolve-delivery-status",
    candidate: { candidateId: h.candidate.attestation.candidateId }, boundaryCarry: { stateRevision: h.verificationRevision + 1 } });
}, 60_000);

it("preserves the authoring authority listing refusal and rematerializes from the same continue request after repair", async () => {
  const h = await createNativePendingResponseFixture();
  const position = await invokeNativeDelivery(h, "position", { planId: h.plan.planId, repository: "owner/repo", remote: "origin" });
  expect(position.result, position.output).toMatchObject({ status: "position" });
  const fault = await refuseNativeListing(h.reference.store, { family: "review", kind: "review/evidence",
    owner: h.primary.reference.owner }, 2);
  const request = { repository: "owner/repo", remote: "origin" };
  const run = () => invokeNativeDelivery(h, "review-fix-continue", request, fault.store);
  const refused = await run();
  expect(refused.result, JSON.stringify({ output: refused.output, injected: fault.injected() })).toMatchObject({ status: "rejected",
    reason: fault.refusal.condition, refusal: fault.refusal });
  expect(fault.injected()).toBe(1);
  fault.repair();
  const repaired = await run();
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result, repaired.output).toMatchObject({ status: "authoring-required",
    selectedDeliverableId: h.vehicle.deliverableId, authoring: { kind: "candidate" }, effectLog: expect.arrayContaining([
      expect.objectContaining({ actionKind: "delivery-review-fix-authoring-rematerialize", resultStatus: "rematerialized" }),
    ]) });
}, 60_000);

it.each(["verification", "response"] as const)("preserves the %s entry's listing remedy and resumes after repair", async phase => {
  const h = phase === "verification" ? await createNativeVerificationFixture() : await createNativePendingResponseFixture();
  const fault = await refuseNativeListing(h.reference.store, { family: "review", kind: "review/evidence",
    owner: h.primary.reference.owner });
  const request = { repository: "owner/repo", remote: "origin" };
  const run = () => invokeNativeDelivery(h, "review-fix-continue", request, fault.store);
  const refused = await run();
  expect(refused.result, refused.output).toMatchObject({ status: "refused", reason: "review-fix-response-unavailable",
    recommendedActionText: expect.stringContaining(fault.refusal.condition) });
  expect(refused.result).toHaveProperty("recommendedActionText", expect.stringContaining(fault.refusal.remedy.text));
  expect(fault.injected()).toBe(1);
  fault.repair();
  const repaired = await run();
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result, repaired.output).toMatchObject({
    status: phase === "verification" ? "verification-required" : "authoring-required",
    selectedDeliverableId: h.plan.members.at(phase === "verification" ? -1 : 0)!.deliverableId });
}, 60_000);


it("preserves the composed review-status refusal and resumes the same continuation after repair", async () => {
  const h = await createNativePublishedDeliveryFixture();
  await seedNativeClosedDeliveryTasks(h);
  await carryNativeDeliveryStatus(h);
  const { recordReferences } = await import("../../src/lib/store/identity.js");
  const fault = await refuseNativeRecordRead(h.reference.store, recordReferences["review/integration-boundary"](h.primary.reference.owner), 3);
  const request = { repository: "owner/repo", remote: "origin" };
  const run = () => invokeNativeDelivery(h, "review-fix-continue", request, fault.store);
  const refused = await run();
  expect(refused.result, refused.output).toMatchObject({ status: "refused", reason: "review-status-unavailable",
    recommendedActionText: expect.stringContaining(fault.refusal.condition) });
  expect(refused.result).toHaveProperty("recommendedActionText", expect.stringContaining(fault.refusal.remedy.text));
  expect(fault.injected()).toBe(1);
  fault.repair();
  const repaired = await run();
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result, repaired.output).toMatchObject({ status: "review-status-required", nextAction: "review-hosted-request" });
}, 60_000);


it("preserves the post-status response replay refusal and offers the same findings after repair", async () => {
  const { createNativeHostedFindingsFixture } = await import("../helpers/store/native-hosted-refusal.js");
  const h = await createNativeHostedFindingsFixture();
  const fault = await refuseNativeListing(h.reference.store, { family: "review", kind: "review/evidence",
    owner: h.primary.reference.owner }, 22);
  const request = { repository: "owner/repo", remote: "origin" };
  const run = () => invokeNativeDelivery(h, "review-fix-continue", request, fault.store);
  const refused = await run();
  expect(refused.result, refused.output).toMatchObject({ status: "refused",
    reason: "review-fix-response-replay-unavailable", recommendedActionText: expect.stringContaining(fault.refusal.condition) });
  expect(refused.result).toHaveProperty("recommendedActionText", expect.stringContaining(fault.refusal.remedy.text));
  expect(fault.injected()).toBe(1);
  fault.repair();
  const repaired = await run();
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result, repaired.output).toMatchObject({ status: "review-status-required", nextAction: "respond-to-findings" });
}, 60_000);


it("preserves terminal reconciliation's native Candidate refusal and rebinds after repair", async () => {
  const h = await createNativePublishedDeliveryFixture();
  const { recordReferences } = await import("../../src/lib/store/identity.js");
  const fault = await refuseNativeRecordRead(h.reference.store, recordReferences["review/candidate"](h.primary.reference.owner));
  const request = { planId: h.plan.planId, repository: "owner/repo", remote: "origin" };
  const run = () => invokeNativeDelivery(h, "reconcile", request, fault.store);
  const refused = await run();
  expect(refused.result, refused.output).toMatchObject({ status: "refused", reason: "terminal-rebind-unavailable",
    recommendedActionText: expect.stringContaining(fault.refusal.condition) });
  expect(refused.result).toHaveProperty("recommendedActionText", expect.stringContaining(fault.refusal.remedy.text));
  expect(fault.injected()).toBe(1);
  fault.repair();
  const repaired = await run();
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result, repaired.output).toMatchObject({ status: "rebound" });
}, 60_000);
