/** Observed hand edits retain a checkout-local mark across persistence outcomes. */
import { readFile, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Command } from "commander";
import type { Store } from "../../src/lib/store/contract.js";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { startProjection, endProjection } from "../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { parseStampedFile, renderStampedFile } from "../../src/lib/store/projection/stamp.js";
import { writeMetaOwner } from "../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createWriteBackFixture, refreshWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createWriteBackPort } from "../../src/lib/store/projection/write-back.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { withProjectionLock, type ProjectionLockResult } from "../../src/lib/store/projection/lock.js";
import { createProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { createEngineFixture, initializeEngineCheckout } from "../helpers/store/projection/engine-fixture.js";
import { createHistoryRefusingStore } from "../helpers/store/projection/history-refusing-store.js";
import { createHistoryMemo } from "../../src/lib/store/projection/base-recovery.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
vi.mock("../../src/lib/store/projection/engine-ports.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/projection/engine-ports.js")>();
  return { ...original, createProjectionEnginePorts: (...args: Parameters<typeof original.createProjectionEnginePorts>) =>
    ({ ...original.createProjectionEnginePorts(...args), maxWaitMs: 30 }) };
});

async function save(store: Store, checkout: string, configure?: (program: Command) => void) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = store; process.chdir(checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["save", "--json"], configure);
    return JSON.parse(output) as { status: "ok" | "refused"; refusal?: { code: string; condition: string; remedy: { text: string } } };
  } finally { binding.store = null; out.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

async function changed(location: Parameters<typeof readProjectionIndex>[0], path: string): Promise<boolean> {
  const disk = await readProjectionIndex(location, true);
  if (disk.kind !== "index" || disk.index.entries[path]?.kind !== "record") throw new Error("No marked file entry");
  return disk.index.entries[path].changed;
}

async function interruptedUnstamped(advance = true) {
  const h = await createWriteBackFixture({ kind: "work-item/companion", path: ".arc/active/current/diagram.txt" });
  onTestFinished(h.dispose);
  const original = success(await h.store.read({ reference: h.entry.reference })).content;
  const stored = advance ? `${original}A stored footer.\n` : original;
  if (advance) success(await h.store.write({ action: "put", reference: h.entry.reference, content: stored,
    expected: h.entry.base.version, provenance: { verb: "save", lifecycleAction: "edit" } }));
  await expect(refreshWriteBackFixture(h, h.index, { afterRecheck: async () => { throw new Error("Interrupted before installation"); } }))
    .rejects.toThrow("Interrupted before installation");
  const disk = await readProjectionIndex(h.location, true);
  if (disk.kind !== "index") throw new Error("The interrupted replacement lost its index");
  const entry = disk.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("The interrupted replacement lost its entry");
  expect(entry).toMatchObject({ changed: false, pending: true, inProgress: expect.any(Object) });
  return { h, entry, stored };
}

it.each(["landed", "refused", "unparseable", "pending"])("marks a genuinely observed %s edit and retains it after repair", async outcome => {
  const { f, primary, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No projected metadata");
  const before = parseStampedFile(await readFile(join(f.root, path), "utf8"));
  if (before.stamp === null) throw new Error("The projected metadata has no stamp");
  const content = outcome === "refused" ? writeMetaOwner(before.content, SlugSchema.parse("bob"))
    : outcome === "unparseable" ? "Not valid metadata.\n" : `${before.content}\nObserved hand edit.\n`;
  await writeFile(join(f.root, path), outcome === "pending" ? "" : renderStampedFile({ content, stamp: before.stamp }));
  if (outcome === "pending") {
    const future = new Date(Date.now() + 60_000);
    await utimes(join(f.root, path), future, future);
  }
  expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" });
  const stored = success(await f.store.read({ reference: primary.reference }));
  expect(stored.content).toBe(outcome === "landed" ? content : primary.content);
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("The observed edit lost its projection index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", changed: true });
  if (outcome === "pending") expect(disk.index.entries[path]).toMatchObject({ pending: true });
  if (outcome === "refused" || outcome === "unparseable") expect(disk.index.entries[path]).toMatchObject({ refused: expect.any(Object) });
  await writeFile(join(f.root, path), renderStampedFile({ content: `${before.content}\nRepaired hand edit.\n`, stamp: before.stamp }));
  await startProjection({ store: f.store, checkout: f.root });
  await endProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: primary.reference })).content).toContain("Repaired hand edit.");
  const repaired = await readProjectionIndex(projected.location, true);
  if (repaired.kind !== "index") throw new Error("The repaired edit lost its projection index");
  expect(repaired.index.entries[path]).toMatchObject({ changed: true, refused: null });
});

