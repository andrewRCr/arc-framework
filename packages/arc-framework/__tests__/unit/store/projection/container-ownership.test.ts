/** A stored primary establishes only the physical container its placement and cohort identify. */
import { expect, it } from "vitest";
import { resolveBacklogOwnership } from "../../../../src/lib/store/projection/container-ownership.js";
import { identifyArcFileAddress, resolveArcPath } from "../../../../src/lib/layout/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { classifyStoreAddress } from "../../../../src/lib/store/target-classification.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";

it("uses the sole stored outer container for a nested companion without writing state", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("alpha", { state: "Planning", priority: "P1", currentWorkflow: "draft-design" },
    { kind: "backlog", commitment: "planned" });
  const before = lifecycleSuccess(await h.store.version()), path = ".arc/backlog/planned/alpha/beta/note.txt";
  const result = await resolveBacklogOwnership({ checkout: "/unused", identity: "test-user", path, store: h.store, index: { entries: {} } });
  expect(result).toMatchObject({ kind: "owned", record: { reference: primary.reference } });
  if (result.kind !== "owned") throw new Error("Expected alpha's established container");
  expect(resolveArcPath(result.container)).toBe(".arc/backlog/planned/alpha");
  const address = identifyArcFileAddress(path, { workItem: result.container });
  expect(address).not.toBeNull();
  expect(address === null ? null : classifyStoreAddress(address)).toMatchObject({
    kind: "work-item/companion", workItem: "alpha", key: "beta/note.txt",
  });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("uses the sole inner member container instead of treating its cohort as a work item", async () => {
  const h = createLifecycleHarness();
  await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "alpha" })),
    "# Cohort: alpha\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n");
  const primary = await h.seedMeta("beta", { state: "Planning", priority: "P1", currentWorkflow: "draft-design", cohort: "alpha" },
    { kind: "backlog", commitment: "planned" });
  const before = lifecycleSuccess(await h.store.version()), path = ".arc/backlog/planned/alpha/beta/note.txt";
  const result = await resolveBacklogOwnership({ checkout: "/unused", identity: "test-user", path, store: h.store, index: { entries: {} } });
  expect(result).toMatchObject({ kind: "owned", record: { reference: primary.reference } });
  if (result.kind !== "owned") throw new Error("Expected beta's established container");
  expect(resolveArcPath(result.container)).toBe(".arc/backlog/planned/alpha/beta");
  const address = identifyArcFileAddress(path, { workItem: result.container });
  expect(address === null ? null : classifyStoreAddress(address)).toMatchObject({
    kind: "work-item/companion", workItem: "beta", key: "note.txt",
  });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
