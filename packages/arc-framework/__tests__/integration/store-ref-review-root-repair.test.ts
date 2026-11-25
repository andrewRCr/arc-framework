/** Explicit repair inventories real independent approvals before applying any choice. */
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { runReviewRootRepair } from "../../src/lib/store/review-root-repair.js";
import { success } from "../helpers/store/suite-tools.js";
import { ReviewRootRepairBasisSchema } from "../../src/lib/store/review-root-repair-schema.js";
import { publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";
import { reviewEvidenceFixture } from "../fixtures/review-evidence.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import type { Store } from "../../src/lib/store/contract.js";
import type { BatchInput } from "../../src/lib/store/write.js";

it.each(["default", "separate"] as const)("previews every approved branch without changing authoritative refs (%s)", async layout => {
  const f = await competingReviewRoots(layout);
  const before = await retainedStateRefs(f);
  const preview = success(await runReviewRootRepair({ store: f.b.store, now: () => "2026-11-03T10:00:00Z",
    request: { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId } }));
  expect(preview).toMatchObject({ schemaVersion: 1, state: "preview-ready", workItem: f.owner, producerId: f.outcome.attemptId,
    eligibleChoices: expect.arrayContaining([f.fix.value.dispositionSet.dispositionSetId, f.defer.value.dispositionSet.dispositionSetId]),
    branches: expect.arrayContaining([
      { root: f.fix.value.dispositionSet.dispositionSetId, records: [expect.objectContaining({ value: f.fix.value, performed: false, settled: false })] },
      { root: f.defer.value.dispositionSet.dispositionSetId, records: [expect.objectContaining({ value: f.defer.value, performed: false, settled: false })] },
    ]), basis: { selector: { expected: null }, evidence: expect.any(Array), outcome: { expected: { conflicts: [] } } } });
  if (preview.state !== "preview-ready") throw new Error("Expected eligible root choices");
  expect(ReviewRootRepairBasisSchema.parse(preview.basis)).toEqual(preview.basis);
  expect(await retainedStateRefs(f)).toEqual(before);
}, 120_000);

it.each(["default", "separate"] as const)("keeps a basis applicable across an unrelated owner's change (%s)", async layout => {
  const f = await competingReviewRoots(layout), now = () => "2026-11-03T10:00:00Z";
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const preview = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (preview.state !== "preview-ready") throw new Error("Expected eligible root choices");
  success(await f.b.store.write({ action: "put", expected: null, placement: { kind: "active" },
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "unrelated" } }),
    content: renderMetaFile("unrelated", { state: "Active", owner: "test-user", workClass: "Light" }),
    provenance: { verb: "start", lifecycleAction: "activate" } }));
  expect(await runReviewRootRepair({ store: f.b.store, now, request: { ...request, operation: "apply", basis: preview.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId, decidedBy: "andrew", reason: "Continue the fix." } }))
    .toMatchObject({ status: "ok", result: { state: "applied" } });
}, 120_000);

it.each(["default", "separate"] as const)("detects a new root inside atomic admission and repairs after fresh preview (%s)", async layout => {
  const f = await competingReviewRoots(layout), now = () => "2026-11-03T10:00:00Z";
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const preview = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (preview.state !== "preview-ready") throw new Error("Expected eligible root choices");
  let raced = false;
  const store = new Proxy(f.b.store, { get(target, key) {
    if (key === "batch") return async (input: BatchInput) => {
      if (!raced) { raced = true; await addOfflineRoot(f); }
      return target.batch(input);
    };
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } }) satisfies Store;
  const apply = { ...request, operation: "apply", basis: preview.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId, decidedBy: "andrew", reason: "Continue the fix." };
  expect(await runReviewRootRepair({ store, now, request: apply })).toMatchObject({ status: "refused",
    refusal: { code: "record-malformed", class: "recoverable", remedy: { text: expect.stringContaining("repair-review-roots") } } });
  expect(await f.b.store.read({ reference: preview.basis.selector.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const fresh = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (fresh.state !== "preview-ready") throw new Error("Expected eligible roots after the race");
  expect(fresh.basis.roots).toHaveLength(3);
  expect(await runReviewRootRepair({ store: f.b.store, now, request: { ...apply, basis: fresh.basis } }))
    .toMatchObject({ status: "ok", result: { state: "applied" } });
}, 120_000);

async function addOfflineRoot(f: Awaited<ReturnType<typeof competingReviewRoots>>): Promise<void> {
  if (f.owner.type !== "work-item" || f.owner.uid === undefined) throw new Error("Expected an exact work-item generation");
  await f.a.git(["update-ref", `refs/arc/work/${f.owner.uid}`, f.seedState]);
  await publishNativeReviewApproval({ ...f.nativeA,
    record: composeReviewDispositionRecord(f.outcome, [reviewEvidenceFixture(f.outcome, "reject")], f.owner) });
  success(await f.a.store.pull());
  success(await f.a.store.push());
  success(await f.b.store.pull());
}

it.each(["default", "separate"] as const)("applies only the observed selector and resumes selected reads (%s)", async layout => {
  const f = await competingReviewRoots(layout), now = () => "2026-11-03T10:00:00Z";
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const preview = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (preview.state !== "preview-ready") throw new Error("Expected eligible root choices");
  const before = await f.nativeB.evidence.list();
  const apply = { ...request, operation: "apply", basis: preview.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId, decidedBy: "andrew", reason: "Continue the approved fix." };
  const applied = success(await runReviewRootRepair({ store: f.b.store, now, request: apply }));
  expect(applied).toMatchObject({ schemaVersion: 1, state: "applied", selectedRoot: apply.selectedRoot,
    roots: preview.basis.roots, selector: { reference: preview.basis.selector.reference, version: expect.any(String) } });
  expect(await f.nativeB.evidence.list()).toEqual(before);
  expect(await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId)).toMatchObject({ currentDispositionSetId: apply.selectedRoot });
  expect(await runReviewRootRepair({ store: f.b.store, now, request: apply })).toMatchObject({ status: "refused",
    refusal: { code: "version-conflict", remedy: { text: expect.stringContaining("repair-review-roots") } } });
}, 120_000);

async function retainedStateRefs(f: Awaited<ReturnType<typeof competingReviewRoots>>): Promise<string[]> {
  const listed = await f.b.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc"]);
  // Snapshot reads retain their manifest through this existing local token.
  return listed.stdout.split("\n").filter(line => !line.startsWith("refs/arc/tmp/version "));
}

it.each(["default", "separate"] as const)("receives a valid remote selection without broken-rule warnings (%s)", async layout => {
  const f = await competingReviewRoots(layout), now = () => "2026-11-03T10:00:00Z";
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const preview = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (preview.state !== "preview-ready") throw new Error("Expected eligible root choices");
  success(await runReviewRootRepair({ store: f.b.store, now, request: { ...request, operation: "apply", basis: preview.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId, decidedBy: "andrew", reason: "Continue the approved fix." } }));
  success(await f.b.store.push());
  success(await f.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/companion", owner: f.owner, key: "independent.md" }),
    content: "Independent local planning edit.\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const pulled = success(await f.a.store.pull());
  expect(pulled.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "rule-broken")).toEqual([]);
  expect(await f.nativeA.evidence.readDispositionRecord(f.outcome.attemptId))
    .toMatchObject({ currentDispositionSetId: f.fix.value.dispositionSet.dispositionSetId });
  expect(await f.nativeA.evidence.list()).toEqual(await f.nativeB.evidence.list());
}, 120_000);
