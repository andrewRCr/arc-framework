/** Lost producer or approval records never turn a retained selector into absent or excluded authority. */
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { success } from "../helpers/store/suite-tools.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { runReviewRootRepair } from "../../src/lib/store/review-root-repair.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

const cases = (["default", "separate"] as const).flatMap(layout =>
  (["outcome", "selected-root", "all-evidence", "malformed-selector", "wrong-evidence-key", "wrong-outcome-key"] as const)
    .map(fault => ({ layout, fault })));

it.each(cases)("refuses $fault and resumes after exact forward restoration ($layout)", async ({ layout, fault }) => {
  const f = await competingReviewRoots(layout), now = () => "2026-11-03T10:00:00Z";
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const preview = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (preview.state !== "preview-ready") throw new Error("Expected a complete initial inventory");
  success(await runReviewRootRepair({ store: f.b.store, now, request: { ...request, operation: "apply", basis: preview.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId, decidedBy: "andrew", reason: "Continue the approved fix." } }));
  const selector = preview.basis.selector.reference, home = expandStoredPath(selector);
  const outcomePath = expandStoredPath(recordReferences["review/outcome"](f.owner, f.fix.value.result.outcomeKey)).path;
  const fixPath = expandStoredPath(f.fix.reference).path, deferPath = expandStoredPath(f.defer.reference).path;
  const saved = await capturedEntries(f.b, home.ref), parent = (await f.b.git(["rev-parse", home.ref])).stdout.trim();
  const removed = fault === "outcome" ? [outcomePath] : fault === "selected-root" ? [fixPath] : [fixPath, deferPath];
  const damaged = fault === "malformed-selector" ? saved.map(entry => entry.path === home.path
    ? { path: entry.path, content: "unparseable selector JSON" } : entry)
    : fault === "wrong-evidence-key" || fault === "wrong-outcome-key" ? saved.map(entry => {
      const reference = fault === "wrong-evidence-key" ? f.fix.reference : preview.basis.outcome.reference;
      return entry.path === expandStoredPath(reference).path
        ? { ...entry, path: expandStoredPath({ ...reference, key: canonicalDigest({ wrong: fault }) }).path } : entry;
    }) : saved.filter(entry => !removed.includes(entry.path));
  const corrupt = await plantRef(f.b.root, home.ref, damaged, { parents: [parent], gitDir: f.b.gitDir });
  for (const read of [() => f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId),
    () => f.nativeB.evidence.listDispositionRecords(), () => f.nativeB.responses.read(f.outcome.attemptId, "authority"),
    () => f.nativeB.responses.list()]) {
    await expect(read()).rejects.toMatchObject({ refusal: { code: "record-malformed", class: "recoverable" } });
  }
  const refused = await runReviewRootRepair({ store: f.b.store, now, request });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable" } });
  if (fault === "malformed-selector") expect(refused).toMatchObject({ refusal: {
    reference: selector, remedy: { text: expect.stringContaining("Restore the exact selector content") } } });
  await plantRef(f.b.root, home.ref, saved, { parents: [corrupt.tip], gitDir: f.b.gitDir });
  expect(await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId))
    .toMatchObject({ currentDispositionSetId: f.fix.value.dispositionSet.dispositionSetId });
  expect((await f.nativeB.responses.list()).evidence.map(record => record.value)).toEqual([f.fix.value]);
}, 120_000);