it("marks the holding checkout when a guard takes in its edit, leaving a sibling's mark alone", async () => {
  const h = await createWriteBackFixture(); onTestFinished(h.dispose);
  const sibling = await seedProjection({ store: h.store, files: [{ reference: h.entry.reference, path: h.path }] });
  onTestFinished(() => removeGitBackedDirs([sibling.checkout]));
  await h.edit("An edit found by a sibling's guard.\n");
  const index = await refreshWriteBackFixture(h, h.index);
  expect(success(await h.store.read({ reference: h.entry.reference })).content).toBe("An edit found by a sibling's guard.\n");
  expect(index.entries[h.path]).toMatchObject({ changed: true });
  const untouched = await readProjectionIndex(sibling.location, true);
  if (untouched.kind !== "index") throw new Error("The sibling lost its index");
  expect(untouched.index.entries[h.path]).toMatchObject({ changed: false });
});

it("marks an edit first observed by the take-in read without requiring an earlier caller observation", async () => {
  const h = await createWriteBackFixture(); onTestFinished(h.dispose);
  await h.edit("An edit first seen while taking the file in.\n");
  const result = await createWriteBackPort(h.context)(h.request);
  expect(result.answer).toBe("taken-in");
  expect(success(await h.store.read({ reference: h.entry.reference })).content).toBe("An edit first seen while taking the file in.\n");
  expect(result.entry.changed).toBe(true);
});

it("marks a changed unstamped file before a history refusal and persists its edit after history repair", async () => {
  const { h, entry, stored } = await interruptedUnstamped(false);
  const content = `${stored}A hand edit needing readable history.\n`;
  await h.edit(content);
  const unavailable = createHistoryRefusingStore(h.store, [entry.reference]);
  const request = { ...h.request, entry, base: { kind: "blob" as const, blob: entry.base.blob } };
  const refused = await createWriteBackPort({ ...h.context, store: unavailable.store, memo: createHistoryMemo(unavailable.store) })(request);
  expect(refused).toMatchObject({ answer: "pending", entry: { pending: true, changed: true } });
  expect(success(await h.store.read({ reference: entry.reference })).content).toBe(stored);
  expect(await h.file()).toBe(content);
  const repaired = await createWriteBackPort({ ...h.context, memo: createHistoryMemo(h.store) })({ ...request, entry: refused.entry });
  expect(repaired).toMatchObject({ answer: "taken-in", entry: { changed: true } });
  expect(success(await h.store.read({ reference: entry.reference })).content).toBe(content);
});

it.each([false, true])("preserves the existing mark=%s on old unstamped bytes left by an interrupted replacement", async prior => {
  const { h, entry, stored } = await interruptedUnstamped();
  const original = await h.file(), unavailable = createHistoryRefusingStore(h.store, [entry.reference]);
  const result = await createWriteBackPort({ ...h.context, store: unavailable.store, memo: createHistoryMemo(unavailable.store) })({
    ...h.request, entry: { ...entry, changed: prior }, base: { kind: "blob", blob: entry.base.blob },
  });
  expect(result).toMatchObject({ answer: "no-edit", entry: { changed: prior } });
  expect(await h.file()).toBe(original);
  expect(success(await h.store.read({ reference: entry.reference })).content).toBe(stored);
});

