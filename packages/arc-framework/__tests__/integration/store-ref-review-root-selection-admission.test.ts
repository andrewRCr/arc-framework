/** Alternate local writers obey exact observations, immutable bindings, and selected-branch admission. */
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { success } from "../helpers/store/suite-tools.js";
import { runReviewRootRepair } from "../../src/lib/store/review-root-repair.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { ReviewEvidenceRootSelectionSchema } from "../../src/lib/store/kinds/review/evidence-root-selection/schema.js";
import { createNativeReviewApprovalEvidence, publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";
import { currentApprovedDispositionNode } from "../../src/scripts/review-gate/core/advisory-records.js";
import { reviewEvidenceFixture } from "../fixtures/review-evidence.js";
import { publishNativeConditionalPass } from "../../src/scripts/review-gate/runtime/native-conditional-pass.js";
import { publishNativeReviewPerformance } from "../../src/scripts/review-gate/runtime/native-review-performance.js";
import { readNativeApprovedFixPassJudgment } from "../../src/scripts/review-gate/runtime/native-frontline-window.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { NativeApprovedDispositionRecordStore } from "../../src/scripts/review-gate/runtime/native-disposition-store.js";

const provenance = { verb: "repair-review-roots", lifecycleAction: "edit" };
const cases = (["default", "separate"] as const).flatMap(layout =>
  (["observations", "removal", "key", "binding"] as const).map(fault => ({ layout, fault })));

it.each(cases)("refuses selector $fault violations and keeps normal continuation ($layout)", async ({ layout, fault }) => {
  const f = await repaired(layout), selector = f.selector;
  const value = ReviewEvidenceRootSelectionSchema.parse(JSON.parse(selector.content));
  const reference = fault === "key" ? recordReferences["review/evidence-root-selection"](f.owner, canonicalDigest({ other: 1 })) : selector.reference;
  const next = fault === "binding" ? { ...value, resultDigest: canonicalDigest({ other: 2 }) } : value;
  const result = fault === "removal" ? await f.b.store.write({ action: "remove", reference, expected: selector.version, provenance })
    : await f.b.store.batch({ writes: [{ action: "put", reference, expected: fault === "key" ? null : selector.version,
      content: JSON.stringify(next) }], provenance,
      observations: fault === "observations" ? [] : [...f.basis.evidence, f.basis.outcome] });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    rule: `review.evidence-root-selection.${fault}` } });
  expect(success(await f.b.store.read({ reference: selector.reference }))).toEqual(selector);
  success(await f.b.store.batch({ writes: [{ action: "put", reference: selector.reference, expected: selector.version,
    content: selector.content }], provenance, observations: [...f.basis.evidence, f.basis.outcome] }));
  expect(await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId))
    .toMatchObject({ currentDispositionSetId: f.fix.value.dispositionSet.dispositionSetId });
}, 120_000);

it.each(["default", "separate"] as const)("refuses another root even when its batch enlarges the selector inventory (%s)", async layout => {
  const f = await repaired(layout);
  const approved = composeReviewDispositionRecord(f.outcome, [reviewEvidenceFixture(f.outcome, "reject")], f.owner);
  const third = createNativeReviewApprovalEvidence(approved, currentApprovedDispositionNode(approved), f.outcome, "2026-11-03T10:01:00Z");
  const reference = recordReferences["review/evidence"](f.owner, third.dispositionSet.dispositionSetId);
  const value = ReviewEvidenceRootSelectionSchema.parse(JSON.parse(f.selector.content));
  const enlarged = { ...value, roots: [...value.roots, third.dispositionSet.dispositionSetId].sort(),
    selectedRoot: third.dispositionSet.dispositionSetId };
  expect(await f.b.store.batch({ writes: [{ action: "put", reference, expected: null, content: JSON.stringify(third) },
    { action: "put", reference: f.selector.reference, expected: f.selector.version, content: JSON.stringify(enlarged) }],
    provenance, observations: [...f.basis.evidence, f.basis.outcome] }))
    .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "review.evidence.root" } });
  expect(await f.b.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await f.b.store.read({ reference: f.selector.reference }))).toEqual(f.selector);
  expect(await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId))
    .toMatchObject({ currentDispositionSetId: f.fix.value.dispositionSet.dispositionSetId });
}, 120_000);

it.each(["default", "separate"] as const)("allows excluded exact replay while refusing an excluded performance advance (%s)", async layout => {
  const f = await repaired(layout);
  const performance = { schemaVersion: 1 as const, producerId: f.outcome.attemptId,
    dispositionSetId: f.defer.value.dispositionSet.dispositionSetId, originatingHeadSha: f.outcome.target.headSha,
    producedHeadSha: "e".repeat(40), performedAt: "2026-11-03T10:02:00Z" };
  await expect(f.nativeB.evidence.advance({ ...f.defer.value, performance }, f.defer.version)).rejects.toMatchObject({
    refusal: { code: "record-malformed", rule: "review.evidence-root-selection.policy" } });
  await f.nativeB.evidence.advance(f.defer.value, f.defer.version);
  expect(await f.nativeB.evidence.read(f.defer.value.dispositionSet.dispositionSetId)).toEqual(f.defer);
  expect(await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId))
    .toMatchObject({ currentDispositionSetId: f.fix.value.dispositionSet.dispositionSetId });
}, 120_000);

