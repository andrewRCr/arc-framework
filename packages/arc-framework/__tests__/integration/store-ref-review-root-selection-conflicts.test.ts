/** Independent attributed choices retain a conflict and recover through the same native command. */
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { success } from "../helpers/store/suite-tools.js";
import { runReviewRootRepair } from "../../src/lib/store/review-root-repair.js";
import { runArcWithStdin } from "../e2e/helpers.js";
import { ReviewRootRepairResultSchema } from "../../src/lib/store/review-root-repair-schema.js";
import { WholeRecordConflictSchema } from "../../src/lib/store/conflict.js";
import { ReviewEvidenceRootSelectionSchema } from "../../src/lib/store/kinds/review/evidence-root-selection/schema.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import type { Store } from "../../src/lib/store/contract.js";
import type { BatchInput } from "../../src/lib/store/write.js";

it.each((["default", "separate"] as const).flatMap(layout =>
  (["intact", "malformed", "mismatched"] as const).map(alternative => ({ layout, alternative }))))(
  "repairs $alternative alternatives from opposite choices through the CLI ($layout)", async ({ layout, alternative }) => {
  const f = await conflictingSelections(layout);
  const { now, request, choice, raw } = f;
  const before = await f.nativeB.evidence.list();
  for (const read of [() => f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId),
    () => f.nativeB.evidence.listDispositionRecords(), () => f.nativeB.responses.list()]) {
    await expect(read()).rejects.toMatchObject({ refusal: { code: "record-malformed", reference: raw.reference,
      condition: expect.stringContaining(JSON.stringify(raw.conflicts[0])),
      remedy: { text: expect.stringContaining("repair-review-roots - with JSON") } } });
  }
  if (alternative === "intact") {
    const inspection = success(await runReviewRootRepair({ store: f.b.store, now, request }));
    if (inspection.state !== "preview-ready") throw new Error("Expected the complete selector conflict basis");
    expect(await f.b.store.batch({ writes: [{ action: "put", reference: raw.reference, expected: raw.version,
      content: raw.content, resolves: [] }], provenance: { verb: "repair-review-roots", lifecycleAction: "edit" },
      observations: [...inspection.basis.evidence, inspection.basis.outcome, inspection.basis.selector,
        ...inspection.basis.selectorAlternatives] })).toMatchObject({ status: "refused", refusal: {
        code: "record-malformed", rule: "review.evidence-root-selection.conflict" } });
    expect(success(await f.b.store.read({ reference: raw.reference }))).toEqual(raw);
  }
  if (alternative !== "intact") {
    const conflictReference = raw.conflicts[0];
    if (conflictReference === undefined) throw new Error("Expected the retained selector conflict");
    const conflict = success(await f.b.store.read({ reference: conflictReference }));
    const value = WholeRecordConflictSchema.parse(JSON.parse(conflict.content));
    if (value.incoming.value === null) throw new Error("Expected an independently chosen incoming selector");
    const selected = ReviewEvidenceRootSelectionSchema.parse(JSON.parse(value.incoming.value.content));
    value.incoming.value.content = alternative === "malformed" ? "unparseable selector content"
      : JSON.stringify({ ...selected, resultDigest: canonicalDigest({ another: 1 }) });
    const home = expandStoredPath(conflictReference), saved = await capturedEntries(f.b, home.ref);
    const parent = (await f.b.git(["rev-parse", home.ref])).stdout.trim();
    const damaged = await plantRef(f.b.root, home.ref, saved.map(entry => entry.path === home.path
      ? { path: entry.path, content: JSON.stringify(value) } : entry), { parents: [parent], gitDir: f.b.gitDir });
    expect(await runReviewRootRepair({ store: f.b.store, now, request })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", condition: expect.stringContaining(JSON.stringify(conflictReference)),
      remedy: { text: expect.stringContaining(JSON.stringify(conflictReference)) } } });
    await plantRef(f.b.root, home.ref, saved, { parents: [damaged.tip], gitDir: f.b.gitDir });
  }
  const previewOutput = await runArcWithStdin(["store", "repair-review-roots", "-"], f.b.root, JSON.stringify(request));
  expect(previewOutput.exitCode, previewOutput.stderr || previewOutput.stdout).toBe(0);
  const preview = ReviewRootRepairResultSchema.parse(JSON.parse(previewOutput.stdout));
  if (preview.status !== "ok" || preview.result.state !== "preview-ready") throw new Error("Expected conflicted native preview");
  const { basis, selector } = preview.result;
  expect(basis.selector.expected?.conflicts).toEqual(raw.conflicts);
  expect(selector.alternatives.map(entry => entry.reference)).toEqual(raw.conflicts);
  expect(selector.alternatives[0]?.value).toMatchObject({ record: raw.reference });
  const apply = { ...choice, selectedRoot: f.fix.value.dispositionSet.dispositionSetId, basis };
  const partial = await runArcWithStdin(["store", "repair-review-roots", "-"], f.b.root,
    JSON.stringify({ ...apply, basis: { ...basis, selector: { ...basis.selector,
      expected: { ...basis.selector.expected, conflicts: [] } } } }));
  expect(partial.exitCode).toBe(1);
  expect(ReviewRootRepairResultSchema.parse(JSON.parse(partial.stdout))).toMatchObject({ status: "refused",
    refusal: { code: "version-conflict", remedy: { text: expect.stringContaining("repair-review-roots") } } });
  expect(success(await f.b.store.read({ reference: raw.reference }))).toEqual(raw);
  const applied = await runArcWithStdin(["store", "repair-review-roots", "-"], f.b.root, JSON.stringify(apply));
  expect(applied.exitCode, applied.stderr || applied.stdout).toBe(0);
  expect(ReviewRootRepairResultSchema.parse(JSON.parse(applied.stdout))).toMatchObject({ status: "ok", result: { state: "applied" } });
  expect(success(await f.b.store.read({ reference: raw.reference })).conflicts).toEqual([]);
  expect(await f.nativeB.evidence.list()).toEqual(before);
  expect(await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId)).toMatchObject({ currentDispositionSetId: apply.selectedRoot });
  expect((await f.nativeB.responses.list()).evidence.map(record => record.value)).toEqual([f.fix.value]);
}, 180_000);

