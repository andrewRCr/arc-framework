/** A stored primary establishes only the physical container its placement and cohort identify. */
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { expect, it } from "vitest";
import { resolveBacklogOwnership, resolveEstablishedContainer } from "../../../../src/lib/store/projection/container-ownership.js";
import { identifyArcFileAddress, resolveArcPath } from "../../../../src/lib/layout/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { classifyStoreAddress } from "../../../../src/lib/store/target-classification.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { ArcLayoutAddressSchema } from "../../../../src/lib/layout/index.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

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

it("uses an accepted pending primary receipt when public-name lookup has no binding", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("alpha", { state: "Planning", priority: "P1", currentWorkflow: "draft-design" },
    { kind: "backlog", commitment: "planned" });
  const absent = await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("missing") });
  if (absent.status !== "refused") throw new Error("The missing-name fixture unexpectedly resolves");
  const before = lifecycleSuccess(await h.store.version());
  const result = await resolveBacklogOwnership({ checkout: "/unused", identity: "test-user", path: ".arc/backlog/planned/alpha/note.txt",
    store: { read: input => h.store.read(input), lookup: () => Promise.resolve(absent), list: input => h.store.list(input) }, index: { entries: {
      ".arc/backlog/planned/alpha/meta-alpha.md": { kind: "ownerless", stat: null,
        refused: { reason: "The accepted stub's basis is not yet bound.", remedy: { text: "Retry its exact receipt read." } },
        minted: { reference: primary.reference, version: primary.version } },
    } } });
  expect(result).toMatchObject({ kind: "owned", record: { reference: primary.reference } });
  if (result.kind !== "owned") throw new Error("Expected the accepted metadata generation's container");
  expect(resolveArcPath(result.container)).toBe(".arc/backlog/planned/alpha");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("preserves an archive inventory refusal and resolves the same exact coordinates after repair", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("alpha", { state: "Shipped", priority: "P1", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const container = ArcLayoutAddressSchema.parse({ kind: "work-unit-container", slug: "alpha", placement: primary.placement });
  if (container.kind !== "work-unit-container") throw new Error("Expected completed container");
  const boundary = createRefusingStore(h.store);
  boundary.refuse("list", StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable",
    reference: primary.reference, historyRefs: [], condition: "Archive inventory is unavailable.",
    remedy: { text: "Restore archive objects, then retry." } }));
  const input = { checkout: "/unused", identity: "test-user", path: `${resolveArcPath(container)}/correction.txt`,
    store: boundary.store, index: { entries: {} } };
  expect(await resolveEstablishedContainer(input, container)).toMatchObject({ kind: "refused", mark: {
    reason: expect.stringContaining("Archive inventory is unavailable"), remedy: { text: "Restore archive objects, then retry." },
  } });
  boundary.refuse("list", null);
  expect(await resolveEstablishedContainer(input, container)).toMatchObject({ kind: "owned", record: { reference: primary.reference } });
});
