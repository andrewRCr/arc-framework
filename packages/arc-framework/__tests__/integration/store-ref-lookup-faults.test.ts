import { expect, it } from "vitest";

import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRef } from "../helpers/store/ref-plant.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const ref = `refs/arc/work/${uid}`;

async function unreadableOwnerInterval(fault: "absent" | "unparseable") {
  const f = await createRefFixture(), from = await f.settle();
  await plantRef(f.root, ref, [
    ...fault === "absent" ? [] : [{ path: `metadata-${uid}.json`, content: "not JSON" }],
    { path: "extra-alpha.md", content: "Kept companion content.\n" },
  ]);
  return { store: f.store, from, to: await f.settle() };
}

it.each(["absent", "unparseable"] as const)("uses historical repairs for %s owner metadata while binding saved names", async fault => {
  const { store, from, to } = await unreadableOwnerInterval(fault);
  const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: { type: "work-item", name: "alpha" }, key: "extra" });
  expect(await store.changes({ from, to, references: [reference] })).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: ref, remedy: { text: expect.stringContaining("ancestor") },
  } });
});

it.each(["absent", "unparseable"] as const)("uses historical repairs for %s live metadata while binding saved lineage names", async fault => {
  const { store, from, to } = await unreadableOwnerInterval(fault);
  const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "alpha" } });
  expect(await store.changes({ from, to, references: [reference] })).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: ref, remedy: { text: expect.stringContaining("ancestor") },
  } });
});

it.each(["absent", "unparseable"] as const)("uses historical repairs for %s registry metadata while binding saved lineage names", async fault => {
  const f = await createRefFixture(), from = await f.settle();
  const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "alpha" } });
  await plantRef(f.root, "refs/arc/project/registry", [
    ...fault === "absent" ? [] : [{ path: "metadata-registry.json", content: "not JSON" }],
    { path: `lineage/${uid}.json`, content: f.content(reference) },
  ]);
  expect(await f.store.changes({ from, to: await f.settle(), references: [reference] })).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/project/registry",
    remedy: { text: expect.stringContaining("ancestor") },
  } });
});
