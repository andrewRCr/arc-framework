import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { resolveGitCommonDir } from "../../../../src/lib/git/exec.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { seed } from "../../../helpers/store/suite-tools.js";
import { restoreSyncProjection } from "../../../../src/lib/store/projection/sync-materialization.js";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
/** Save closes an archive opening only after its final on-disk check sees accepted bytes. */
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { readFile, chmod, writeFile, lstat, rename, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { ProjectionSaveResult } from "../../../../src/lib/store/projection/save.js";
const binding = vi.hoisted(() => ({
  store: null as Store | null,
  hooks: undefined as import("../../../../src/lib/store/projection/swap.js").SwapHooks | undefined,
  beforeModeOpen: null as ((path: unknown) => Promise<void>) | null,
  linkedPath: null as string | null,
}));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, open: async (...args: Parameters<typeof actual.open>) => {
    await binding.beforeModeOpen?.(args[0]);
    return actual.open(...args);
  } };
});
vi.mock("../../../../src/lib/store/create.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/create.js")>();
  return { ...actual, createStore: (...args: Parameters<typeof actual.createStore>) => binding.store ?? actual.createStore(...args) };
});
vi.mock("../../../../src/lib/store/projection/engine-ports.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/projection/engine-ports.js")>();
  return { ...actual, createProjectionEnginePorts: (...args: Parameters<typeof actual.createProjectionEnginePorts>) => ({
    ...actual.createProjectionEnginePorts(...args), hooks: binding.hooks,
    linkFs: { lstat: (path: string) => binding.linkedPath === path ? Promise.resolve({ isSymbolicLink: () => true }) : lstat(path) },
  }) };
});
import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
const directories: string[] = [];
afterEach(async () => {
  binding.store = null;
  binding.hooks = undefined;
  binding.beforeModeOpen = null;
  binding.linkedPath = null;
  await removeGitBackedDirs(directories.splice(0));
});
async function fixture() {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = Object.keys(h.projected.index.entries)[0]!;
  return { ...h, path, store: h.f.store, checkout: h.f.root };
}
async function save(h: { store: Store; checkout: string }, args: readonly string[] = [], json = true) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "", errors = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { errors += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(h.checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["save", ...args, ...json ? ["--json"] : []]);
    return { result: json ? JSON.parse(output) as ProjectionSaveResult : null, output, errors };
  } finally { stdout.mockRestore(); stderr.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}


it("lands an opened archive edit, re-locks it, clears its opening and reports the path", async () => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  const entry = h.projected.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing archive entry");
  const content = h.primary.content + "\nArchive correction.\n";
  await writeFile(join(h.checkout, h.path), renderStampedFile({ content, stamp: entry.base.blob }));
  const saved = await save(h);
  expect(saved.result).toMatchObject({ status: "ok", result: { relocked: [{ path: h.path, remedy: { text: expect.stringContaining(`arc edit ${h.path}`) } }] } });
  expect(saved.errors).toBe("");
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  expect(disk.index.entries[h.path]).not.toHaveProperty("opened");
});

