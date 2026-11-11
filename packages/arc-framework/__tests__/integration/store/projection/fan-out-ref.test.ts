/** The dark ref backend's actual writes and remote merges notify real linked projections. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { refSyncFixture } from "../../../helpers/store/ref-sync.js";
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";

afterEach(() => { beginProjectionCommand(); });

async function fixture() {
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
  const store = withFanOut(h.a.store, createProjectionFanOutDependencies(h.cloneA));
  expect(await startProjection({ store, checkout: h.cloneA, location: own.location })).toMatchObject({ kind: "ready" });
  return { h, store, reference, own, sibling, path,
    ownFile: () => readFile(join(h.cloneA, path), "utf8"),
    siblingFile: () => readFile(join(checkout, path), "utf8") };
}

it("refreshes both native worktree files after a createRefStore write", async () => {
  const { h, store, reference, ownFile, siblingFile } = await fixture();
  const current = success(await h.a.store.read({ reference }));
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "A native ref write.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await ownFile()).toContain("A native ref write.");
  expect(await siblingFile()).toContain("A native ref write.");
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
