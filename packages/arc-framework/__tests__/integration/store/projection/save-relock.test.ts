import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { resolveGitCommonDir } from "../../../../src/lib/git/exec.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { seed, update } from "../../../helpers/store/suite-tools.js";
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
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { relockOpenedProjectionFiles } from "../../../../src/lib/store/projection/save-relock.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
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
it.each([
  ["after lay", false], ["before read-back", false], ["before journal", false], ["before swap", false], ["after swap", false],
  ["before read-back", true], ["before journal", true],
] as const)("recovers an archive opening after a stop %s (retry directly with save=%s)", async (point, directSave) => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  const original = success(await h.store.read({ reference: h.primary.reference }));
  const content = point === "after lay" ? original.content : await edit(h);
  const stop = async (path: string): Promise<void> => { if (path === h.path) throw new Error(`Stopped ${point}`); };
  let submissions = 0, interruptReadBack = point === "before read-back";
  const store = overrideEngineStore(h.store, {
    batch: async input => { submissions += 1; return h.store.batch(input); },
    read: async input => {
      if (interruptReadBack && submissions > 0) await stop(h.path);
      return h.store.read(input);
    },
  });
  const command = { ...h, store };
  if (point === "after lay") binding.hooks = { afterSaveReadOnly: stop };
  if (point === "before journal") binding.hooks = { afterSaveGuard: stop };
  if (point === "before swap") binding.hooks = { afterRecheck: stop };
  if (point === "after swap") binding.hooks = { beforeSaveMarkClear: stop };
  await expect(save(command)).rejects.toThrow(`Stopped ${point}`);
  interruptReadBack = false;
  const submitted = submissions;
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
  if (point.startsWith("before ")) expect(mode & 0o200).toBe(0o200);
  else expect(mode & 0o222).toBe(0);
  binding.hooks = undefined;
  if (!directSave) {
    await startProjection(command); await endProjection(command);
    expect(await diskEntry(h)).toHaveProperty("opened", true);
    expect(await diskEntry(h)).not.toHaveProperty("persisted.recording", true);
    expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(accepted.version);
  }
  expect(await save(command)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
  expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(accepted.version);
  expect(submissions).toBe(submitted);
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
  expect((await lstat(join(h.checkout, path))).mode & 0o222, saved.errors).toBe(0);
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

it("retains an opening and retry remedy for a deferred take-in before finishing save", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  await startProjection(h);
  const state = projectionProcessState(), root = state.command && state.roots.get(state.command.checkout);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (!root || disk.kind !== "index") throw new Error("No opened archive projection");
  const entry = disk.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing opened archive record");
  const bytes = await readFile(file);
  await writeFile(file, "");
  const observation = { path: h.path, result: { answer: "deferred", entry }, installation: "attempted" } as const;
  const held = await withProjectionLock(root.location, async session => {
    root.checkpoint = session.step;
    try {
      const saveRoot = { ...root, context: { ...root.context, verb: "save" as const } };
      return await relockOpenedProjectionFiles(saveRoot, disk.index, new Map([[h.path, observation]]),
        async index => ({ index, observation }));
    } finally { root.checkpoint = null; }
  });
  expect(held).toMatchObject({ status: "done" });
  expect(state.diagnostics).toContainEqual(expect.objectContaining({ path: h.path,
    mark: expect.objectContaining({ remedy: { text: expect.stringContaining("let saving finish, and retry arc save") } }) }));
  expect(await diskEntry(h)).toMatchObject({ opened: true });
  expect((await lstat(file)).mode & 0o200).toBe(0o200);

  await writeFile(file, bytes);
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path: h.path }] } } });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
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

async function openedTextCompanion(h: Awaited<ReturnType<typeof fixture>>) {
  const path = `${h.folder}/correction.txt`, file = join(h.checkout, path);
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "correction.txt");
  await seed(h.f, reference, "Text before the edit.\n");
  await startProjection(h); await endProjection(h);
  await openArchivedProjectionFile(h, path);
  const content = "The accepted correction.\n";
  await writeFile(file, content);
  return { path, file, reference, content };
}