async function diskEntry(h: Awaited<ReturnType<typeof fixture>>, path = h.path) {
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  return disk.index.entries[path];
}
async function edit(h: Awaited<ReturnType<typeof fixture>>, note = "A correction.") {
  const entry = await diskEntry(h);
  if (entry?.kind !== "record") throw new Error("Missing archive record");
  const content = success(await h.store.read({ reference: h.primary.reference })).content + `\n${note}\n`;
  await writeFile(join(h.checkout, h.path), renderStampedFile({ content, stamp: entry.base.blob }));
  return content;
}
it("re-locks an unchanged opened file and prints its edit remedy in human output without diagnostics", async () => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  const saved = await save(h, [], false);
  expect(saved.output).toContain(h.path);
  expect(saved.output).toContain(`arc edit ${h.path}`);
  expect(saved.errors).toBe("");
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
});
it.each([false, true])("re-locks a new archived file adopted by save after ordinary pickup=%s", async ordinary => {
  const h = await fixture(), path = `${h.folder}/new-note.txt`, content = "New archive correction.\n";
  await writeFile(join(h.checkout, path), content);
  await openArchivedProjectionFile(h, path);
  if (ordinary) { await startProjection(h); await endProjection(h); }
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "new-note.txt") })).content).toBe(content);
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect((await lstat(join(h.checkout, path))).mode & 0o222).toBe(0);
});
it.each([false, true])("re-locks an empty archived text companion after a late edit=%s", async lateEdit => {
  const h = await fixture(), path = `${h.folder}/empty.txt`, file = join(h.checkout, path);
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "empty.txt");
  await seed(h.f, reference, lateEdit ? "Text before the edit.\n" : "");
  await startProjection(h); await endProjection(h);
  await utimes(file, new Date(0), new Date(0));
  await openArchivedProjectionFile(h, path);
  if (lateEdit) binding.hooks = { afterSaveReadOnly: async laying => {
    if (laying !== path) return;
    await chmod(file, 0o644);
    await writeFile(file, "");
    await utimes(file, new Date(0), new Date(0));
  } };
  const saved = await save(h);
  expect(saved.errors).not.toContain("arc sync");
  expect(saved.result).toMatchObject({ status: "ok", result: { relocked: [{ path }] } });
  expect(success(await h.store.read({ reference })).content).toBe("");
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});
it("keeps a refused edit writable and opened with its remedy, then re-locks after repair", async () => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  const content = await edit(h);
  const fault = createRefusingStore(h.store);
  fault.refuse("batch", { code: "lock-held", class: "recoverable", lock: "archive", condition: "Archive writer held.",
    remedy: { text: "Release the writer and retry arc save." } });
  const saved = await save({ ...h, store: fault.store });
  expect(saved.errors).toContain("Release the writer");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(join(h.checkout, h.path))).mode & 0o200).toBe(0o200);
  fault.refuse("batch", null);
  expect(await save({ ...h, store: fault.store })).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});
it.each(["absent", "emptied"] as const)("keeps an opened stored file %s with sync as its remedy, then re-locks after sync", async damage => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  if (damage === "absent") await rm(file);
  else { await writeFile(file, ""); await utimes(file, new Date(0), new Date(0)); }
  const saved = await save(h);
  expect(saved.errors).toContain("arc sync");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  await startProjection(h); await restoreSyncProjection(h.store, h.checkout, { dryRun: false }); await endProjection(h);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});

it("retains an opening when the file disappears at the read-only lay", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  binding.beforeModeOpen = async target => {
    if (target !== file) return;
    binding.beforeModeOpen = null;
    await rm(file);
  };
  const saved = await save(h);
  expect(saved.errors).toContain("arc sync");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  await startProjection(h); await restoreSyncProjection(h.store, h.checkout, { dryRun: false }); await endProjection(h);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});

it("keeps an open archive file untouched while a parent is reported as a link", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  binding.linkedPath = join(h.checkout, h.folder);
  const saved = await save(h);
  expect(saved.errors).toContain("symbolic link");
  expect(saved.result).toMatchObject({ status: "ok" });
  expect(saved.result).not.toHaveProperty("result.relocked");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  binding.linkedPath = null;
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path: h.path }] } } });
});

