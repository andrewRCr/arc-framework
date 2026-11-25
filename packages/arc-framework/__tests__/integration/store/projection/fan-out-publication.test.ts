/** Sequential fan-out folds final metadata into its durable swap settlement. */
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";

const writes = vi.hoisted(() => ({ enabled: false, destinations: [] as string[] }));
vi.mock("node:fs/promises", async importOriginal => {
  const native = await importOriginal<typeof import("node:fs/promises")>();
  return { ...native, rename: async (...args: Parameters<typeof native.rename>) => {
    await native.rename(...args);
    if (writes.enabled) writes.destinations.push(String(args[1]));
  } };
});
const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); writes.enabled = false; writes.destinations = []; });
afterEach(async () => { writes.enabled = false; beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it("publishes swap intent once and combines settlement, source state, and writer marks", async () => {
  const h = await createFanOutFixture(directories), current = await h.h.stored();
  writes.enabled = true;
  try {
    success(await h.store.write({ action: "put", reference: current.reference, expected: current.version,
      content: "A newly fanned-out record.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  } finally { writes.enabled = false; }
  expect(await h.h.file()).toContain("A newly fanned-out record.");
  expect(await h.file()).toContain("A newly fanned-out record.");
  const state = success(await h.store.version());
  expect(await h.h.disk()).toMatchObject({ state, entries: { [h.h.path]: { pending: false, changed: true } } });
  expect(await h.disk()).toMatchObject({ state, entries: { [h.siblingPath]: { pending: false, changed: false } } });
  for (const location of [h.h.location, h.sibling.location]) {
    expect(writes.destinations.filter(path => path === join(location.stateDir, "index"))).toHaveLength(2);
  }
});