it.each([false, true])("recovers recorded archive text without a second submit (direct=%s)", async direct => {
  const h = await fixture(), { path, file, reference, content } = await openedTextCompanion(h);
  let submissions = 0, interrupt = true;
  const store = overrideEngineStore(h.store, {
    batch: async input => { submissions += 1; return h.store.batch(input); },
    read: async input => {
      if (interrupt && submissions > 0) throw new Error("Stop after acceptance, before read-back");
      return h.store.read(input);
    },
  });
  const command = { ...h, store };
  await expect(save(command)).rejects.toThrow("Stop after acceptance, before read-back");
  interrupt = false;
  expect(await diskEntry(h, path)).toMatchObject({ opened: true, persisted: { recording: true } });
  const accepted = success(await h.store.read({ reference }));
  expect(accepted.content).toBe(content);
  const before = submissions;
  if (!direct) { await startProjection(command); await endProjection(command); }
  expect(await save(command)).toMatchObject({ result: { status: "ok" } });
  expect(submissions).toBe(before);
  expect(success(await h.store.read({ reference })).version).toBe(accepted.version);
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it.each(["markdown", "text", "already-stored", "unaccepted", "blocked-history"] as const)("recovers a staged archive submission at the first post-batch checkpoint (%s)", async kind => {
  const h = await fixture();
  const text = kind === "text" || kind === "already-stored";
  const path = text ? `${h.folder}/correction.txt` : h.path;
  if (!text) await openArchivedProjectionFile(h, path);
  const { reference, content } = text ? await openedTextCompanion(h) : {
    reference: h.primary.reference,
    content: await edit(h, "Accepted before the post-batch checkpoint."),
  };
  if (kind === "already-stored") {
    const prior = success(await h.store.read({ reference }));
    success(await h.store.write(update(h.f, prior, content)));
  }
  const before = success(await h.store.read({ reference }));
  let archiveSaveId: string | undefined;
  let submissions = 0;
  let holdHistory = kind === "blocked-history";
  const store = overrideEngineStore(h.store, {
    history: input => holdHistory && input.archiveSaveId !== undefined
      ? Promise.resolve({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable",
        reference, historyRefs: [], condition: "The acceptance history is temporarily unavailable.",
        remedy: { text: "Restore the history, then retry arc save." } } }) : h.store.history(input),
    batch: async input => {
      submissions += 1;
      if (submissions === 1) {
        archiveSaveId = input.provenance.archiveSaveId;
        if (kind === "unaccepted") throw new Error("Stopped before the store accepted the save");
        const result = await h.store.batch(input);
        const root = [...projectionProcessState().roots.values()].find(candidate => candidate.checkout === h.checkout);
        if (root === undefined) throw new Error("Missing projection root");
        root.checkpoint = async () => { throw new Error("Stopped at the first checkpoint after acceptance"); };
        return result;
      }
      return h.store.batch(input);
    },
  });
  const command = { ...h, store };
  await expect(save(command)).rejects.toThrow(kind === "unaccepted" ? "Stopped before the store accepted the save"
    : "Stopped at the first checkpoint after acceptance");
  if (archiveSaveId === undefined) throw new Error("Missing archive save id");
  expect(await diskEntry(h, path)).toMatchObject({ opened: true, archiveSubmission: { id: archiveSaveId } });
  const accepted = success(await h.store.read({ reference }));
  const receipts = success(await h.store.history({ reference, archiveSaveId }));
  if (kind === "unaccepted") {
    expect(receipts).toEqual([]);
    expect(accepted.version).toBe(before.version);
  } else {
    expect(receipts).toMatchObject([{ version: accepted.version }]);
    expect(accepted.content).toBe(content);
  }
  if (kind === "already-stored") expect(accepted.version).toBe(before.version);
  if (text) expect(success(await h.store.history({ reference: h.primary.reference, archiveSaveId }))).toEqual([]);
  if (holdHistory) {
    const held = await save(command);
    expect(held.errors).toContain("Restore the history");
    expect(submissions).toBe(1);
    expect(await diskEntry(h, path)).toMatchObject({ opened: true, archiveSubmission: { id: archiveSaveId } });
    expect((await lstat(join(h.checkout, path))).mode & 0o200).toBe(0o200);
    holdHistory = false;
  }
  expect(await save(command)).toMatchObject({ result: { status: "ok" } });
  expect(submissions).toBe(kind === "unaccepted" ? 2 : 1);
  const landed = success(await h.store.read({ reference }));
  expect(landed.content).toBe(content);
  if (kind !== "unaccepted") expect(landed.version).toBe(accepted.version);
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect(await diskEntry(h, path)).not.toHaveProperty("archiveSubmission");
  expect((await lstat(join(h.checkout, path))).mode & 0o222).toBe(0);
});

async function openedNewText(h: Awaited<ReturnType<typeof fixture>>) {
  const path = `${h.folder}/new.txt`, file = join(h.checkout, path), content = "The new archived text.\n";
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "new.txt");
  await writeFile(file, content);
  await openArchivedProjectionFile(h, path);
  return { path, file, reference, content };
}

