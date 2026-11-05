/** Independent native approvals preserve competing roots and require explicit repair. */
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { success } from "../helpers/store/suite-tools.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { reviewEvidenceRootSelectionKey } from "../../src/lib/store/kinds/review/evidence-root-selection/key.js";
import { outcomeLaneOperationId } from "../../src/scripts/review-gate/hosts/local/lane-outcome-composition.js";
import { publishNativeConditionalPass } from "../../src/scripts/review-gate/runtime/native-conditional-pass.js";
import { publishNativeReviewPerformance } from "../../src/scripts/review-gate/runtime/native-review-performance.js";

it.each(["default", "separate"] as const)("retains both independently approved roots and refuses composition (%s)", async layout => {
  const f = await competingReviewRoots(layout);
  const listed = await f.nativeB.evidence.list();
  expect(listed.status).toBe("complete");
  if (listed.status !== "complete") throw new Error(listed.reason);
  expect(listed.records.map(record => record.value)).toEqual(expect.arrayContaining([f.fix.value, f.defer.value]));
  expect(listed.records).toHaveLength(2);
  await expect(f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId)).rejects.toMatchObject({
    refusal: { code: "record-malformed", rule: "review.evidence.root" } });
}, 120_000);

it.each((["default", "separate"] as const).flatMap(layout => (["local", "frontline"] as const).map(source => ({ layout, source }))))(
  "composes the selected $source response without rewriting either approval ($layout)", async ({ layout, source }) => {
  const f = await competingReviewRoots(layout, source);
  const listed = await selectRoot(f, f.fix.value.dispositionSet.dispositionSetId);
  const after = success(await f.b.store.list({ family: "review", kind: "review/evidence", owner: f.owner }));
  if (after.status !== "complete") throw new Error("expected complete evidence");
  expect(after.records).toEqual(listed.records);
  expect(await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId)).toMatchObject({
    currentDispositionSetId: f.fix.value.dispositionSet.dispositionSetId, approvedDispositionLineage: [
      { approvedDisposition: { dispositionSet: f.fix.value.dispositionSet } }] });
  const operation = await f.nativeB.inFlight.readOperation(outcomeLaneOperationId(f.outcome));
  expect(operation.state).toMatchObject({ kind: "lane-progress", attempts: [{ attemptId: f.outcome.attemptId, outcome: "findings" }] });
  const snapshot = await f.nativeB.inFlight.readOperationSnapshot();
  expect(snapshot.status).toBe("complete");
  if (snapshot.status !== "complete") throw new Error(snapshot.reason);
  expect(snapshot.records.map(record => record.state)).toContainEqual(operation.state);
  const record = await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId);
  if (record === null) throw new Error("expected selected approval");
  await publishNativeReviewPerformance({ ...f.nativeB, record, performance: { schemaVersion: 1,
    producerId: f.outcome.attemptId, dispositionSetId: f.fix.value.dispositionSet.dispositionSetId,
    originatingHeadSha: f.outcome.target.headSha, producedHeadSha: "e".repeat(40), performedAt: "2026-11-03T10:02:00Z" } });
  expect((await f.nativeB.inFlight.readOperation(outcomeLaneOperationId(f.outcome))).state).toMatchObject({
    kind: "lane-progress", attempts: [{ attemptId: f.outcome.attemptId, outcome: "settled-findings" }] });
  expect(await f.nativeB.evidence.read(f.defer.value.dispositionSet.dispositionSetId)).toEqual(f.defer);
}, 120_000);

it.each(["default", "separate"] as const)("refuses conditional-pass authority from an excluded approved fix (%s)", async layout => {
  const f = await competingReviewRoots(layout);
  await selectRoot(f, f.defer.value.dispositionSet.dispositionSetId);
  const capture = { lane: f.outcome.lane, repositoryId: f.outcome.target.repositoryId, headSha: f.outcome.target.headSha,
    lineage: f.outcome.lineage, producerId: f.outcome.attemptId, dispositionSetId: f.fix.value.dispositionSet.dispositionSetId,
    authorizedBy: f.fix.value.approval.approvedBy, exhaustedPassCount: f.outcome.logicalPass, nextPass: f.outcome.logicalPass + 1,
    now: "2026-11-03T10:01:00Z" };
  await expect(publishNativeConditionalPass({ ...f.nativeB, capture })).rejects.toThrow(/selected|current approved/u);
}, 120_000);

async function selectRoot(f: Awaited<ReturnType<typeof competingReviewRoots>>, selectedRoot: string) {
  const listed = success(await f.b.store.list({ family: "review", kind: "review/evidence", owner: f.owner }));
  if (listed.status !== "complete") throw new Error("expected complete evidence");
  const outcome = success(await f.b.store.read({ reference: recordReferences["review/outcome"](f.owner, f.fix.value.result.outcomeKey),
    asOf: listed.asOf }));
  const reference = recordReferences["review/evidence-root-selection"](f.owner, reviewEvidenceRootSelectionKey(f.owner, f.outcome.attemptId));
  success(await f.b.store.batch({ writes: [{ action: "put", reference, expected: null, content: JSON.stringify({
    schemaVersion: 1, producerId: f.outcome.attemptId, ...f.fix.value.result,
    roots: [f.fix, f.defer].map(record => record.value.dispositionSet.dispositionSetId).sort(),
    selectedRoot, decidedBy: "andrew", decidedAt: "2026-11-03T10:00:00Z",
    reason: "Continue the approved fix." }) }], provenance: { verb: "repair-review-roots", lifecycleAction: "edit" },
    observations: [...listed.records, outcome].map(record => ({ reference: record.reference,
      expected: { version: record.version, conflicts: record.conflicts } })) }));
  return listed;
}
