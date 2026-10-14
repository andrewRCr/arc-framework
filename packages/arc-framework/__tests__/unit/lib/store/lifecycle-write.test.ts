/** Lifecycle writes preserve caller provenance, expected versions, and unrelated links. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { writeMetaClass } from "../../../../src/lib/store/kinds/meta/writers.js";
import { batchLifecycleWrites, recordPut, readWorkUnit, mergeLifecycleLinks } from "../../../../src/lib/store/lifecycle-write.js";
import type { Links } from "../../../../src/lib/store/index.js";
it("lands a verb's complete writes in one batch and retains its provenance", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const a = await seedMeta("first"), b = await seedMeta("second");
  const provenance = { verb: "set-class", lifecycleAction: "classify" };
  const result = lifecycleSuccess(await batchLifecycleWrites(store,
    [recordPut(a, { content: writeMetaClass(a.content, "Heavy") }), recordPut(b, { content: writeMetaClass(b.content, "Novel") })], provenance));
  for (const [record, workClass] of [[a, "Heavy"], [b, "Novel"]] as const) {
    expect(lifecycleSuccess(await readWorkUnit(store, record.reference.owner.name)).fields).toMatchObject({ workClass });
    const history = lifecycleSuccess(await store.history({ reference: record.reference }));
    expect(history[0]?.provenance).toMatchObject({ ...provenance, batchId: result.batchId });
  }
});
it("refuses a stale basis atomically and preserves the store code and remedy", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const a = await seedMeta("first"), b = await seedMeta("second");
  lifecycleSuccess(await batchLifecycleWrites(store, [recordPut(a, { content: writeMetaClass(a.content, "Heavy") })],
    { verb: "set-class", lifecycleAction: "classify" }));
  const result = await batchLifecycleWrites(store,
    [recordPut(a, { content: writeMetaClass(a.content, "Novel") }), recordPut(b, { content: writeMetaClass(b.content, "Novel") })],
    { verb: "set-class", lifecycleAction: "classify" });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", remedy: { text: expect.any(String) } } });
  expect(lifecycleSuccess(await readWorkUnit(store, "first")).fields).toMatchObject({ workClass: "Heavy" });
  expect(lifecycleSuccess(await readWorkUnit(store, "second")).fields).toMatchObject({ workClass: "Light" });
});
it("retains unrelated link entries, replaces keyed entries, and retires only named keys", () => {
  const branch = (ref: string, linkedAs: "created" | "adopted" = "created") => ({ repository: "repo", ref, linkedAs, excluded: [] });
  const capture = { repository: "repo", sha: "a".repeat(40) };
  const prior: Links = { branches: [branch("old"), branch("kept"), branch("replaced")], changeRequest: { repository: "repo", number: 2 },
    taskCaptures: { "1.1": [capture], "1.2": [], "1.3": [] } };
  expect(mergeLifecycleLinks(prior, { branches: [branch("new"), branch("replaced", "adopted")], taskCaptures: { "1.2": [capture] } },
    { branches: [branch("old")], taskCaptures: ["1.3"] })).toEqual({
    branches: [branch("kept"), branch("replaced", "adopted"), branch("new")], changeRequest: prior.changeRequest,
    taskCaptures: { "1.1": [capture], "1.2": [capture] },
  });
});