it.each(["write", "rename"] as const)("takes in a %s save between an unchanged file's read-only lay and its final check", async method => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  const entry = await diskEntry(h);
  if (entry?.kind !== "record") throw new Error("Missing archive entry");
  const content = h.primary.content.replace("[internal]", "[external]");
  let edited = false;
  binding.hooks = { afterSaveReadOnly: async path => {
    if (path !== h.path || edited) return;
    edited = true;
    const bytes = renderStampedFile({ content, stamp: entry.base.blob });
    await chmod(file, 0o644);
    if (method === "write") await writeFile(file, bytes);
    else { await writeFile(`${file}.editor`, bytes); await rename(`${file}.editor`, file); }
  } };
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it("keeps an identical writable replacement open until a save makes it read-only", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  const bytes = await readFile(file);
  binding.hooks = { afterSaveReadOnly: async path => {
    if (path !== h.path) return;
    await chmod(file, 0o644);
    await writeFile(`${file}.editor`, bytes);
    await rename(`${file}.editor`, file);
  } };
  const saved = await save(h);
  expect(saved.result).toMatchObject({ status: "ok" });
  expect(saved.result).not.toHaveProperty("result.relocked");
  expect(saved.errors).toContain("retry arc save");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  binding.hooks = undefined;
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path: h.path }] } } });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});
it.each(["after lay", "before swap", "after swap"] as const)("retains an opening after a stop %s and repairs through an ordinary command then save", async point => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  const original = success(await h.store.read({ reference: h.primary.reference }));
  const content = point === "after lay" ? original.content : await edit(h);
  const stop = async (path: string): Promise<void> => { if (path === h.path) throw new Error(`Stopped ${point}`); };
  binding.hooks = point === "after lay" ? { afterSaveReadOnly: stop }
    : point === "before swap" ? { afterRecheck: stop } : { beforeSaveMarkClear: stop };
  await expect(save(h)).rejects.toThrow(`Stopped ${point}`);
  const accepted = success(await h.store.read({ reference: h.primary.reference }));
  const interrupted = await diskEntry(h);
  expect(interrupted).toHaveProperty("opened", true);
  expect(await readFile(file, "utf8")).toContain(content.trim());
  expect(accepted.content).toBe(content);
  if (point === "after lay") {
    expect(accepted.version).toBe(original.version);
    expect(interrupted).toHaveProperty("persisted", null);
  } else {
    expect(accepted.version).not.toBe(original.version);
    expect(interrupted).toMatchObject({ persisted: { takenIn: { version: accepted.version } } });
  }
  const mode = (await lstat(file)).mode;
  if (point === "before swap") expect(mode & 0o200).toBe(0o200);
  else expect(mode & 0o222).toBe(0);
  binding.hooks = undefined;
  await startProjection(h); await endProjection(h);
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect(await diskEntry(h)).not.toHaveProperty("persisted.recording", true);
  expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(accepted.version);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
  expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(accepted.version);
});
it.each([false, true])("retains a link-only rebuilt opening after deletion between guard and swap (new adoption=%s)", async adoption => {
  const h = await fixture(), path = adoption ? `${h.folder}/new-note.txt` : h.path;
  if (adoption) await writeFile(join(h.checkout, path), "Accepted new prose.\n");
  await openArchivedProjectionFile(h, path);
  if (!adoption) await edit(h);
  let removed = false;
  binding.hooks = { afterSaveGuard: async target => {
    if (target === path && !removed) { removed = true; await rm(join(h.checkout, path)); }
  } };
  const saved = await save(h);
  expect(saved.result).toMatchObject({ status: "ok" });
  expect(saved.errors).toContain("remains opened");
  expect(await diskEntry(h, path)).toHaveProperty("opened", true);
  expect((await lstat(join(h.checkout, path))).mode & 0o222).toBe(0);
  binding.hooks = undefined;
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
});

it("keeps an unparseable archive edit opened and writable until a repaired save lands", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  const entry = await diskEntry(h);
  if (entry?.kind !== "record") throw new Error("Missing metadata entry");
  await writeFile(file, renderStampedFile({ content: "This is not metadata.\n", stamp: entry.base.blob }));
  expect((await save(h)).errors).toContain("Repair");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  const content = await edit(h, "Repaired metadata.");
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});
it("retains a file an editor leaves absent at the post-lay check and takes in its returning save", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  binding.hooks = { afterSaveReadOnly: async path => { if (path === h.path) await rm(file); } };
  expect((await save(h)).errors).toContain("arc sync");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  binding.hooks = undefined;
  const content = await edit(h, "The editor's returning save.");
  await startProjection(h); await endProjection(h);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});

it("keeps a young empty save deferred and writable until the editor finishes", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  await writeFile(file, "");
  const clock = vi.spyOn(Date, "now").mockReturnValue(Math.ceil((await lstat(file)).mtimeMs) + 1);
  try {
    const saved = await save(h);
    expect(saved.errors).not.toContain("arc sync");
    expect(saved.errors).toMatch(/saving|pending/u);
    expect(await diskEntry(h)).toHaveProperty("opened", true);
    expect((await lstat(file)).mode & 0o200).toBe(0o200);
  } finally { clock.mockRestore(); }
  const content = await edit(h, "The editor finished.");
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});