it("clears the mark through registered save after the file's edit lands", async () => {
  const { f, primary, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No projected metadata");
  await writeFile(join(f.root, path), `${await readFile(join(f.root, path), "utf8")}\nSave this correction.\n`);
  expect(await save(f.store, f.root)).toMatchObject({ status: "ok" });
  expect(success(await f.store.read({ reference: primary.reference })).content).toContain("Save this correction.");
  expect(await changed(projected.location, path)).toBe(false);
});

it("keeps marks when save's clearing lock is held and clears them on the same command's retry", async () => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No projected metadata");
  await writeFile(join(f.root, path), `${await readFile(join(f.root, path), "utf8")}\nA correction before the lock.\n`);
  let release = (): void => {}, holding: Promise<ProjectionLockResult<void>> | undefined;
  try {
    const refused = await save(f.store, f.root, program => { program.hook("preAction", async () => {
      let acquired = (): void => {};
      const entered = new Promise<void>(resolve => { acquired = resolve; });
      holding = withProjectionLock(projected.location, async () => {
        acquired(); await new Promise<void>(resolve => { release = resolve; });
      });
      await entered;
    }); });
    expect(refused).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("held"), remedy: { text: expect.stringContaining("Retry") } } });
    expect(await changed(projected.location, path)).toBe(true);
  } finally { release(); await holding; }
  expect(await save(f.store, f.root)).toMatchObject({ status: "ok" });
  expect(await changed(projected.location, path)).toBe(false);
}, 30_000);

