/** A lifecycle snapshot must observe a change confined to a held work unit's record. */
import { expect, it } from "vitest";

import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedStore } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import {
  lifecycleRepository, lifecycleSnapshot, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS, readLifecycleMeta,
} from "../helpers/store-lifecycle-fixture.js";

it("changes the snapshot when a held record changes in a repository without a remote", async () => {
  const { repo } = await lifecycleRepository();
  const { meta } = await seedWorkUnit(repo, "reserved", { identity: LIFECYCLE_IDENTITY,
    meta: { state: "Planning", owner: LIFECYCLE_IDENTITY, currentWorkflow: "draft-design" } });
  const before = await lifecycleSnapshot(repo);

  const content = makeMetaFixture("reserved", { state: "Planning", owner: LIFECYCLE_IDENTITY, currentWorkflow: "create-spec" });
  await seedStore(repo, LIFECYCLE_IDENTITY, [{ reference: meta.reference, expected: meta.version,
    placement: { kind: "active" }, content }]);
  expect((await readLifecycleMeta(repo, "reserved")).content).toBe(content);
  const after = await lifecycleSnapshot(repo);
  expect(after.refs).toBe(before.refs);
  expect(after.storeRefs).not.toBe(before.storeRefs);
}, LIFECYCLE_TIMEOUT_MS);
