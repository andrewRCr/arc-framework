/** Current-WU reconciliation reads dependency truth and companions through the store. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { recordPut, batchLifecycleWrites } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaTitle, writeMetaDesign } from "../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { runStoreRename } from "../../../src/lib/work-unit/verbs/rename-store.js";
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

it.each([false, true])("owner reconcile repairs alias-backed artifact references and reports narrative references, dependency=%s", async (dependency) => {
  const h = createLifecycleHarness(); await h.seedMeta("origin");
  const dependent = await h.seedMeta("dependent", { dependsOn: dependency ? ["origin"] : [] });
  const content = "# Notes\n\nRead `spec-origin.md`. Narrative origin context.\n";
  const notes = await h.seed(recordReferences["work-item/notes"](dependent.reference.owner), content);
  expect(await runStoreRename({ store: h.store, cwd: "/memory", baseBranch: "main", exec: async () => { throw Error("No Git needed"); },
    locusPorts: { findHoldingCheckout: async () => null, checkMarkerExclusivity: async () => ({ kind: "clear" }), writeAnchoredMarker: async () => ({ kind: "unadmitted" }) } },
  { sourceSlug: "origin", targetSlug: "successor" })).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: notes.reference })).content).toBe(content);
  const ceremony = buildStoreCurrentWuReconcile(h.store);
  const prepared = await ceremony.prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(prepared.status).toBe("pending");
  expect(prepared.prepared.plan.advisories).toContainEqual(expect.objectContaining({ subject: "origin", referenceKind: "narrative" }));
  expect(await ceremony.apply(prepared.prepared)).toMatchObject({ status: "applied" });
  expect(lifecycleSuccess(await h.store.read({ reference: notes.reference })).content).toBe("# Notes\n\nRead `spec-successor.md`. Narrative origin context.\n");
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference })).fields).toMatchObject({ dependsOn: dependency ? ["successor"] : [] });
  expect(await h.store.list({ family: "lineage", kind: "lineage/transition" })).toMatchObject({ status: "ok", result: { status: "absent" } });
});

it.each([false, true])("retains authenticated former-name retirement evidence, dependency=%s", async (dependency) => {
  const h = createLifecycleHarness(), origin = await h.seedMeta("origin");
  const dependent = await h.seedMeta("dependent", { dependsOn: dependency ? ["origin"] : [] });
  const content = "# Notes\n\nRead `spec-origin.md`. Narrative origin context.\n";
  const notes = await h.seed(recordReferences["work-item/notes"](dependent.reference.owner), content);
  expect(await runStoreRename({ store: h.store, cwd: "/memory", baseBranch: "main", exec: async () => { throw Error("No Git needed"); },
    locusPorts: { findHoldingCheckout: async () => null, checkMarkerExclusivity: async () => ({ kind: "clear" }), writeAnchoredMarker: async () => ({ kind: "unadmitted" }) } },
  { sourceSlug: "origin", targetSlug: "successor" })).toMatchObject({ status: "renamed" });
  const renamed = lifecycleSuccess(await h.store.read({ reference: origin.reference }));
  if (renamed.reference.owner.type !== "work-item") throw new Error("Expected a work item");
  lifecycleSuccess(await batchLifecycleWrites(h.store, [{ action: "remove", reference: renamed.reference, expected: renamed.version },
    { action: "put", reference: recordReferences["lineage/transition"](renamed.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: renamed.reference.owner.name, uid: renamed.reference.owner.uid },
        kind: "abandon", successors: [], incoming: [], retiredBranches: [] }) }], { verb: "abandon", lifecycleAction: "abandon" }));
  const ceremony = buildStoreCurrentWuReconcile(h.store);
  const prepared = await ceremony.prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(prepared.status).toBe("pending");
  expect(prepared.prepared.plan.dependency.after).toEqual([]);
  expect(prepared.prepared.plan.advisories).toContainEqual(expect.objectContaining({ subject: "origin", referenceKind: "dangling-artifact", suggestedDisposition: "remove-or-retarget" }));
  expect(prepared.prepared.plan.advisories).toContainEqual(expect.objectContaining({ subject: "origin", referenceKind: "narrative", suggestedDisposition: "remove-or-retarget" }));
  expect(await ceremony.apply(prepared.prepared)).toMatchObject({ status: dependency ? "applied" : "pending" });
  expect(lifecycleSuccess(await h.store.read({ reference: notes.reference })).content).toBe(content);
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference })).fields).toMatchObject({ dependsOn: [] });
});

it.each(["prd", "rfc"])("owner reconcile preserves a renamed paired spec's %s suffix", async (half) => {
  const h = createLifecycleHarness(), origin = await h.seedMeta("origin");
  for (const role of ["prd", "rfc"]) await h.seed(recordReferences["work-item/companion"](origin.reference.owner, `spec-${role}`), "# Design\n");
  lifecycleSuccess(await h.store.write({ ...recordPut(origin, { content: writeMetaDesign(origin.content, ["spec-origin-prd.md", "spec-origin-rfc.md"]) }),
    provenance: { verb: "repoint-design", lifecycleAction: "repoint-design" } }));
  const dependent = await h.seedMeta("dependent");
  const notes = await h.seed(recordReferences["work-item/notes"](dependent.reference.owner), `# Notes\n\nRead \`spec-origin-${half}.md\`.\n`);
  expect(await runStoreRename({ store: h.store, cwd: "/memory", baseBranch: "main", exec: async () => { throw Error("No Git needed"); },
    locusPorts: { findHoldingCheckout: async () => null, checkMarkerExclusivity: async () => ({ kind: "clear" }), writeAnchoredMarker: async () => ({ kind: "unadmitted" }) } },
  { sourceSlug: "origin", targetSlug: "successor" })).toMatchObject({ status: "renamed" });
  const ceremony = buildStoreCurrentWuReconcile(h.store);
  const prepared = await ceremony.prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(prepared.status).toBe("pending");
  expect(await ceremony.apply(prepared.prepared)).toMatchObject({ status: "applied" });
  expect(lifecycleSuccess(await h.store.read({ reference: notes.reference })).content)
    .toBe(`# Notes\n\nRead \`spec-successor-${half}.md\`.\n`);
});

it("refuses ambiguous paired-suffix ownership before rewriting an active owner's artifacts", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("origin"); await h.seedMeta("origin-prd");
  const dependent = await h.seedMeta("dependent");
  const notes = await h.seed(recordReferences["work-item/notes"](dependent.reference.owner), "# Notes\n\nRead `spec-origin-prd.md`.\n");
  expect(await runStoreRename({ store: h.store, cwd: "/memory", baseBranch: "main", exec: async () => { throw Error("No Git needed"); },
    locusPorts: { findHoldingCheckout: async () => null, checkMarkerExclusivity: async () => ({ kind: "clear" }), writeAnchoredMarker: async () => ({ kind: "unadmitted" }) } },
  { sourceSlug: "origin", targetSlug: "successor" })).toMatchObject({ status: "renamed" });
  const ceremony = buildStoreCurrentWuReconcile(h.store);
  const prepared = await ceremony.prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(prepared.status).toBe("conflict");
  expect(prepared.prepared.edits).toEqual([]);
  expect(lifecycleSuccess(await h.store.read({ reference: notes.reference }))).toEqual(notes);
});
