/** Production review registrations enforce cross-record rules through atomic backend writes. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { performedEvidenceFixture, reviewEvidenceFixture } from "../../../fixtures/review-evidence.js";
import { recordReferences } from "../../../../src/lib/store/index.js";
import { reviewOutcomeKey } from "../../../../src/lib/store/kinds/review/outcome/key.js";
import { createDispositionSet, approveDispositionSet } from "../../../../src/scripts/review-gate/core/dispositions.js";

const provenance = { verb: "review-respond", lifecycleAction: "edit" };
async function scene() {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("test-work");
  const owner = meta.reference.owner;
  const { value, outcome } = performedEvidenceFixture();
  await h.seed(recordReferences["review/outcome"](owner, reviewOutcomeKey(outcome)), JSON.stringify(outcome));
  const prior = { ...reviewEvidenceFixture(outcome, "defer"), binding: value.binding };
  const successor = { ...value, performance: undefined, predecessorDispositionSetId: prior.dispositionSet.dispositionSetId };
  const parent = { ...prior, successorDispositionSetId: successor.dispositionSet.dispositionSetId };
  const reference = recordReferences["review/evidence"](owner, prior.dispositionSet.dispositionSetId);
  const nextReference = recordReferences["review/evidence"](owner, successor.dispositionSet.dispositionSetId);
  const stored = await h.seed(reference, JSON.stringify(prior));
  return { ...h, owner, prior, successor, parent, stored, reference, nextReference };
}

it("requires both response edges in the batch and reads the admitted reciprocal pair", async () => {
  const s = await scene();
  const parentWrite = { action: "put" as const, reference: s.reference, expected: s.stored.version, content: JSON.stringify(s.parent) };
  expect(await s.store.write({ ...parentWrite, provenance })).toMatchObject({ status: "refused",
    refusal: { code: "record-malformed", rule: "review.evidence.succession" } });
  expect(lifecycleSuccess(await s.store.read({ reference: s.reference })).content).toBe(s.stored.content);
  expect(await s.store.read({ reference: s.nextReference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  lifecycleSuccess(await s.store.batch({ writes: [parentWrite,
    { action: "put", reference: s.nextReference, expected: null, content: JSON.stringify(s.successor) }], provenance }));
  expect(lifecycleSuccess(await s.store.read({ reference: s.reference })).fields).toMatchObject({
    successorDispositionSetId: s.successor.dispositionSet.dispositionSetId });
  expect(lifecycleSuccess(await s.store.read({ reference: s.nextReference })).fields).toMatchObject({
    predecessorDispositionSetId: s.prior.dispositionSet.dispositionSetId });
});

it("refuses a second reciprocal successor without publishing either proposed change", async () => {
  const s = await scene();
  lifecycleSuccess(await s.store.batch({ writes: [
    { action: "put", reference: s.reference, expected: s.stored.version, content: JSON.stringify(s.parent) },
    { action: "put", reference: s.nextReference, expected: null, content: JSON.stringify(s.successor) }], provenance }));
  const current = lifecycleSuccess(await s.store.read({ reference: s.reference }));
  const { dispositionSetId: ignored, ...original } = s.successor.dispositionSet;
  void ignored;
  const dispositionSet = createDispositionSet({ ...original, proposedBy: "another-proposer" });
  const second = { ...s.successor, dispositionSet, approval: approveDispositionSet({ dispositionSet,
    approvedBy: "andrew", approvedAt: s.successor.approval.approvedAt }) };
  const secondReference = recordReferences["review/evidence"](s.owner, dispositionSet.dispositionSetId);
  expect(await s.store.batch({ writes: [
    { action: "put", reference: s.reference, expected: current.version,
      content: JSON.stringify({ ...s.parent, successorDispositionSetId: dispositionSet.dispositionSetId }) },
    { action: "put", reference: secondReference, expected: null, content: JSON.stringify(second) }], provenance }))
    .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "review.evidence.advance" } });
  expect(lifecycleSuccess(await s.store.read({ reference: s.reference })).content).toBe(current.content);
  expect(await s.store.read({ reference: secondReference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});
