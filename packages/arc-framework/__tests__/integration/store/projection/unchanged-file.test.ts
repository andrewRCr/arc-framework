/** Interrupted renderings keep their existing base semantics before edit rights are applied. */
import { afterEach, expect, it } from "vitest";
import { createWriteBackFixture, refreshWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { readUnchangedProjectionFile } from "../../../../src/lib/store/projection/unchanged-file.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";

const fixtures: Awaited<ReturnType<typeof createWriteBackFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(h => h.dispose())); });

class Stop extends Error {}
async function interruptedEntry(h: Awaited<ReturnType<typeof createWriteBackFixture>>) {
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  const entry = disk.kind === "index" ? disk.index.entries[h.path] : undefined;
  if (entry?.kind !== "record") throw new Error("Missing interrupted entry");
  return entry;
}

it.each(["md", "txt"])("recognizes an unchanged interrupted %s rendering without writing the store", async extension => {
  const h = await createWriteBackFixture({ path: `.arc/user/test-user/scratch/one.${extension}` }); fixtures.push(h);
  success(await h.store.write({ action: "put", reference: h.entry.reference, expected: h.entry.base.version,
    content: "New stored content.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  const state = success(await h.store.version());
  await expect(refreshWriteBackFixture(h, h.index, { afterRecheck: async () => { throw new Stop(); } })).rejects.toBeInstanceOf(Stop);
  const entry = await interruptedEntry(h);
  expect(await readUnchangedProjectionFile(h.context, { ...h.request, entry, observedEdit: true })).not.toBeNull();
  expect(success(await h.store.version())).toBe(state);
  expect(await h.file()).toContain("opening\nbase\nclosing\n");
});

it.each(["md", "txt"])("preserves an intentional %s revert after a recorded take-in", async extension => {
  const h = await createWriteBackFixture({ path: `.arc/user/test-user/scratch/one.${extension}` }); fixtures.push(h);
  await h.edit("A landed edit.\n");
  await expect(writeBackFile({ ...h.context, hooks: { afterRecheck: async () => { throw new Stop(); } } }, h.index, h.request))
    .rejects.toBeInstanceOf(Stop);
  const entry = await interruptedEntry(h);
  await h.edit("opening\nbase\nclosing\n");
  expect(await readUnchangedProjectionFile(h.context, { ...h.request, entry, observedEdit: true })).toBeNull();
  expect(await h.file()).toContain("opening\nbase\nclosing\n");
});

it("leaves an explicit resolution and newly authored bytes to edit handling", async () => {
  const h = await createWriteBackFixture(); fixtures.push(h);
  const request = { ...h.request, entry: { ...h.entry, pending: true } };
  expect(await readUnchangedProjectionFile(h.context, { ...request, resolution: { kind: "hold", token: "selected" } })).toBeNull();
  await h.edit("A real hand edit.\n");
  expect(await readUnchangedProjectionFile(h.context, request)).toBeNull();
  expect(await h.file()).toContain("A real hand edit.");
});