it("keeps a refused edit marked at save and clears it after the same file is repaired", async () => {
  const { f, primary, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No projected metadata");
  const before = parseStampedFile(await readFile(join(f.root, path), "utf8"));
  if (before.stamp === null) throw new Error("The metadata fixture lost its stamp");
  await writeFile(join(f.root, path), renderStampedFile({ content: writeMetaOwner(before.content, SlugSchema.parse("bob")), stamp: before.stamp }));
  expect(await save(f.store, f.root)).toMatchObject({ status: "ok" });
  expect(success(await f.store.read({ reference: primary.reference })).content).toBe(primary.content);
  expect(await changed(projected.location, path)).toBe(true);
  await writeFile(join(f.root, path), renderStampedFile({ content: `${before.content}\nThe repaired correction.\n`, stamp: before.stamp }));
  expect(await save(f.store, f.root)).toMatchObject({ status: "ok" });
  expect(success(await f.store.read({ reference: primary.reference })).content).toContain("The repaired correction.");
  expect(await changed(projected.location, path)).toBe(false);
});

it.each([false, true])("uses retained copy content when its writer has another scope, late edit=%s", async late => {
  const { f, primary, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No projected metadata");
  await writeFile(join(f.root, path), `${await readFile(join(f.root, path), "utf8")}\nThe first correction.\n`);
  const ports = createProjectionEnginePorts(f.root);
  await startProjection({ store: f.store, checkout: f.root, ports: () => ({ ...ports,
    writer: async () => ({ ...await ports.writer(), processScope: "another-process-namespace" }),
  }) });
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("No retained-copy index");
  const entry = disk.index.entries[path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No produced aside copy");
  const copy = entry.copies[0], original = await readFile(join(f.root, copy.name), "utf8");
  const bytes = late ? `${original}\nA retained late correction.\n` : original;
  if (late) await writeFile(join(f.root, copy.name), bytes);
  expect(await save(f.store, f.root)).toMatchObject({ status: "ok" });
  expect(await changed(projected.location, path)).toBe(late);
  expect(await readFile(join(f.root, copy.name), "utf8")).toBe(bytes);
  expect(success(await f.store.read({ reference: primary.reference })).content).not.toContain("A retained late correction.");
  if (late) {
    const current = parseStampedFile(await readFile(join(f.root, path), "utf8"));
    if (current.stamp === null) throw new Error("The repaired metadata lost its stamp");
    await writeFile(join(f.root, path), renderStampedFile({ content: `${current.content}\nA retained late correction.\n`, stamp: current.stamp }));
    await unlink(join(f.root, copy.name));
    expect(await save(f.store, f.root)).toMatchObject({ status: "ok" });
    expect(success(await f.store.read({ reference: primary.reference })).content).toContain("A retained late correction.");
    expect(await changed(projected.location, path)).toBe(false);
  }
});

it("marks a late aside edit discovered by command-end settlement after save cleared the mark", async () => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No projected metadata");
  await writeFile(join(f.root, path), `${await readFile(join(f.root, path), "utf8")}\nThe first correction.\n`);
  let copy = "", late = "", newer = "";
  expect(await save(f.store, f.root, program => { program.hook("postAction", async () => {
    expect(await changed(projected.location, path)).toBe(false);
    const disk = await readProjectionIndex(projected.location, true);
    if (disk.kind !== "index") throw new Error("No saved index");
    const entry = disk.index.entries[path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No command-owned aside copy");
    copy = entry.copies[0].name;
    late = `${await readFile(join(f.root, copy), "utf8")}\nA late save retained aside.\n`;
    newer = `${await readFile(join(f.root, path), "utf8")}\nA newer destination edit.\n`;
    await writeFile(join(f.root, copy), late);
    await writeFile(join(f.root, path), newer);
  }); })).toMatchObject({ status: "ok" });
  expect(await changed(projected.location, path)).toBe(true);
  expect(await readFile(join(f.root, copy), "utf8")).toBe(late);
  expect(await readFile(join(f.root, path), "utf8")).toBe(newer);
});

it("clears accepted content even when the installed rendering still shows a stored conflict", async () => {
  const directories: string[] = [], h = await createEngineFixture(directories);
  onTestFinished(() => removeGitBackedDirs(directories));
  const write = (content: string) => h.store.write({ action: "put", reference: h.record.reference,
    content, expected: h.record.version, provenance: { verb: "save", lifecycleAction: "edit" } });
  success(await write("opening\nstore side\nclosing\n"));
  success(await write("opening\nincoming side\nclosing\n"));
  expect((await h.stored()).conflicts.length).toBeGreaterThan(0);
  await h.edit("opening\nbase\nclosing\nAn independent note.\n");
  expect(await save(h.store, h.checkout)).toMatchObject({ status: "ok" });
  expect((await h.stored()).content).toContain("An independent note.");
  const entry = (await h.disk()).entries[h.path];
  expect(entry).toMatchObject({ changed: false, pending: false });
  if (entry?.kind !== "record") throw new Error("The conflicted record lost its entry");
  expect(entry.markers).not.toBeNull();
});

it("does not mark a refresh that only installs another writer's content", async () => {
  const h = await createWriteBackFixture(); onTestFinished(h.dispose);
  success(await h.store.write({ action: "put", reference: h.entry.reference, content: "Another writer's content.\n",
    expected: h.entry.base.version, provenance: { verb: "save", lifecycleAction: "edit" } }));
  const index = await refreshWriteBackFixture(h, h.index);
  expect(await h.file()).toContain("Another writer's content.");
  expect(index.entries[h.path]).toMatchObject({ changed: false });
});

it("does not manufacture a changed mark when retrying an unchanged file left pending by an interrupted swap", async () => {
  const h = await createWriteBackFixture({ path: ".arc/user/andrew/scratch/document.md", identity: "andrew" });
  onTestFinished(h.dispose);
  await initializeEngineCheckout(h.checkout);
  const original = await h.file();
  await expect(refreshWriteBackFixture(h, h.index, { afterRecheck: async () => { throw new Error("Interrupted before installation"); } }))
    .rejects.toThrow("Interrupted before installation");
  const pending = await readProjectionIndex(h.location, true);
  if (pending.kind !== "index") throw new Error("The interrupted swap lost its first index");
  expect(pending.index.entries[h.path]).toMatchObject({ pending: true, changed: false });
  expect(await h.file()).toBe(original);
  expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
  await endProjection({ store: h.store, checkout: h.checkout });
  expect(await changed(h.location, h.path)).toBe(false);
  expect(success(await h.store.read({ reference: h.entry.reference })).content).toBe(parseStampedFile(original).content);
});
