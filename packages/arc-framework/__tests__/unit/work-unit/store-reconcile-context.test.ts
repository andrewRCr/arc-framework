/** Current-WU reconciliation reads dependency truth and companions through the store. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaTitle } from "../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { buildStoreCurrentWuReconcile } from "../../../src/lib/work-unit/store-current-wu-reconcile.js";
import { createStoreReconcilePrepareContext } from "../../../src/lib/work-unit/store-reconcile-context.js";
import { prepareCurrentWuReconcile } from "../../../src/lib/work-unit/side-effects/discharge-dep-edges.js";
import { workUnitMetaPath } from "../../../src/lib/store/lifecycle-write.js";

describe("store reconcile context", () => {
  it("refuses a clean plan when an acquired companion changes before apply", async () => {
    const h = createLifecycleHarness(), meta = await h.seedMeta("example");
    const notes = await h.seed(recordReferences["work-item/notes"](meta.reference.owner), "# Notes\n\nExisting.\n");
    const ceremony = buildStoreCurrentWuReconcile(h.store);
    const prepared = await ceremony.prepare({ slug: "example", metaPath: workUnitMetaPath(meta) });
    expect(prepared.prepared.edits).toEqual([]);
    lifecycleSuccess(await h.store.write({ ...recordPut(notes, { content: "# Notes\n\nChanged.\n" }), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const result = await ceremony.apply(prepared.prepared);
    expect(result).toMatchObject({ status: "conflict", reason: "stale-content", refusal: { code: "version-conflict" } });
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
    expect(lifecycleSuccess(await h.store.read({ reference: notes.reference })).content).toContain("Changed.");
  });

  it("resolves a former slug through lookup to the renamed primary", async () => {
    const h = createLifecycleHarness(), prior = await h.seedMeta("old");
    lifecycleSuccess(await h.store.write({ ...recordPut(prior, { content: writeMetaTitle(prior.content, SlugSchema.parse("new")) }),
      reference: { ...prior.reference, owner: OwnerIdentitySchema.parse({ ...prior.reference.owner, name: "new" }) },
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    await h.seedMeta("example", { dependsOn: ["old"] });
    const acquired = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "example"));
    expect(await acquired.context.queryDisposition?.({ origin: "old", dependentSlug: "example" })).toEqual({ status: "unique", disposition: { kind: "retarget", targetSlug: "new" } });
  });

  it("reads abandoned and cut dependency dispositions from terminal lineage", async () => {
    const h = createLifecycleHarness();
    await h.seedMeta("example");
    await h.seed(recordReferences["lineage/transition"](OwnerIdentitySchema.parse({ type: "work-item", name: "abandoned" })),
      writeLineageRecord({ schemaVersion: 2, origin: { name: SlugSchema.parse("abandoned") }, kind: "abandon", successors: [], incoming: [] }));
    await h.seed(recordReferences["lineage/transition"](OwnerIdentitySchema.parse({ type: "work-item", name: "cut" })),
      writeLineageRecord({ schemaVersion: 2, origin: { name: SlugSchema.parse("cut") }, kind: "decompose",
        successors: [{ name: SlugSchema.parse("member") }], incoming: [{ dependent: { name: SlugSchema.parse("example") },
          disposition: { kind: "replace", replacementTargets: [{ name: SlugSchema.parse("member") }] } }], outgoing: [] }));
    const acquired = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "example"));
    expect(await acquired.context.queryDisposition?.({ origin: "abandoned", dependentSlug: "example" })).toEqual({ status: "unique", disposition: { kind: "abandoned" } });
    expect(await acquired.context.queryDisposition?.({ origin: "cut", dependentSlug: "example" })).toEqual({ status: "unique", disposition: { kind: "replace", replacementTargets: ["member"] } });
  });
  it("discharges an integrating prerequisite while retaining live dependencies and acquiring prose", async () => {
    const h = createLifecycleHarness();
    await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
    await h.seedMeta("live");
    const meta = await h.seedMeta("example", { dependsOn: ["done", "live"] });
    const notes = await h.seed(recordReferences["work-item/notes"](meta.reference.owner), "# Notes\n\nContext.\n");
    const prepared = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "example"));
    expect(prepared.records.map((record) => record.reference)).toContainEqual(notes.reference);
    const result = await prepareCurrentWuReconcile(prepared.context, { slug: "example", metaPath: workUnitMetaPath(meta) });
    expect(result.status).toBe("pending");
    expect(result.prepared.plan.dependency.after).toEqual(["live"]);
    expect(result.prepared.plan.dependency.discharged).toEqual(["done"]);
  });
});