it.each([false, true])("takes in saves between acceptance and replacement or retains an unsettled guard (ongoing=%s)", async ongoing => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  await edit(h, "The first save.");
  let saving = true, revision = 0;
  const store = overrideEngineStore(h.store, { batch: async input => {
    const result = await h.store.batch(input), mutation = input.writes[0];
    if (saving && result.status === "ok" && mutation?.action === "put" && mutation.reference.kind === "work-item/meta") {
      await writeFile(file, renderStampedFile({ content: `${h.primary.content}\nEditor save ${++revision}.\n`, stamp: gitBlobId(mutation.content, "sha1") }));
      if (!ongoing) saving = false;
    }
    return result;
  } });
  const saved = await save({ ...h, store });
  if (ongoing) {
    expect(saved.errors).toMatch(/unsettled|pending/u);
    expect(await diskEntry(h)).toHaveProperty("opened", true);
    expect((await lstat(file)).mode & 0o200).toBe(0o200);
    saving = false;
    expect(await save({ ...h, store })).toMatchObject({ result: { status: "ok" }, errors: "" });
  } else expect(saved.errors).toBe("");
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toContain(`Editor save ${revision}.`);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});
it("keeps a clash from a competing checkout open until its markers are resolved", async () => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  const peer = { checkout: h.f.root, store: h.f.store };
  await openArchivedProjectionFile(h.input, h.path);
  await openArchivedProjectionFile(peer, h.path);
  const local = h.primary.content.replace("[internal]", "[local]");
  const remote = h.primary.content.replace("[internal]", "[external]");
  await h.write(h.path, local);
  await h.write(h.path, remote, peer.checkout);
  expect((await projectionCommand(peer, ["status"])).result).toMatchObject({ kind: "ready" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(remote);
  const saved = await projectionCommand(h.input, ["save"]);
  expect(saved.diagnostics).toMatch(/conflict|markers/u);
  expect(await readFile(file, "utf8")).toContain("<<<<<<<");
  expect((await h.disk()).index.entries[h.path]).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  const content = remote + "\nThe chosen correction.\n";
  await h.write(h.path, content);
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect((await h.disk()).index.entries[h.path]).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it("re-locks the read-only opening left by an interrupted edit command", async () => {
  const h = await fixture();
  binding.hooks = { afterOpenIndexCommit: async () => { throw new Error("Stopped before write bit"); } };
  await expect(openArchivedProjectionFile(h, h.path)).rejects.toThrow("Stopped before write bit");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
  binding.hooks = undefined;
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});
it("lands a forced edit once its changed file is explicitly opened", async () => {
  const h = await fixture();
  await chmod(join(h.checkout, h.path), 0o644);
  const content = await edit(h, "A forced correction opened afterward.");
  await openArchivedProjectionFile(h, h.path);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});
it("drops a deleted new opening and lands the returning file only after it is opened again", async () => {
  const h = await fixture(), path = `${h.folder}/returned.txt`, file = join(h.checkout, path);
  await writeFile(file, "Initial prose.\n");
  await openArchivedProjectionFile(h, path);
  await rm(file);
  const saved = await save(h);
  expect(saved.errors).toContain(path);
  expect(saved.errors).toContain("arc edit");
  expect(await diskEntry(h, path)).toBeUndefined();
  await writeFile(file, "Returning prose.\n");
  await openArchivedProjectionFile(h, path);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "returned.txt") })).content).toBe("Returning prose.\n");
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
});

it.each(["unchanged", "late edit", "rebuilt"] as const)("resumes an accepted edit after ignore repair without hiding %s recovery", async race => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  const content = await edit(h, "Accepted without a read-back lay.");
  const ignore = join(await resolveGitCommonDir(createProjectionEnginePorts(h.checkout).exec, h.checkout), "info/exclude");
  const rules = await readFile(ignore, "utf8");
  await writeFile(ignore, rules.replace(".arc/completed/\n", ""));
  const saved = await save(h);
  expect(saved.errors).toMatch(/ignore|unwritable/u);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  const accepted = success(await h.store.read({ reference: h.primary.reference }));
  expect(await diskEntry(h)).toMatchObject({ persisted: expect.any(Object) });
  await writeFile(ignore, rules);
  let perturbed = false;
  if (race === "late edit") binding.hooks = { afterSaveRecoveryRead: async path => {
    if (path === h.path && !perturbed) { perturbed = true; await edit(h, "Late resumed-read-back correction."); }
  } };
  if (race === "rebuilt") binding.hooks = { afterSaveGuard: async path => {
    if (path === h.path && !perturbed) { perturbed = true; await rm(file); }
  } };
  const repaired = await save(h);
  if (race !== "unchanged") expect(perturbed).toBe(true);
  if (race === "rebuilt") {
    expect(repaired.errors).toContain("remains opened");
    expect(await diskEntry(h)).toHaveProperty("opened", true);
    binding.hooks = undefined;
    expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  } else expect(repaired).toMatchObject({ result: { status: "ok" }, errors: "" });
  const current = success(await h.store.read({ reference: h.primary.reference }));
  if (race === "late edit") expect(current.content).toContain("Late resumed-read-back correction.");
  else expect(current.version).toBe(accepted.version);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});
