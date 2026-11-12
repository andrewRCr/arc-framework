/** Checked fixture histories and competing writes remain observable through the store. */
import { expect, it } from "vitest";
import { createDecomposeHarness, withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";

it("lands a competing edit before forwarding the batch and leaves its other writes atomic", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("origin");
  const notes = await h.seed(recordReferences["work-item/notes"](primary.reference.owner), "# Notes\n\nBefore.\n");
  const raced = withCompetingBatch(h.store, async () => {
    lifecycleSuccess(await h.store.write({ ...recordPut(notes, { content: "# Notes\n\nCompeting edit.\n" }),
      provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  });
  const input = { writes: [{ action: "remove" as const, reference: notes.reference, expected: notes.version }, recordPut(primary)],
    provenance: { verb: "decompose", lifecycleAction: "terminal" } };
  expect(await raced.batch(input)).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  expect(lifecycleSuccess(await h.store.read({ reference: notes.reference })).content).toContain("Competing edit.");
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).version).toBe(primary.version);
  const fresh = lifecycleSuccess(await h.store.read({ reference: notes.reference }));
  expect(await raced.batch({ ...input, writes: [{ action: "remove", reference: fresh.reference, expected: fresh.version }] }))
    .toMatchObject({ status: "ok" });
});

it("plants a cross-type name race with an explicit refusal rather than claiming backend enforcement", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("origin");
  const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "taken" }));
  const refusal: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [reference],
    condition: "A work item took the cohort name.", remedy: { text: "Choose another cohort name." } };
  const raced = withCompetingBatch(h.store, async () => { await h.seedMeta("taken"); }, refusal);
  expect(await raced.batch({ writes: [recordPut(primary)], provenance: { verb: "decompose", lifecycleAction: "additive" } }))
    .toEqual({ status: "refused", refusal });
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: primary.reference.owner.name })).reference).toEqual(primary.reference);
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("taken") })).reference.owner.name)
    .toBe("taken");
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).version).toBe(primary.version);
});

it("seeds a renamed generation whose former slug still resolves", async () => {
  const h = createDecomposeHarness();
  const renamed = await h.seedRenamedWorkUnit("before", "after");
  expect(renamed.reference.owner.name).toBe("after");
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("before") })).reference)
    .toEqual(renamed.reference);
});

it("seeds terminal lineage with the retired generation and no live primary", async () => {
  const h = createDecomposeHarness();
  const lineage = await h.seedRetiredWorkUnit("retired");
  expect(lineage.fields).toMatchObject({ kind: "abandon", origin: { name: "retired", uid: lineage.reference.owner.type === "work-item" ? lineage.reference.owner.uid : undefined } });
  expect(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("retired") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.lookup({ kind: "lineage", origin: SlugSchema.parse("retired") })).reference)
    .toEqual(lineage.reference);
});

it("seeds completed work and open or completed cohort documents through their production checks", async () => {
  const h = createDecomposeHarness();
  const completed = await h.seedCompletedWorkUnit("shipped");
  expect(completed.placement).toMatchObject({ kind: "completed", quarter: "2026-q4" });
  expect(completed.fields).toMatchObject({ state: "Shipped" });
  const outer = await h.seedCohort("outer");
  const inner = await h.seedCohort("outer/inner");
  const ended = await h.seedCohort("ended", true);
  expect(outer.fields).toMatchObject({ parent: null, purpose: "Shared decomposition coordination." });
  expect(inner.fields).toMatchObject({ parent: "outer" });
  expect(ended.placement).toMatchObject({ kind: "completed" });
});

it("persists hand edits under write-back provenance", async () => {
  const h = createDecomposeHarness();
  const primary = await h.seedStub("origin");
  const notes = await h.seed(recordReferences["work-item/notes"](primary.reference.owner), "# Notes\n\nBefore.\n");
  const edited = await h.handEdit(notes, "# Notes\n\nAfter.\n");
  expect(edited.content).toBe("# Notes\n\nAfter.\n");
  expect(lifecycleSuccess(await h.store.history({ reference: notes.reference }))[0]?.provenance)
    .toMatchObject({ verb: "write-back", lifecycleAction: "edit" });
});
