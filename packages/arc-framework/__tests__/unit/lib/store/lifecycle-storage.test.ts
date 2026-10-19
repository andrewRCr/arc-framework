/** Lifecycle snapshots expose record-bound versions independently of namespace movement. */
import { expect, it } from "vitest";
import { createStoreLifecycleStorage } from "../../../../src/lib/store/lifecycle-storage.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { writeMetaPriority } from "../../../../src/lib/store/kinds/meta/writers.js";

it("selects every listed meta version and keeps it pinned as the store advances", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("first"), second = await h.seedMeta("second");
  const storage = createStoreLifecycleStorage({ store: h.store, checkoutRoot: "/project" });
  const snapshot = await storage.readSnapshot();
  expect(snapshot.metaVersion("first")).toBe(first.version);
  expect(snapshot.metaVersion("second")).toBe(second.version);
  expect(snapshot.metaVersion("unlisted")).toBeNull();
  expect(snapshot.metaVersion("first")).not.toBe(snapshot.version);
  const advanced = lifecycleSuccess(await h.store.write({ action: "put", reference: first.reference,
    expected: first.version, placement: { kind: "active" }, content: writeMetaPriority(first.content, "P1"),
    provenance: { verb: "set-priority", lifecycleAction: "edit" } }));
  const next = await storage.readSnapshot();
  expect(next.version).not.toBe(snapshot.version);
  expect(next.metaVersion("first")).toBe(advanced.version);
  expect(snapshot.metaVersion("first")).toBe(first.version);
  expect(next.metaVersion("second")).toBe(second.version);
});
