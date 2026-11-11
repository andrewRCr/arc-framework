/** Changed conflict records refresh their subject without losing a person's marker edits. */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import { createMarkerFixture } from "../../../helpers/store/projection/marker-fixture.js";
import { initializeEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { readProjectionStatus } from "../../../../src/lib/store/projection/status.js";
import { sameReference } from "../../../../src/lib/store/identity.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("refreshes a settled subject when its stored conflict is removed", async () => {
  const h = await createMarkerFixture({ path: ".arc/user/andrew/scratch/document.md" });
  directories.push(h.checkout);
  await initializeEngineCheckout(h.checkout);
  expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
  await endProjection({ store: h.store, checkout: h.checkout });
  expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("<<<<<<<");
  expect(await readProjectionIndex(h.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [h.path]: { pending: false } },
  } });
  const reference = h.conflicts[0]!.reference;
  const conflict = success(await h.store.read({ reference }));
  success(await h.store.write({ action: "remove", reference, expected: conflict.version, resolves: [reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
  expect(parseStampedFile(await h.file()).content).toBe(h.record.content);
  expect(await readProjectionIndex(h.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [h.path]: { markers: null, notices: [], unshown: [], pending: false } },
  } });
});

for (const held of ["resolution in progress", "malformed markers"] as const) {
  it(`preserves ${held}, tracks a newer conflict, and refreshes after repair`, async () => {
    const base = "opening\nbase first\nseparation one\nseparation two\nbase tail\nclosing\n";
    const h = await createMarkerFixture({ path: ".arc/user/andrew/scratch/document.md", base,
      current: base.replace("base first", "stored first"), incoming: base.replace("base first", "incoming first") });
    directories.push(h.checkout);
    await initializeEngineCheckout(h.checkout);
    const command = { store: h.store, checkout: h.checkout };
    await startProjection(command);
    await endProjection(command);
    success(await h.store.write({ action: "put", reference: h.entry.reference, expected: h.record.version,
      content: h.record.content.replace("base tail", "stored tail"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const extra = success(await h.store.write({ action: "put", reference: h.entry.reference, expected: h.record.version,
      content: h.record.content.replace("base tail", "incoming tail"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const first = h.conflicts[0]?.reference, second = extra.conflicts[0];
    if (first === undefined || second === undefined) throw new Error("Missing stored conflicts");
    await h.edit(held === "resolution in progress" ? h.content.replace("stored first", "authored choice underway")
      : h.content.replace("<<<<<<<", "<<<<<<"));
    const bytes = await h.file();
    await startProjection(command);
    await endProjection(command);
    expect(await h.file()).toBe(bytes);
    const status = await readProjectionStatus(command);
    expect(status.kind === "ready" && status.files.some(file => file.path === h.path && file.pending
      && file.unshown.some(reference => sameReference(reference, second)))).toBe(true);
    const conflict = success(await h.store.read({ reference: second }));
    success(await h.store.write({ action: "remove", reference: second, expected: conflict.version, resolves: [second],
      provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
    await startProjection(command);
    await endProjection(command);
    expect(await h.file()).toBe(bytes);
    expect(await readProjectionIndex(h.location, true)).toMatchObject({ kind: "index", index: { entries: {
      [h.path]: { pending: true, unshown: [] },
    } } });
    const current = success(await h.store.read({ reference: h.entry.reference }));
    await h.edit(current.content.replace("stored first", "resolved first"));
    await startProjection(command);
    await endProjection(command);
    expect(success(await h.store.read({ reference: h.entry.reference }))).toMatchObject({ conflicts: [],
      content: current.content.replace("stored first", "resolved first") });
    expect(parseStampedFile(await h.file()).content).toBe(current.content.replace("stored first", "resolved first"));
  });
}