it.each((["default", "separate"] as const).flatMap(layout =>
  (["publisher", "adapter"] as const).map(seam => ({ layout, seam }))))(
  "refuses excluded approval authority through the $seam while retaining raw replay ($layout)", async ({ layout, seam }) => {
  const f = await repaired(layout);
  const adapter = new NativeApprovedDispositionRecordStore({ ...f.nativeB, store: f.b.store });
  const excluded = composeReviewDispositionRecord(f.outcome, [f.defer.value], f.owner);
  await expect(seam === "publisher" ? publishNativeReviewApproval({ ...f.nativeB, record: excluded })
    : adapter.appendDispositionRecord(excluded)).rejects.toThrow(/selected|current/u);
  await f.nativeB.evidence.advance(f.defer.value, f.defer.version);
  expect(await f.nativeB.evidence.read(f.defer.value.dispositionSet.dispositionSetId)).toEqual(f.defer);
  const selected = await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId);
  if (selected === null) throw new Error("Expected selected approval after excluded replay refusal");
  if (seam === "publisher") expect(await publishNativeReviewApproval({ ...f.nativeB, record: selected })).toEqual(f.fix);
  else expect(await adapter.appendDispositionRecord(selected)).toEqual({ dispositionRecordRef: JSON.stringify(f.fix.reference) });
}, 120_000);

async function repaired(layout: "default" | "separate") {
  const f = await competingReviewRoots(layout), now = () => "2026-11-03T10:00:00Z";
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const first = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (first.state !== "preview-ready") throw new Error("Expected a complete initial inventory");
  success(await runReviewRootRepair({ store: f.b.store, now, request: { ...request, operation: "apply", basis: first.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId, decidedBy: "andrew", reason: "Continue the selected fix." } }));
  const fresh = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (fresh.state !== "preview-ready") throw new Error("Expected the current complete basis");
  const selector = success(await f.b.store.read({ reference: fresh.basis.selector.reference }));
  return { ...f, basis: fresh.basis, selector };
}

it.each(["default", "separate"] as const)("retains the missing-producer remedy before an approved fix can continue (%s)", async layout => {
  const f = await repaired(layout), producerId = f.outcome.attemptId;
  await publishNativeConditionalPass({ ...f.nativeB, capture: { lane: f.outcome.lane,
    repositoryId: f.outcome.target.repositoryId, headSha: f.outcome.target.headSha, lineage: f.outcome.lineage,
    producerId, dispositionSetId: f.fix.value.dispositionSet.dispositionSetId, authorizedBy: f.fix.value.approval.approvedBy,
    exhaustedPassCount: f.outcome.logicalPass, nextPass: f.outcome.logicalPass + 1, now: "2026-11-03T10:01:00Z" } });
  const home = expandStoredPath(f.selector.reference), saved = await capturedEntries(f.b, home.ref);
  const lost = new Set([...f.basis.evidence, f.basis.outcome, f.basis.selector].map(entry => expandStoredPath(entry.reference).path));
  const parent = (await f.b.git(["rev-parse", home.ref])).stdout.trim();
  const damaged = await plantRef(f.b.root, home.ref, saved.filter(entry => !lost.has(entry.path)),
    { parents: [parent], gitDir: f.b.gitDir });
  const input = { repositoryId: f.outcome.target.repositoryId, lineage: f.outcome.lineage, lane: f.outcome.lane,
    producerId, passCount: f.outcome.logicalPass, headSha: "e".repeat(40) };
  await expect(readNativeApprovedFixPassJudgment(f.nativeB, input))
    .rejects.toThrow("Restore the approved fix response before retrying its frontline continuation.");
  await plantRef(f.b.root, home.ref, saved, { parents: [damaged.tip], gitDir: f.b.gitDir });
  const record = await f.nativeB.evidence.readDispositionRecord(producerId);
  if (record === null) throw new Error("Expected restored approved fix");
  await publishNativeReviewPerformance({ ...f.nativeB, record, performance: { schemaVersion: 1, producerId,
    dispositionSetId: f.fix.value.dispositionSet.dispositionSetId, originatingHeadSha: f.outcome.target.headSha,
    producedHeadSha: input.headSha, performedAt: "2026-11-03T10:02:00Z" } });
  expect(await readNativeApprovedFixPassJudgment(f.nativeB, input)).toEqual({ exhaustedPassCount: f.outcome.logicalPass,
    nextPass: f.outcome.logicalPass + 1, conditionalPassAuthorizationId: expect.any(String) });
}, 120_000);
