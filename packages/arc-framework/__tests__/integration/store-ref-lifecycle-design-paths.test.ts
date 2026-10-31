/** Retained Design coordinates select their exact companions through lifecycle rename. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { readLifecycleDesign } from "../../src/lib/store/lifecycle-design.js";
import { prepareStoreRename, readStoreRenameSubject } from "../../src/lib/store/lifecycle-rename.js";
import { writeMetaDesign } from "../../src/lib/store/kinds/meta/writers.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("retained Design paths in %s", layout => {
  it.each(["diagram.svg", "sub/notes.md"].flatMap(key => [false, true].map(rename => ({ key, rename }))))(
    "selects $key with its Purpose (rename: $rename)", async ({ key, rename }) => {
      const h = await refSyncFixture(layout), store = h.a.store;
      const created = success(await store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "example" } }),
        content: makeMetaFixture("example"), placement: { kind: "active" }, provenance: testProvenance }));
      const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: created.reference.owner, key });
      const content = "# Design\n\n**Purpose:** Preserve the exact relative coordinate.\n";
      success(await store.write({ action: "put", reference, expected: null, content, provenance: testProvenance }));
      const meta = success(await store.read({ reference: created.reference }));
      if (meta.reference.owner.type !== "work-item" || !meta.reference.owner.uid) throw new Error("Expected an allocated work item");
      const ref = `refs/arc/work/${meta.reference.owner.uid}`, path = "meta-example.md";
      const parent = (await h.a.git(["rev-parse", ref])).stdout.trim();
      // External state can retain parsed Design entries that today's writer would not newly introduce.
      await plantRef(h.a.root, ref, (await capturedEntries(h.a, ref)).map(entry => entry.path === path
        ? { path, content: writeMetaDesign(meta.content, [key]) } : entry), { parents: [parent], gitDir: h.a.gitDir });
      if (rename) {
        const subject = success(await readStoreRenameSubject(store, { sourceSlug: "example", targetSlug: "renamed" }));
        const prepared = success(await prepareStoreRename(store, subject, "renamed"));
        success(await store.batch({ writes: [...prepared.writes], provenance: { verb: "rename", lifecycleAction: "rename" } }));
      }
      const current = success(await store.read({ reference: meta.reference }));
      const selected = await readLifecycleDesign(store, current);
      expect(selected).toMatchObject({ record: { reference: { owner: { name: rename ? "renamed" : "example" }, key } }, content, warnings: [] });
      expect(selected.record?.fields).toMatchObject({ purpose: "Preserve the exact relative coordinate." });
    });
});
