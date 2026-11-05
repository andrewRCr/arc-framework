/** Offline performed work invalidates unsafe authority while every approved fact remains recoverable. */
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { success } from "../helpers/store/suite-tools.js";
import { runReviewRootRepair } from "../../src/lib/store/review-root-repair.js";
import { publishNativeReviewPerformance } from "../../src/scripts/review-gate/runtime/native-review-performance.js";
import { outcomeLaneOperationId } from "../../src/scripts/review-gate/hosts/local/lane-outcome-composition.js";
import { publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";

it.each(["default", "separate"] as const)("retains late offline work, refuses stale authority, and resumes a fresh eligible choice (%s)", async layout => {
  const f = await competingReviewRoots(layout), now = () => "2026-11-03T10:00:00Z";
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const first = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (first.state !== "preview-ready") throw new Error("Expected an eligible initial choice");
  const choice = { ...request, operation: "apply", decidedBy: "andrew", reason: "Continue the explicit eligible branch." };
  success(await runReviewRootRepair({ store: f.b.store, now, request: { ...choice, basis: first.basis,
    selectedRoot: f.defer.value.dispositionSet.dispositionSetId } }));
  success(await f.b.store.push());
  const old = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (old.state !== "preview-ready") throw new Error("Expected a current preview before offline publication");
  const record = await f.nativeA.evidence.readDispositionRecord(f.outcome.attemptId);
  if (record === null) throw new Error("Expected the offline clone's independently approved fix");
  const performance = { schemaVersion: 1 as const, producerId: f.outcome.attemptId,
    dispositionSetId: f.fix.value.dispositionSet.dispositionSetId, originatingHeadSha: f.outcome.target.headSha,
    producedHeadSha: "e".repeat(40), performedAt: "2026-11-03T10:02:00Z" };
  await publishNativeReviewPerformance({ ...f.nativeA, record, performance });
  success(await f.a.store.push());
  success(await f.b.store.pull());
  expect(await f.nativeB.evidence.read(f.fix.value.dispositionSet.dispositionSetId))
    .toMatchObject({ value: { ...f.fix.value, performance } });
  expect(await f.nativeB.evidence.read(f.defer.value.dispositionSet.dispositionSetId)).toEqual(f.defer);
  for (const read of [() => f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId),
    () => f.nativeB.evidence.listDispositionRecords(), () => f.nativeB.responses.read(f.outcome.attemptId, "authority"),
    () => f.nativeB.inFlight.readOperation(outcomeLaneOperationId(f.outcome)),
    () => publishNativeReviewApproval({ ...f.nativeB,
      record: composeReviewDispositionRecord(f.outcome, [f.defer.value], f.owner) })]) {
    await expect(read()).rejects.toMatchObject({ refusal: { code: "record-malformed", rule: "review.evidence-root-selection.policy" } });
  }
  expect(await runReviewRootRepair({ store: f.b.store, now, request: { ...choice, basis: old.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId } }))
    .toMatchObject({ status: "refused", refusal: { code: "version-conflict", remedy: { text: expect.stringContaining("repair-review-roots") } } });
  const fresh = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (fresh.state !== "preview-ready") throw new Error("Expected the one protected branch to remain eligible");
  expect(fresh.eligibleChoices).toEqual([f.fix.value.dispositionSet.dispositionSetId]);
  expect(await runReviewRootRepair({ store: f.b.store, now, request: { ...choice, basis: fresh.basis,
    selectedRoot: f.defer.value.dispositionSet.dispositionSetId } }))
    .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "review.evidence-root-selection.choice" } });
  success(await runReviewRootRepair({ store: f.b.store, now, request: { ...choice, basis: fresh.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId } }));
  expect((await f.nativeB.inFlight.readOperation(outcomeLaneOperationId(f.outcome))).state)
    .toMatchObject({ kind: "lane-progress", attempts: [{ attemptId: f.outcome.attemptId, outcome: "settled-findings" }] });
}, 120_000);
