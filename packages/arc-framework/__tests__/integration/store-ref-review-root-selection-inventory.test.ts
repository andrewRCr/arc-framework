/** Aggregate review reads reject every malformed selector coordinate in their captured inventory. */
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { success } from "../helpers/store/suite-tools.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { runReviewRootRepair } from "../../src/lib/store/review-root-repair.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

it.each(["default", "separate"] as const)("refuses an extra producer selector and resumes exact restoration in %s", async layout => {
  const f = await competingReviewRoots(layout), now = () => "2026-11-03T10:00:00Z";
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const preview = success(await runReviewRootRepair({ store: f.b.store, now, request }));
  if (preview.state !== "preview-ready") throw new Error("Expected a complete initial inventory");
  success(await runReviewRootRepair({ store: f.b.store, now, request: { ...request, operation: "apply", basis: preview.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId, decidedBy: "andrew", reason: "Continue the approved fix." } }));
  const reference = preview.basis.selector.reference, home = expandStoredPath(reference), extra = { ...reference, key: "zz" };
  const saved = await capturedEntries(f.b, home.ref), parent = (await f.b.git(["rev-parse", home.ref])).stdout.trim();
  const tree = (await f.b.git(["rev-parse", `${home.ref}^{tree}`])).stdout.trim();
  const selector = saved.find(entry => entry.path === home.path);
  if (!selector) throw new Error("Expected the canonical selector entry");
  const damaged = await plantRef(f.b.root, home.ref, [...saved, { ...selector, path: expandStoredPath(extra).path }],
    { parents: [parent], gitDir: f.b.gitDir });
  for (const read of [() => f.nativeB.evidence.listDispositionRecords(), () => f.nativeB.responses.list()]) {
    await expect(read()).rejects.toMatchObject({ refusal: { code: "record-malformed", class: "recoverable", reference: extra,
      rule: "review.evidence-root-selection.key", remedy: { text: expect.stringContaining(JSON.stringify(extra)) } } });
  }
  const restored = await plantRef(f.b.root, home.ref, saved, { parents: [damaged.tip], gitDir: f.b.gitDir });
  expect(restored.tree).toBe(tree);
  expect(await f.nativeB.evidence.listDispositionRecords()).toMatchObject([
    { currentDispositionSetId: f.fix.value.dispositionSet.dispositionSetId },
  ]);
  expect((await f.nativeB.responses.list()).evidence.map(record => record.value)).toEqual([f.fix.value]);
}, 120_000);