it.each([[false, false], [true, false], [true, true]])(
  "distinguishes accepted text from a revert after newer text is installed (installed=%s, adoption=%s)", async (installed, adoption) => {
  const h = await fixture(), { path, file, reference, content } = await (adoption ? openedNewText(h) : openedTextCompanion(h));
  const later = "A newer correction from another command.\n";
  let submissions = 0;
  const store = overrideEngineStore(h.store, {
    batch: async input => {
      const result = await h.store.batch(input);
      submissions += 1;
      if (submissions === 1) {
        const accepted = success(await h.store.read({ reference }));
        expect(accepted.content).toBe(content);
        success(await h.store.write(update(h.f, accepted, later)));
      }
      return result;
    },
  });
  const command = { ...h, store };
  const stop = async (observed: string) => { if (observed === path) throw new Error("Stopped during read-back installation"); };
  binding.hooks = installed ? { afterFirstCheck: stop } : { afterRecheck: stop };
  await expect(save(command)).rejects.toThrow("Stopped during read-back installation");
  expect(await readFile(file, "utf8")).toBe(installed ? later : content);
  if (installed) {
    await chmod(file, 0o644);
    await writeFile(file, content);
  }
  binding.hooks = undefined;
  const result = await save(command);
  if (installed) {
    expect(await readFile(file, "utf8"), result.errors).toContain(content.trim());
    expect(result.errors).toContain(adoption ? "ambiguous-base" : "possible bases give different merges");
    expect(await diskEntry(h, path)).toHaveProperty("opened", true);
    expect((await lstat(file)).mode & 0o200).toBe(0o200);
  } else {
    expect(await readFile(file, "utf8")).toBe(later);
    expect(await diskEntry(h, path)).not.toHaveProperty("opened");
    expect(submissions).toBe(1);
  }
});

it.each([[false, false], [true, false], [true, true]])(
  "recovers accepted archive adoption without resubmission (peer edit=%s, ordinary command=%s)", async (peerEdit, ordinary) => {
  const h = await fixture(), { path, file, reference, content } = await openedNewText(h);
  const later = "A newer correction to the new text.\n";
  let submissions = 0;
  const store = overrideEngineStore(h.store, {
    batch: async input => {
      const result = await h.store.batch(input);
      submissions += 1;
      if (submissions === 1) {
        const accepted = success(await h.store.read({ reference }));
        expect(accepted.content).toBe(content);
        if (peerEdit) success(await h.store.write(update(h.f, accepted, later)));
        const root = [...projectionProcessState().roots.values()].find(candidate => candidate.checkout === h.checkout);
        if (root === undefined) throw new Error("Missing projection root");
        root.checkpoint = async () => { throw new Error("Stopped at the first checkpoint after adoption"); };
      }
      return result;
    },
  });
  const command = { ...h, store };
  await expect(ordinary ? startProjection(command) : save(command)).rejects.toThrow("Stopped at the first checkpoint after adoption");
  expect(await diskEntry(h, path)).toMatchObject({ opened: true, archiveSubmission: expect.any(Object) });
  if (ordinary) { await startProjection(command); await endProjection(command); }
  expect(await save(command)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference })).content).toBe(peerEdit ? later : content);
  expect(await readFile(file, "utf8")).toBe(peerEdit ? later : content);
  expect(submissions).toBe(1);
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});
