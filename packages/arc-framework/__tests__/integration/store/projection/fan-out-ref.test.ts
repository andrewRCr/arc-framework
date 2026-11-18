/** The dark ref backend's actual writes and remote merges notify real linked projections. */
import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { refSyncFixture } from "../../../helpers/store/ref-sync.js";
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { RecordReferenceSchema, type StateVersion } from "../../../../src/lib/store/identity.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { canonicalLocalPath } from "../../../../src/lib/local-path-identity.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { createStore } from "../../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-ports.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";

afterEach(() => { beginProjectionCommand(); });

async function fixture(aliasWriter = false, wrap: (store: Store) => Store = store => store) {
  beginProjectionCommand();
  const h = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "scratch/native.md" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Opening.\nBase.\nClosing.\n",
    provenance: { verb: "save", lifecycleAction: "save" } }));
  const path = ".arc/user/andrew/scratch/native.md";
  await configureEngineCheckout(h.cloneA);
  const own = await seedProjection({ store: h.a.store, checkout: h.cloneA, files: [{ path, reference }] });
  const checkout = join(h.cloneA, "linked");
  await h.a.exec("git", ["worktree", "add", "--detach", checkout]);
  await configureEngineCheckout(checkout);
  const sibling = await seedProjection({ store: h.a.store, checkout, files: [{ path, reference }] });
  const siblingInput = { store: h.a.store, checkout, location: sibling.location, ports: () => createProjectionEnginePorts(checkout) };
  expect(await startProjection(siblingInput)).toMatchObject({ kind: "ready" });
  await endProjection(siblingInput);
  const writer = aliasWriter ? join(h.cloneA, "..", "writer-alias") : h.cloneA;
  if (aliasWriter) await symlink(h.cloneA, writer, "junction");
  const visits: string[] = [];
  const ports = { ...createProjectionEnginePorts(writer), beforeFanOutTarget: async (root: string) => {
    visits.push(await canonicalLocalPath(root));
  } };
  const store = withFanOut(wrap(h.a.store), createProjectionFanOutDependencies(writer));
  const location = await locateProjection(writer, ports);
  expect(await startProjection({ store, checkout: writer, location, ports: () => ports })).toMatchObject({ kind: "ready" });
  return { h, store, reference, own, sibling, path, visits, checkout,
    ownFile: () => readFile(join(h.cloneA, path), "utf8"),
    siblingFile: () => readFile(join(checkout, path), "utf8") };
}

it("visits each native checkout once when the writer uses a filesystem alias", async () => {
  const f = await fixture(true), current = success(await f.h.a.store.read({ reference: f.reference }));
  f.visits.splice(0);
  success(await f.store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "Written through a checkout alias.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await f.ownFile()).toContain("Written through a checkout alias.");
  expect(await f.siblingFile()).toContain("Written through a checkout alias.");
  expect(f.visits).toEqual(await Promise.all([f.h.cloneA, f.checkout].map(root => canonicalLocalPath(root))));
  expect(await readProjectionIndex(f.own.location, true, { groups: "all" }))
    .toMatchObject({ kind: "index", index: { entries: { [f.path]: { changed: true } } } });
}, 30_000);

it("refreshes both native worktree files after a createRefStore write", async () => {
  const { h, store, reference, ownFile, siblingFile } = await fixture();
  const current = success(await h.a.store.read({ reference }));
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "A native ref write.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await ownFile()).toContain("A native ref write.");
  expect(await siblingFile()).toContain("A native ref write.");
}, 30_000);

it("refreshes the sibling after a write through the default store a command opens", async () => {
  const { h, reference, siblingFile } = await fixture();
  const store = createStore(createDefaultStorePorts({ checkoutRoot: h.cloneA, exec: h.a.exec, identity: SlugSchema.parse("andrew") }));
  expect(store.capabilities.stateOffBranch).toBe(true);
  const current = success(await store.read({ reference }));
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "Written through the default store.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await siblingFile()).toContain("Written through the default store.");
}, 30_000);

it("refreshes remote pull merges in both native worktrees without setting verb changed marks", async () => {
  const { h, store, reference, own, sibling, path, ownFile, siblingFile } = await fixture();
  success(await store.push());
  success(await h.b.store.pull());
  const current = success(await h.b.store.read({ reference }));
  success(await h.b.store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "A remote save.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  success(await h.b.store.push());
  success(await store.pull());
  expect(await ownFile()).toContain("A remote save.");
  expect(await siblingFile()).toContain("A remote save.");
  for (const projection of [own, sibling]) expect(await readProjectionIndex(projection.location, true, { groups: "all" }))
    .toMatchObject({ kind: "index", index: { entries: { [path]: { changed: false } } } });
}, 30_000);

it("leaves a sibling another process advances after the round reads its version at that newer state", async () => {
  let advance: (() => Promise<void>) | undefined;
  const f = await fixture(false, base => overrideEngineStore(base, { version: async () => {
    const read = await base.version();
    const step = advance; advance = undefined;
    await step?.();
    return read;
  } }));
  const other = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "scratch/other.md" });
  let newer: StateVersion | undefined;
  advance = async () => {
    // Another writer lands a newer state, and the sibling's own command records it, after the round's version read.
    success(await f.h.a.store.write({ action: "put", reference: other, expected: null, content: "A newer state.\n",
      provenance: { verb: "save", lifecycleAction: "save" } }));
    newer = success(await f.h.a.store.version());
    await withProjectionLock(f.sibling.location, async session => {
      const disk = await readProjectionIndex(f.sibling.location, true, { groups: "all" });
      if (disk.kind !== "index") throw new Error("Missing sibling index");
      await commitProjectionIndex({ location: f.sibling.location, checkout: f.checkout, index: { ...disk.index, state: newer ?? null },
        checkpoint: session.step });
    });
  };
  const current = success(await f.h.a.store.read({ reference: f.reference }));
  success(await f.store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "The round's write.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(newer).toBeDefined();
  expect(await readProjectionIndex(f.sibling.location, true)).toMatchObject({ kind: "index", index: { state: newer } });
}, 30_000);