async function conflictingSelections(layout: "default" | "separate") {
  const f = await competingReviewRoots(layout), now = () => "2026-11-03T10:00:00Z";
  success(await f.b.store.push());
  success(await f.a.store.pull());
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const left = success(await runReviewRootRepair({ store: f.a.store, now, request }));
  const right = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (left.state !== "preview-ready" || right.state !== "preview-ready") throw new Error("Expected independent eligible choices");
  const choice = { ...request, operation: "apply", decidedBy: "andrew", reason: "Continue this explicit branch." };
  success(await runReviewRootRepair({ store: f.a.store, now, request: { ...choice, basis: left.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId } }));
  success(await runReviewRootRepair({ store: f.b.store, now, request: { ...choice, basis: right.basis,
    selectedRoot: f.defer.value.dispositionSet.dispositionSetId } }));
  success(await f.a.store.push());
  success(await f.b.store.pull());
  const raw = success(await f.b.store.read({ reference: right.basis.selector.reference }));
  expect(raw.conflicts).toHaveLength(1);
  return { ...f, now, request, choice, raw };
}


it.each(["default", "separate"] as const)("refuses a conflict added after inspection and resolves a fresh complete set (%s)", async layout => {
  const f = await conflictingSelections(layout);
  const resolve = success(await runReviewRootRepair({ store: f.b.store, now: f.now, request: f.request }));
  if (resolve.state !== "preview-ready") throw new Error("Expected the initial selector conflict");
  success(await runReviewRootRepair({ store: f.b.store, now: f.now, request: { ...f.choice, basis: resolve.basis,
    selectedRoot: f.defer.value.dispositionSet.dispositionSetId, reason: "Choose the published no-fix branch." } }));
  success(await f.b.store.push());
  const settled = success(await f.b.store.read({ reference: f.raw.reference }));
  expect(settled.conflicts).toEqual([]);
  const preview = success(await runReviewRootRepair({ store: f.b.store, now: f.now, request: f.request }));
  if (preview.state !== "preview-ready") throw new Error("Expected the first complete conflict basis");
  let raced = false;
  const store = new Proxy(f.b.store, { get(target, key) {
    if (key === "batch") return async (input: BatchInput) => {
      if (!raced) {
        raced = true;
        const freshA = success(await runReviewRootRepair({ store: f.a.store, now: f.now, request: f.request }));
        if (freshA.state !== "preview-ready") throw new Error("Expected the other clone's current choice");
        success(await runReviewRootRepair({ store: f.a.store, now: f.now, request: { ...f.choice,
          basis: freshA.basis, selectedRoot: f.fix.value.dispositionSet.dispositionSetId, reason: "Reaffirm after another observation." } }));
        success(await f.a.store.push());
        success(await f.b.store.pull());
      }
      return target.batch(input);
    };
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } }) satisfies Store;
  expect(await runReviewRootRepair({ store, now: f.now, request: { ...f.choice, basis: preview.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId } })).toMatchObject({ status: "refused", refusal: {
      class: "recoverable", remedy: { text: expect.stringContaining("repair-review-roots") } } });
  const retained = success(await f.b.store.read({ reference: f.raw.reference }));
  expect(retained.content).toBe(settled.content);
  expect(retained.version).toBe(settled.version);
  expect(retained.conflicts).toHaveLength(1);
  const fresh = success(await runReviewRootRepair({ store: f.b.store, now: f.now, request: f.request }));
  if (fresh.state !== "preview-ready") throw new Error("Expected the fresh complete conflict basis");
  expect(fresh.selector.alternatives).toHaveLength(1);
  success(await runReviewRootRepair({ store: f.b.store, now: f.now, request: { ...f.choice, basis: fresh.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId } }));
  expect(success(await f.b.store.read({ reference: f.raw.reference })).conflicts).toEqual([]);
  expect(await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId))
    .toMatchObject({ currentDispositionSetId: f.fix.value.dispositionSet.dispositionSetId });
}, 180_000);
