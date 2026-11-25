/** Production kind checks and envelope admission are active in the verb harness. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import type { BatchInput } from "../../../../src/lib/store/index.js";
it("reads seeded metadata through its production parser", async () => {
  const harness = createLifecycleHarness();
  const record = await harness.seedMeta("example");
  expect(lifecycleSuccess(await harness.store.read({ reference: record.reference })).fields)
    .toMatchObject({ state: "Active", owner: "test-user", pause: null });
});
it("throws on a malformed mutation before backend state changes", async () => {
  const harness = createLifecycleHarness();
  await harness.seedMeta("example");
  const before = lifecycleSuccess(await harness.store.version());
  expect(() => harness.store.batch({ writes: [], provenance: { verb: "test", lifecycleAction: "update" } } as BatchInput)).toThrow();
  expect(lifecycleSuccess(await harness.store.version())).toBe(before);
});
it("refuses a seed's unresolved dependency through production checks", async () => {
  const harness = createLifecycleHarness();
  await expect(harness.seedMeta("example", { dependsOn: ["missing"] })).rejects.toThrow(/Unresolved new dependencies/u);
});
