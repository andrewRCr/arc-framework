/** Primary alias projections are complete, state-bound copies of retained former names. */
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { StoreRecordSchema } from "../../../../src/lib/store/read.js";
import { RecordReferenceSchema, recordReferences } from "../../../../src/lib/store/identity.js";
it("exposes an explicit empty collection on a new primary", async () => {
  const h = createLifecycleHarness(); expect((await h.seedMeta("original")).aliases).toEqual([]);
});
it("reads and lists retained former names at the selected live or saved state", async () => {
  const h = createLifecycleHarness(), original = await h.seedMeta("original");
  const saved = lifecycleSuccess(await h.store.version());
  const renamed = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamed, expected: original.version, content: original.content.replaceAll("original", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  expect(lifecycleSuccess(await h.store.read({ reference: renamed })).aliases).toEqual(["original"]);
  expect(lifecycleSuccess(await h.store.read({ reference: original.reference, asOf: saved })).aliases).toEqual([]);
  const listing = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
  expect(listing.status === "complete" ? listing.records[0]?.aliases : null).toEqual(["original"]);
  const historical = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta", asOf: saved }));
  expect(historical.status === "complete" ? historical.records[0]?.aliases : null).toEqual([]);
});
it("keeps returned alias edits separate from live and saved backend state", async () => {
  const h = createLifecycleHarness(), original = await h.seedMeta("original");
  const saved = lifecycleSuccess(await h.store.version());
  original.aliases?.push(SlugSchema.parse("forged"));
  expect(lifecycleSuccess(await h.store.read({ reference: original.reference })).aliases).toEqual([]);
  expect(lifecycleSuccess(await h.store.read({ reference: original.reference, asOf: saved })).aliases).toEqual([]);
});
it("admits slug aliases only on primary records and keeps companion projections absent", async () => {
  const h = createLifecycleHarness(), original = await h.seedMeta("original");
  const companion = await h.seed(recordReferences["work-item/description"](original.reference.owner), "Description");
  expect(StoreRecordSchema.safeParse({ ...original, aliases: ["former"] }).success).toBe(true);
  expect(StoreRecordSchema.safeParse({ ...original, aliases: ["Not A Slug"] }).success).toBe(false);
  expect(StoreRecordSchema.safeParse({ ...companion, aliases: [] }).success).toBe(false);
  expect(companion).not.toHaveProperty("aliases");
});
