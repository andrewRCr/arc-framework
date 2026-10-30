/** Command response storage uses actual native producers and checked evidence. */
import { createNativeReviewPerformanceFixture } from "../../../../fixtures/native-review-performance.js";
import { expect, it, onTestFinished } from "vitest";
import { createNativeReviewApprovalFixture } from "../../../../fixtures/native-review-approval.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createDispositionSet, approveDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { composeReviewDispositionRecord } from "../../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { NativeApprovedDispositionRecordStore } from "../../../../../src/scripts/review-gate/runtime/native-disposition-store.js";
import { bindNativeReviewPorts } from "../../../../helpers/store/native-review-ports.js";

async function nativeResponses(kind: "local" | "frontline" | "hosted") {
  const f = await createNativeReviewApprovalFixture(kind);
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const inFlight = bindNativeReviewPorts({ store: f.h.store, owner: f.primary.reference.owner,
    publisher, projectId: f.input.readProjectId }).inFlight;
  const input = { ...f.input, store: f.h.store, inFlight };
  return { ...f, publisher, input, responses: new NativeApprovedDispositionRecordStore(input) };
}

it.each(["local", "frontline", "hosted"] as const)("publishes a %s approval and replays its composed command record", async kind => {
  const f = await nativeResponses(kind);
  const result = await f.responses.appendDispositionRecord(f.input.record);
  const stored = await f.input.evidence.read(f.input.record.currentDispositionSetId);
  expect(stored).not.toBeNull();
  expect(JSON.parse(result.dispositionRecordRef)).toEqual(stored?.reference);
  const composed = await f.responses.readDispositionRecord(f.input.record.operationId);
  expect(composed).toMatchObject({ operationId: f.input.record.operationId,
    currentDispositionSetId: f.input.record.currentDispositionSetId });
  expect(await f.responses.listDispositionRecords()).toEqual([composed]);
  if (composed === null || stored === null) throw new Error("Expected a portable response");
  expect(await f.responses.appendDispositionRecord(composed)).toEqual(result);
  expect(lifecycleSuccess(await f.h.store.history({ reference: stored.reference }))).toHaveLength(1);
  expect(await f.publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

it.each(["local", "frontline", "hosted"] as const)("publishes a %s successor through one atomic native lineage advance", async kind => {
  const f = await nativeResponses(kind);
  await f.responses.appendDispositionRecord(f.input.record);
  const prior = await f.input.evidence.read(f.input.record.currentDispositionSetId);
  if (prior === null) throw new Error("Expected the approved predecessor");
  const { dispositionSetId: ignored, ...identity } = prior.value.dispositionSet;
  void ignored;
  const dispositionSet = createDispositionSet({ ...identity, proposedBy: "next-proposer" });
  const next = { ...prior.value, dispositionSet,
    approval: approveDispositionSet({ dispositionSet, approvedBy: "andrew", approvedAt: "2026-10-20T14:00:00Z" }),
    predecessorDispositionSetId: prior.value.dispositionSet.dispositionSetId };
  const record = composeReviewDispositionRecord(f.outcome, [{ ...prior.value,
    successorDispositionSetId: dispositionSet.dispositionSetId }, next], f.primary.reference.owner);
  const written = await f.responses.appendDispositionRecord(record);
  const current = await f.responses.readDispositionRecord(record.operationId);
  expect(current?.currentDispositionSetId).toBe(dispositionSet.dispositionSetId);
  const stored = await f.input.evidence.read(dispositionSet.dispositionSetId);
  expect(JSON.parse(written.dispositionRecordRef)).toEqual(stored?.reference);
  expect((await f.input.evidence.read(prior.value.dispositionSet.dispositionSetId))?.value.successorDispositionSetId)
    .toBe(dispositionSet.dispositionSetId);
  if (stored === null || current === null) throw new Error("Expected the successor");
  expect(await f.responses.appendDispositionRecord(current)).toEqual(written);
  expect(lifecycleSuccess(await f.h.store.history({ reference: stored.reference }))).toHaveLength(1);
  expect(lifecycleSuccess(await f.h.store.history({ reference: prior.reference }))).toHaveLength(2);
});

it.each(["errand", "delivery-member"] as const)("appends a verified %s fix and its performance together, then replays it", async kind => {
  const f = await createNativeReviewPerformanceFixture(kind);
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const inFlight = bindNativeReviewPorts({ store: f.h.store, owner: f.primary.reference.owner,
    publisher, projectId: f.ports.readProjectId }).inFlight;
  const responses = new NativeApprovedDispositionRecordStore({ ...f.ports, store: f.h.store, inFlight,
    now: () => "2026-10-20T15:00:00Z" });
  await responses.appendDispositionRecord(f.input.record);
  const stored = await f.ports.evidence.read(f.input.record.currentDispositionSetId);
  expect(stored?.value.performance).toEqual({ ...f.value.performance, performedAt: "2026-10-20T15:00:00Z" });
  if (stored === null) throw new Error("Expected the complete performed response");
  const history = lifecycleSuccess(await f.h.store.history({ reference: stored.reference }));
  expect(history).toHaveLength(2);
  expect(await responses.readDispositionRecord(f.input.record.operationId)).toEqual(f.input.record);
  await responses.appendDispositionRecord(f.input.record);
  expect(await f.ports.evidence.read(f.input.record.currentDispositionSetId)).toEqual(stored);
  expect(await publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});
