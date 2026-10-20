/** Ambiguous terminal aliases protect surviving edges while permitting unheld name acquisition. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../../../helpers/store/decompose-harness.js";
import { importRetiredAlias } from "../../../../../helpers/store/terminal-alias-harness.js";
import { lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit } from "../../../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../../../../../src/lib/store/kinds/meta/writers.js";

it("admits an unheld former name even when terminal generations share it", async () => {
  const h = createDecomposeHarness();
  await h.seedRetiredWorkUnit(await h.seedRenamedWorkUnit("former", "first"));
  await importRetiredAlias(h.store, "former", "second");
  expect(await h.store.lookup({ kind: "lineage", origin: "former" })).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
  expect(await h.seedStub("former")).toMatchObject({ reference: { owner: { name: "former" } } });
});

it("protects a held ambiguous former name and admits acquisition after its owner repairs the edge", async () => {
  const h = createDecomposeHarness();
  const provider = await h.seedRenamedWorkUnit("former", "first");
  await h.seedMeta("holder", { state: "Planning", currentWorkflow: null, dependsOn: ["former"] }, { kind: "backlog", commitment: "planned" });
  await h.seedRetiredWorkUnit(provider);
  await importRetiredAlias(h.store, "former", "second");
  const before = lifecycleSuccess(await h.store.version());
  await expect(h.seedStub("former")).rejects.toThrow(/Depends On.*holder/iu);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const holder = lifecycleSuccess(await readWorkUnit(h.store, "holder"));
  await h.handEdit(holder, writeMetaDependsOn(holder.content, []));
  expect(await h.seedStub("former")).toMatchObject({ reference: { owner: { name: "former" } } });
});
