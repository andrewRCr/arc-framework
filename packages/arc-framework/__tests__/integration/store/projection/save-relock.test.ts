/** Save closes an archive opening only after its final on-disk check sees accepted bytes. */
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { resolveGitCommonDir } from "../../../../src/lib/git/exec.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { seed, update } from "../../../helpers/store/suite-tools.js";
import { restoreSyncProjection } from "../../../../src/lib/store/projection/sync-materialization.js";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { projectionEditResult } from "../../../../src/lib/store/projection/edit.js";
import { readFile, chmod, writeFile, lstat, mkdir, realpath, rename, rm, symlink, utimes } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { ProjectionSaveResult } from "../../../../src/lib/store/projection/save.js";
const binding = vi.hoisted(() => ({
  store: null as Store | null,
  hooks: undefined as import("../../../../src/lib/store/projection/swap.js").SwapHooks | undefined,
  beforeModeOpen: null as ((path: unknown) => Promise<void>) | null,
  afterModeOpen: null as ((path: unknown) => void) | null,
  deniedValidation: null as string | null,
  /** A path whose next stat alone is refused, as when its folder's permission changes after the command observed it. */
  deniedOnce: null as string | null,
  deniedLinkProbe: null as string | null,
  deniedRecoverySource: null as string | null,
  deniedWalkFolder: null as string | null,
  writerInstance: undefined as string | undefined,
  stopAfterIndexCommit: false,
  /** Runs once a write is prepared, before its archive save journal is read. */
  afterPrepared: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("../../../../src/lib/store/projection/index-file.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/projection/index-file.js")>();
  return { ...actual, commitProjectionIndex: async (...args: Parameters<typeof actual.commitProjectionIndex>) => {
    const index = await actual.commitProjectionIndex(...args);
    if (binding.stopAfterIndexCommit) {
      binding.stopAfterIndexCommit = false;
      throw new Error("Stopped after recording the installation attempt");
    }
    return index;
  } };
});
vi.mock("../../../../src/lib/store/projection/submission.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/projection/submission.js")>();
  return { ...actual, prepareIndexedProjectionSubmission: async (...args: Parameters<typeof actual.prepareIndexedProjectionSubmission>) => {
    const prepared = await actual.prepareIndexedProjectionSubmission(...args);
    await binding.afterPrepared?.();
    return prepared;
  } };
});
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, readdirSync: ((...args: Parameters<typeof actual.readdirSync>) => {
    if (args[0] === binding.deniedWalkFolder) throw Object.assign(new Error("Archive enumeration refused"), { code: "EACCES" });
    return actual.readdirSync(...args);
  }) as typeof actual.readdirSync, lstatSync: ((...args: Parameters<typeof actual.lstatSync>) => {
    if (args[0] !== null && args[0] === binding.deniedOnce) binding.deniedOnce = null;
    else if (args[0] !== binding.deniedValidation || binding.deniedValidation === null) return actual.lstatSync(...args);
    throw Object.assign(new Error("Directory access changed"), { code: "EACCES" });
  }) as typeof actual.lstatSync };
});
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, link: async (...args: Parameters<typeof actual.link>) => {
    if (args[0] === binding.deniedRecoverySource) throw Object.assign(new Error("Archive recovery link refused"), { code: "EACCES" });
    return actual.link(...args);
  }, open: async (...args: Parameters<typeof actual.open>) => {
    await binding.beforeModeOpen?.(args[0]);
    const handle = await actual.open(...args);
    binding.afterModeOpen?.(args[0]);
    return handle;
  }, lstat: (async (...args: Parameters<typeof actual.lstat>) => {
    if (binding.deniedLinkProbe !== null && args[0] === binding.deniedLinkProbe) {
      binding.deniedLinkProbe = null;
      throw Object.assign(new Error("Directory access changed"), { code: "EACCES" });
    }
    if (args[0] !== null && args[0] === binding.deniedOnce) binding.deniedOnce = null;
    else if (args[0] !== binding.deniedValidation || binding.deniedValidation === null) return actual.lstat(...args);
    throw Object.assign(new Error("Directory access changed"), { code: "EACCES" });
  }) as typeof actual.lstat };
});
vi.mock("../../../../src/lib/store/create.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/create.js")>();
  return { ...actual, createStore: (...args: Parameters<typeof actual.createStore>) => binding.store ?? actual.createStore(...args) };
});
vi.mock("../../../../src/lib/store/projection/engine-ports.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/projection/engine-ports.js")>();
  return { ...actual, createProjectionEnginePorts: (...args: Parameters<typeof actual.createProjectionEnginePorts>) => {
    const ports = actual.createProjectionEnginePorts(...args), instance = binding.writerInstance;
    return { ...ports, hooks: binding.hooks,
      writer: instance === undefined ? ports.writer : async () => ({ ...await ports.writer(), processInstance: instance }) };
  } };
});
import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences, sameReference } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { PROJECTION_INDEX_FILE, readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import { TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { relockOpenedProjectionFiles } from "../../../../src/lib/store/projection/save-relock.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";
const directories: string[] = [];
afterEach(async () => {
  binding.store = null;
  binding.hooks = undefined;
  binding.beforeModeOpen = null;
  binding.afterModeOpen = null;
  binding.deniedValidation = null;
  binding.deniedOnce = null;
  binding.deniedLinkProbe = null;
  binding.deniedRecoverySource = null;
  binding.deniedWalkFolder = null;
  binding.writerInstance = undefined;
  binding.stopAfterIndexCommit = false;
  binding.afterPrepared = undefined;
  await removeGitBackedDirs(directories.splice(0));
});
async function fixture() {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = Object.keys(h.projected.index.entries)[0]!;
  return { ...h, path, store: h.f.store, checkout: h.f.root };
}
async function save(h: { store: Store; checkout: string; cwd?: string }, args: readonly string[] = [], json = true) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "", errors = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { errors += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(h.cwd ?? h.checkout); process.exitCode = undefined;
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

/** The reports at a path, each one line followed by its indented remedy, which a refused path makes once per command. */
function pathLines(errors: string, path: string): string[] {
  return errors.split("\n").filter(line => line.startsWith(`projection: ${path}: `));
}

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
it("names the checkout in the re-lock's arc edit remedy for a save run from a subfolder, which reopens from there", async () => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  const checkout = await realpath(h.checkout);
  const saved = await save({ ...h, cwd: join(h.checkout, ".arc") });
  expect(saved.result).toMatchObject({ status: "ok", result: { relocked: [{ path: h.path,
    remedy: { text: `Run arc edit ${h.path} from ${checkout} to keep editing.` } }] } });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  const cwd = process.cwd();
  try {
    process.chdir(checkout);
    await startProjection(h);
    expect(await projectionEditResult(h.store, checkout, h.path)).toMatchObject({ status: "ok" });
    await endProjection(h);
  } finally { process.chdir(cwd); }
  expect(await diskEntry(h)).toHaveProperty("opened", true);
});

it("re-locks an opened text companion whose save answers no-edit for a line-ending change", async () => {
  const h = await fixture(), path = `${h.folder}/endings.txt`, file = join(h.checkout, path);
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "endings.txt");
  await seed(h.f, reference, "First line.\nSecond line.\n");
  await startProjection(h); await endProjection(h);
  await openArchivedProjectionFile(h, path);
  await writeFile(file, "First line.\r\nSecond line.\r\n");
  await utimes(file, new Date(0), new Date(0));
  const saved = await save(h);
  expect(saved.errors).toBe("");
  expect(saved.result).toMatchObject({ status: "ok", result: { relocked: [{ path }] } });
  expect(success(await h.store.read({ reference })).content).toBe("First line.\nSecond line.\n");
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it.each([true, false])("names the files a refused save re-locked (json=%s)", async json => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  let refusing = false;
  const store = overrideEngineStore(h.store, { version: async () => refusing ? { status: "refused", refusal: { code: "lock-held",
    class: "recoverable", lock: "archive", condition: "Archive writer held.", remedy: { text: "Release the writer and retry arc save." } } }
    : h.store.version() });
  // The version read the save ends on refuses once the re-lock has begun closing the opening.
  binding.hooks = { beforeSaveMarkClear: async () => { refusing = true; } };
  const saved = await save({ ...h, store }, [], json);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  if (json) expect(saved.result).toMatchObject({ status: "refused", relocked: [{ path: h.path,
    remedy: { text: expect.stringContaining(`arc edit ${h.path} from `) } }] });
  else {
    expect(saved.output).toContain("Release the writer");
    expect(saved.output).toContain(`Re-locked ${h.path}.`);
  }
});

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

it.each([false, true])("re-locks an opening its rights no longer allow unless it holds an edit, which its owner then lands (edited=%s)", async edited => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  const content = edited ? await edit(h) : null;
  const identity = async (name: string) => { await createExecaGitExec()("git", ["config", "arc.identity", name], { cwd: h.checkout }); };
  await identity("beth");
  const saved = await save(h);
  if (content === null) {
    // A file holding no edit is laid read-only and closed whoever saves; the rights bind only an edit sent.
    expect(saved.result).toMatchObject({ status: "ok", result: { relocked: [{ path: h.path }] } });
    expect(await diskEntry(h)).not.toHaveProperty("opened");
    expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
    return;
  }
  expect(pathLines(saved.errors, h.path).join("\n")).toContain("andrew");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(join(h.checkout, h.path))).mode & 0o200).toBe(0o200);
  await identity("andrew");
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});

it.each(["re-lock", "writable restoration"] as const)("retains the permission-blocked opening during %s and re-locks the other file", async transition => {
  const h = await fixture(), file = join(h.checkout, h.path), second = `${h.folder}/second.txt`;
  await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "second.txt"), "A second correction.\n");
  await startProjection(h); await endProjection(h);
  await openArchivedProjectionFile(h, h.path);
  await openArchivedProjectionFile(h, second);
  const bytes = await readFile(file);
  let deny = transition === "re-lock";
  if (!deny) binding.hooks = { afterSaveReadOnly: async path => {
    if (path !== h.path) return;
    await chmod(file, 0o644);
    await writeFile(file, "");
    await chmod(file, 0o444);
    deny = true;
  } };
  binding.beforeModeOpen = async path => {
    if (path === file && deny) throw Object.assign(new Error("Permissions changed"), { code: "EACCES" });
  };
  const held = await save(h);
  expect(held.result).toMatchObject({ status: "ok", result: { relocked: [{ path: second }] } });
  expect(held.errors).toContain(`Cannot change permissions for ${h.path}`);
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(transition === "re-lock" ? 0o200 : 0);
  expect((await lstat(join(h.checkout, second))).mode & 0o222).toBe(0);
  binding.beforeModeOpen = null;
  binding.hooks = undefined;
  if (transition === "writable restoration") {
    await chmod(file, 0o644);
    await writeFile(file, bytes);
  }
  expect((await save(h)).result).toMatchObject({ status: "ok", result: { relocked: [{ path: h.path }] } });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});

it("retains an opened path when the file becomes part of a nested Git checkout", async () => {
  const h = await fixture(), file = join(h.checkout, h.path), folder = join(h.checkout, h.folder);
  await openArchivedProjectionFile(h, h.path);
  await h.f.ports.exec("git", ["init", "--quiet", folder], { cwd: h.checkout });
  const content = await edit(h, "This edit belongs to the nested checkout.");
  const saved = await save(h);
  expect(saved.errors).toContain("belongs to another checkout");
  expect(saved.result).toMatchObject({ status: "ok" });
  expect(saved.result).not.toHaveProperty("result.relocked");
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  expect(await readFile(file, "utf8")).toContain(content);
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(h.primary.version);
  await rm(join(folder, ".git"), { recursive: true });
  expect((await save(h)).result).toMatchObject({ status: "ok", result: { relocked: [{ path: h.path }] } });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
});

it("reports a path validation error after opening the handle and re-locks the next file", async () => {
  const h = await fixture(), file = join(h.checkout, h.path), second = `${h.folder}/second.txt`;
  await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "second.txt"), "A second correction.\n");
  await startProjection(h); await endProjection(h);
  await openArchivedProjectionFile(h, h.path);
  await openArchivedProjectionFile(h, second);
  binding.afterModeOpen = path => {
    if (path === file) binding.deniedValidation = join(h.checkout, h.folder, ".git");
  };
  // Allow the second file to validate the same directory once the first one reports its refusal.
  binding.beforeModeOpen = async path => {
    if (path === join(h.checkout, second)) binding.deniedValidation = null;
  };
  const held = await save(h);
  expect(held.errors).toContain(`Cannot validate ${h.path}: EACCES`);
  expect(held.result).toMatchObject({ status: "ok", result: { relocked: [{ path: second }] } });
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  binding.afterModeOpen = null;
  expect((await save(h)).result).toMatchObject({ status: "ok", result: { relocked: [{ path: h.path }] } });
});

it.each(["file capture", "copy preflight"] as const)("holds one inaccessible archive path during %s and saves the next", async phase => {
  const h = await fixture();
  const later = `${h.folder}/zz-later.txt`;
  const laterReference = recordReferences["work-item/companion"](h.primary.reference.owner, "zz-later.txt");
  await seed(h.f, laterReference, "Original companion.\n");
  await startProjection(h); await endProjection(h);
  await openArchivedProjectionFile(h, h.path);
  await openArchivedProjectionFile(h, later);
  const content = await edit(h, "Retained first correction.");
  if (phase === "copy preflight") {
    binding.hooks = { afterMove: async path => {
      if (path === h.path) throw new Error("Stopped before installing the replacement");
    } };
    await expect(save(h)).rejects.toThrow("Stopped before installing the replacement");
    expect(await diskEntry(h)).toMatchObject({ copies: [expect.any(Object)], opened: true });
    binding.hooks = undefined;
  }
  await writeFile(join(h.checkout, later), "New companion.\n");
  binding.deniedLinkProbe = join(await realpath(h.checkout), h.folder);
  const held = await save(h);
  expect(binding.deniedLinkProbe).toBeNull();
  expect(held.errors).toContain("EACCES");
  expect(held.result).toMatchObject({ status: "ok", result: { relocked: [{ path: later }] } });
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect(success(await h.store.read({ reference: laterReference })).content).toBe("New companion.\n");
  if (phase === "file capture") expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(h.primary.version);
  expect((await save(h)).result).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
});

it("holds an inaccessible archive copy at command end and settles the other copy", async () => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  const companion = await openedTextCompanion(h);
  await edit(h, "Keep the first displaced copy.");
  const command = { ...h, mode: "save" as const };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  const copies = projectionProcessState().roots.get(h.checkout)?.copies ?? [];
  const first = copies.find(copy => copy.path === h.path), second = copies.find(copy => copy.path === companion.path);
  if (first === undefined || second === undefined) throw new Error("Expected both displaced archive copies");
  binding.deniedLinkProbe = join(await realpath(h.checkout), first.path);
  await endProjection(command);
  expect(binding.deniedLinkProbe).toBeNull();
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ path: h.path,
    mark: expect.objectContaining({ reason: expect.stringContaining("EACCES") }) })]));
  await expect(readFile(join(h.checkout, first.copy))).resolves.toBeInstanceOf(Buffer);
  await expect(readFile(join(h.checkout, second.copy))).rejects.toMatchObject({ code: "ENOENT" });
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
  // Write-back reports the refusal; the re-lock that keeps the opening does not name the path again.
  expect(pathLines(saved.errors, h.path)).toHaveLength(1);
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

it("keeps an open archive file untouched while a parent folder is a link", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  const folder = join(h.checkout, h.folder), held = `${folder}-held`;
  await rename(folder, held);
  await symlink(held, folder, "junction");
  const saved = await save(h);
  expect(saved.errors).toContain("symbolic link");
  expect(saved.result).toMatchObject({ status: "ok" });
  expect(saved.result).not.toHaveProperty("result.relocked");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  await rm(folder, { recursive: true });
  await rename(held, folder);
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
  const unparsed = await save(h);
  expect(unparsed.errors).toContain("Repair");
  expect(pathLines(unparsed.errors, h.path)).toHaveLength(1);
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
it.each([false, true])("keeps a clash from a competing checkout open until its markers are resolved (interrupted=%s)", async interrupted => {
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
  if (interrupted) await recoverFirstLay(h.input, h.path, h.primary.reference, async () => (await h.disk()).index.entries[h.path]);
  else expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
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

it.each(["ordinary command", "direct save", "timestamp change"] as const)("recovers recorded archive text without a second submit after a %s", async retry => {
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
  if (retry === "ordinary command") { await startProjection(command); await endProjection(command); }
  if (retry === "timestamp change") await utimes(file, new Date(0), new Date(0));
  expect(await save(command)).toMatchObject({ result: { status: "ok" } });
  expect(submissions).toBe(before);
  expect(success(await h.store.read({ reference })).version).toBe(accepted.version);
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it.each(["arc save", "an ordinary command"] as const)(
  "withholds an opened archive file whose retained input no longer matches when %s finishes it, and lays the stored record once it is deleted",
  async route => {
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
    const entry = await diskEntry(h, path);
    if (entry?.kind !== "record" || entry.persisted?.takenIn.kind !== "copy") throw new Error("Expected a retained input copy");
    await writeFile(join(h.projected.location.stateDir, TAKEN_IN_FOLDER, entry.persisted.takenIn.name), "Not the accepted input.\n");
    if (route === "arc save") expect((await save(command)).errors).toContain(`${path}: withheld: The projection has no trustworthy basis`);
    else { await startProjection(command); await endProjection(command); }
    expect(await diskEntry(h, path)).toMatchObject({ withheld: true, persisted: null,
      refused: { remedy: { text: expect.stringContaining("delete the withheld file") } } });
    expect(await readFile(file, "utf8")).toBe(content);
    await rm(file);
    await startProjection(command); await endProjection(command);
    expect(await readFile(file, "utf8")).toBe(content);
    expect(await diskEntry(h, path)).toMatchObject({ withheld: false, opened: true });
    expect(await save(command)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path }] } } });
    expect(await diskEntry(h, path)).not.toHaveProperty("opened");
    expect((await lstat(file)).mode & 0o222).toBe(0);
    expect(submissions).toBe(1);
    expect(success(await h.store.read({ reference })).content).toBe(content);
  });

it.each(["markdown", "text", "already-stored", "unaccepted", "unaccepted-text", "blocked-history"] as const)("recovers a staged archive submission at the first post-batch checkpoint (%s)", async kind => {
  const h = await fixture();
  const text = kind === "text" || kind === "already-stored" || kind === "unaccepted-text";
  const unaccepted = kind.startsWith("unaccepted");
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
        if (unaccepted) throw new Error("Stopped before the store accepted the save");
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
  await expect(save(command)).rejects.toThrow(unaccepted ? "Stopped before the store accepted the save"
    : "Stopped at the first checkpoint after acceptance");
  if (archiveSaveId === undefined) throw new Error("Missing archive save id");
  expect(await diskEntry(h, path)).toMatchObject({ opened: true, archiveSubmission: { id: archiveSaveId } });
  const accepted = success(await h.store.read({ reference }));
  const receipts = success(await h.store.history({ reference, archiveSaveId }));
  if (unaccepted) {
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
  expect(submissions).toBe(unaccepted ? 2 : 1);
  const landed = success(await h.store.read({ reference }));
  expect(landed.content).toBe(content);
  if (!unaccepted) expect(landed.version).toBe(accepted.version);
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect(await diskEntry(h, path)).not.toHaveProperty("archiveSubmission");
  expect((await lstat(join(h.checkout, path))).mode & 0o222).toBe(0);
});

it.each(["unchanged", "edited", "reverted"] as const)("recovers an accepted own-save receipt with a %s aside copy", async state => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  await edit(h, "First correction.");
  let copy: string | undefined;
  let moving: string | undefined;
  binding.hooks = { afterMove: async path => {
    if (path !== h.path || copy !== undefined) return;
    const entry = await diskEntry(h);
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("Missing displaced archive file");
    copy = entry.copies[0].name;
    const filename = join(h.checkout, copy);
    moving = await readFile(filename, "utf8");
    await writeFile(filename, `${moving}\nThe displaced correction.\n`);
  } };
  const asideSends: string[] = [];
  let receipt: string | undefined;
  const store = overrideEngineStore(h.store, { batch: async input => {
    const result = await h.store.batch(input);
    const captured = input.projectionAdmission;
    if (captured?.local.source !== "aside") return result;
    asideSends.push(captured.input.file.content);
    if (asideSends.length === 1) {
      expect(result.status).toBe("ok");
      receipt = input.provenance.archiveSaveId;
      const root = projectionProcessState().roots.get(h.checkout);
      if (root === undefined) throw new Error("Missing projection root");
      root.checkpoint = async () => { throw new Error("Stopped after accepting the displaced edit"); };
    }
    return result;
  } });
  const command = { ...h, store };
  binding.writerInstance = "interrupted-save";
  await expect(save(command)).rejects.toThrow("Stopped after accepting the displaced edit");
  expect(receipt).toBeDefined();
  expect(await diskEntry(h)).toMatchObject({ archiveSubmission: { id: receipt, aside: copy } });
  const accepted = success(await h.store.read({ reference: h.primary.reference }));
  expect(accepted.content).toContain("The displaced correction.");
  if (copy === undefined || moving === undefined) throw new Error("The interrupted save did not create a displaced copy");
  const copyPath = join(h.checkout, copy), later = "Another edit after acceptance.";
  if (state === "edited") await writeFile(copyPath, `${await readFile(copyPath, "utf8")}\n${later}\n`);
  if (state === "reverted") await writeFile(copyPath, moving);
  binding.hooks = undefined;
  binding.writerInstance = undefined;
  const retry = await save(command);
  expect(retry.result).toMatchObject({ status: "ok" });
  expect(await diskEntry(h)).not.toHaveProperty("archiveSubmission");
  const stored = success(await h.store.read({ reference: h.primary.reference }));
  if (state === "edited") expect(stored.content).toContain(later);
  if (state === "reverted") {
    expect(stored.content).toContain("First correction.");
    expect(stored.content).not.toContain("The displaced correction.");
  }
  if (state === "unchanged") expect(stored.version).toBe(accepted.version);
  expect(asideSends).toHaveLength(state === "unchanged" ? 1 : 2);
});

async function openedNewText(h: Awaited<ReturnType<typeof fixture>>, extension: "txt" | "md" = "txt") {
  const name = `new.${extension}`;
  const path = `${h.folder}/${name}`, file = join(h.checkout, path), content = "The new archived text.\n";
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, name);
  await writeFile(file, content);
  await openArchivedProjectionFile(h, path);
  return { path, file, reference, content };
}

it("completes the first lay after recovering the accepted original text", async () => {
  const h = await fixture(), { path, reference, content } = await openedTextCompanion(h);
  await recoverFirstLay(h, path, reference, () => diskEntry(h, path));
  expect(success(await h.store.read({ reference })).content).toBe(content);
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
});

async function recoverFirstLay(h: { checkout: string; store: Store }, path: string,
  reference: Parameters<Store["read"]>[0]["reference"], readEntry: () => ReturnType<typeof diskEntry>) {
  let submissions = 0;
  const store = overrideEngineStore(h.store, { batch: async input => {
    submissions += 1;
    return h.store.batch(input);
  } });
  const command = { ...h, store };
  binding.writerInstance = "interrupted-save";
  binding.hooks = { afterMove: async moved => { if (moved === path) binding.stopAfterIndexCommit = true; } };
  await expect(save(command)).rejects.toThrow("Stopped after recording the installation attempt");
  const entry = await readEntry();
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No recorded original copy");
  const original = entry.copies[0].name;
  expect(entry.acceptedInputStat).toMatchObject({ lay: { kind: "linking", originalCopy: original } });
  await expect(lstat(join(h.checkout, path))).rejects.toMatchObject({ code: "ENOENT" });
  const accepted = success(await h.store.read({ reference }));
  await utimes(join(h.checkout, original), new Date(0), new Date(0));

  binding.writerInstance = undefined;
  binding.hooks = undefined;
  expect(await save(command)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path }] } }, errors: "" });
  expect(success(await h.store.read({ reference })).version).toBe(accepted.version);
  expect(submissions).toBe(1);
  await expect(lstat(join(h.checkout, original))).rejects.toMatchObject({ code: "ENOENT" });
}

it.each([[false, false, false], [false, true, false], [true, false, false], [true, true, false], [false, true, true], [true, true, true]])(
  "distinguishes accepted text from a revert after newer text is installed (installed=%s, adoption=%s, legacy=%s)", async (installed, adoption, legacy) => {
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
  if (legacy) binding.writerInstance = "predecessor-adoption-writer";
  binding.hooks = installed ? { afterFirstCheck: stop } : { afterRecheck: stop };
  await expect(save(command)).rejects.toThrow("Stopped during read-back installation");
  expect(await readFile(file, "utf8")).toBe(installed ? later : content);
  if (legacy) await usePredecessorAdoptionJournal(h, path);
  if (installed) {
    await chmod(file, 0o644);
    await writeFile(file, content);
  } else await utimes(file, new Date(0), new Date(0));
  binding.hooks = undefined;
  binding.writerInstance = undefined;
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

it.each([[false, "predecessor"], [true, "predecessor"], [false, "current"], [true, "current"]] as const)(
  "uses the proved Markdown installation after its writer exits (installed=%s, journal=%s)", async (installed, journal) => {
  const h = await fixture(), { path, file, reference, content } = await openedNewText(h, "md");
  const newer = "A newer Markdown correction from another command.\n";
  let submissions = 0;
  const store = overrideEngineStore(h.store, { batch: async input => {
    const result = await h.store.batch(input);
    if (++submissions === 1) {
      const accepted = success(await h.store.read({ reference }));
      expect(accepted.content).toBe(content);
      success(await h.store.write(update(h.f, accepted, newer)));
    }
    return result;
  } });
  const command = { ...h, store };
  const stop = async (observed: string) => { if (observed === path) throw new Error("Stopped during Markdown installation"); };
  binding.hooks = installed ? { afterFirstCheck: stop } : { afterRecheck: stop };
  binding.writerInstance = "interrupted-markdown-writer";
  await expect(save(command)).rejects.toThrow("Stopped during Markdown installation");
  expect(await diskEntry(h, path)).toHaveProperty("inProgress", null);
  expect(parseStampedFile(await readFile(file, "utf8")).content).toBe(installed ? newer : content);
  if (journal === "predecessor") await usePredecessorAdoptionJournal(h, path);
  if (installed) {
    await chmod(file, 0o644);
    await writeFile(file, content);
  } else await utimes(file, new Date(0), new Date(0));

  binding.hooks = undefined;
  binding.writerInstance = undefined;
  await save(command);
  const bytes = await readFile(file, "utf8");
  if (installed) {
    expect(parseStampedFile(bytes).content).toBe(content);
    expect(success(await h.store.read({ reference })).content).toBe(content);
    expect(submissions).toBe(2);
  }
  else {
    expect(parseStampedFile(bytes).content).toBe(newer);
    expect(await diskEntry(h, path)).not.toHaveProperty("opened");
    expect(submissions).toBe(1);
  }
});

async function usePredecessorAdoptionJournal(h: Awaited<ReturnType<typeof fixture>>, path: string): Promise<void> {
  const { location } = h.projected;
  const read = await readProjectionIndex(location, true, { groups: "all" });
  if (read.kind !== "index") throw new Error("No adoption index");
  const entry = read.index.entries[path];
  if (entry?.kind !== "record" || entry.acceptedInputStat === undefined) throw new Error("No staged adoption");
  const { ino, mtimeNs } = entry.acceptedInputStat;
  await writeProjectionIndex(location, withProjectionEntry(read.index, path, { ...entry, acceptedInputStat: { ino, mtimeNs, beforeLay: true } }));
}

it.each(["link", "enumeration"] as const)("restores an access-held copy after rebuilding a lost index with denied %s", async denied => {
  const h = await archiveRetirementFixture(), { checkout } = h;
  const sibling = `${h.folder}/sibling.txt`;
  const siblingRef = recordReferences["work-item/companion"](h.primary.reference.owner, "sibling.txt");
  await seed(h.f, siblingRef, "An accessible sibling.\n");
  await projectionCommand(h.input, ["status"]);
  const { location, index } = await h.disk(), writer = { ...await createProjectionEnginePorts(checkout).writer(), processInstance: "exited-rebuild" };
  const active = Object.keys(index.entries).find(path => path.startsWith(".arc/active/") && path.endsWith("/meta-retiring.md"));
  if (active === undefined) throw new Error("Missing the accessible active record");
  const readable = denied === "link" ? sibling : active;
  const readableBytes = await readFile(join(checkout, readable));
  const unseen = `${h.folder}/unindexed-archive-edit.md`;
  const unseenBytes = "An unindexed archive edit in the unreadable scope.\n";
  if (denied === "enumeration") await writeFile(join(checkout, unseen), unseenBytes);
  const copies = await Promise.all([h.path, readable].map(async path => {
    const entry = index.entries[path];
    if (entry?.kind !== "record") throw new Error("Missing file for rebuild recovery");
    const name = nameAsideFile({ path, base: entry.base.blob, writer, role: "aside" });
    const absolute = join(checkout, name);
    await mkdir(dirname(absolute), { recursive: true });
    await rename(join(checkout, path), absolute);
    return { name, absolute, base: entry.base.blob };
  }));
  const [held, accessible] = copies;
  if (held === undefined || accessible === undefined) throw new Error("Missing recovery copies");
  const edit = `${h.primary.content}\nAn edit in the access-held copy.\n`;
  await chmod(held.absolute, 0o644);
  await writeFile(held.absolute, renderStampedFile({ content: edit, stamp: held.base }));
  await rm(join(location.stateDir, PROJECTION_INDEX_FILE));

  if (denied === "link") binding.deniedRecoverySource = held.absolute;
  else binding.deniedWalkFolder = join(checkout, h.folder);
  const first = await projectionCommand(h.input, ["status"]);
  expect(first.diagnostics).toContain("EACCES");
  if (denied === "enumeration") {
    expect(first.diagnostics).toContain(`Cannot enumerate ${h.folder}`);
    const rebuilt = (await h.disk()).index;
    expect(rebuilt.state).toBeNull();
    expect(rebuilt.archiveDiscoveryPending).toEqual([h.folder]);
    expect(rebuilt.entries[active]).toMatchObject({ kind: "record", pending: false });
    expect(rebuilt.entries[unseen]).toBeUndefined();
  }
  expect((await h.disk()).index.archiveRecoveryCopies).toEqual([held.name]);
  await expect(lstat(join(checkout, h.path))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(lstat(accessible.absolute)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(checkout, readable))).toEqual(readableBytes);

  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain("EACCES");
  expect((await h.disk()).index.archiveRecoveryCopies).toEqual([held.name]);
  if (denied === "enumeration") expect((await h.disk()).index.archiveDiscoveryPending).toEqual([h.folder]);
  binding.deniedRecoverySource = null;
  binding.deniedWalkFolder = null;
  if (denied === "enumeration") {
    // Listing can succeed even though search access still prevents the authority check inside the directory.
    binding.deniedValidation = join(checkout, h.folder, ".git");
    const searchDenied = await projectionCommand(h.input, ["status"]);
    const retained = (await h.disk()).index;
    expect(searchDenied.diagnostics).toContain(`Cannot validate ${unseen}: EACCES`);
    expect(retained.archiveDiscoveryPending).toContain(unseen);
    expect(retained.entries[unseen]).toBeUndefined();
    expect(retained.state).toBeNull();
    binding.deniedValidation = null;
  }
  if (denied === "link") {
    // A deleted-file restoration working from the rebuilt index leaves the held destination to recovery.
    await rm(join(checkout, sibling));
    await restoreSyncProjection(h.store, checkout, {});
    expect(await readFile(join(checkout, sibling), "utf8")).toBe("An accessible sibling.\n");
    await expect(lstat(join(checkout, h.path))).rejects.toMatchObject({ code: "ENOENT" });
  }
  const repaired = await projectionCommand(h.input, ["status"]);
  expect(repaired.result).toMatchObject({ kind: "ready" });
  expect(await readFile(join(checkout, h.path), "utf8")).toContain(edit);
  await expect(lstat(held.absolute)).rejects.toMatchObject({ code: "ENOENT" });
  const recovered = (await h.disk()).index;
  expect(recovered.archiveRecoveryCopies).toBeUndefined();
  if (denied === "enumeration") {
    expect(recovered.archiveDiscoveryPending).toBeUndefined();
    expect(recovered.entries[unseen]).toMatchObject({ kind: "ownerless", withheld: true });
    expect(repaired.diagnostics).toContain(unseen);
    expect(await readFile(join(checkout, unseen), "utf8")).toBe(unseenBytes);
  }
  expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(h.primary.version);
}, 30_000);

it.each([false, true])("keeps a sync copy under an unreadable folder and settles an accessible copy (rebuild=%s)", async rebuild => {
  const h = await archiveRetirementFixture();
  const { index, location } = await h.disk();
  const active = Object.entries(index.entries).find(([path, entry]) => path.startsWith(".arc/active/") && entry.kind === "record");
  if (active === undefined || active[1].kind !== "record") throw new Error("Missing accessible record");
  const activeRecord = success(await h.store.read({ reference: active[1].reference }));
  for (const record of [h.primary, activeRecord]) success(await h.store.write(update(h.f, record, `${record.content}\nA newer version.\n`)));

  binding.writerInstance = "interrupted-sync-writer";
  expect(await startProjection(h.input)).toMatchObject({ kind: "ready" });
  const root = projectionProcessState().roots.get(h.checkout);
  const held = root?.copies.find(copy => copy.path === h.path);
  const accessible = root?.copies.find(copy => copy.path === active[0]);
  if (held === undefined || accessible === undefined) throw new Error("Sync start did not queue both copies");
  if (rebuild) {
    const headerPath = join(location.stateDir, PROJECTION_INDEX_FILE);
    const header = JSON.parse(await readFile(headerPath, "utf8")) as { groups: Record<string, { name: string; unsettled: boolean }> };
    const name = `index-${"1".repeat(40)}`;
    header.groups[".arc/completed/1999-q1"] = { name, unsettled: false };
    await writeFile(join(location.stateDir, name), "A damaged unrelated archive partition");
    await writeFile(headerPath, JSON.stringify(header));
    expect(await readProjectionIndex(location, true, { groups: "all" })).toMatchObject({ kind: "unusable" });
  }
  binding.deniedWalkFolder = join(h.checkout, h.folder);
  await restoreSyncProjection(h.store, h.checkout, {});
  await endProjection(h.input);
  const settled = (await h.disk()).index;
  if (rebuild) expect(settled.archiveRecoveryCopies).toContain(held.copy);
  else expect(settled.entries[h.path]).toMatchObject({ copies: [{ name: held.copy }] });
  expect(settled.entries[active[0]]).toMatchObject({ copies: [] });
  await expect(readFile(join(h.checkout, held.copy))).resolves.toBeInstanceOf(Buffer);
  await expect(lstat(join(h.checkout, accessible.copy))).rejects.toMatchObject({ code: "ENOENT" });

  binding.deniedWalkFolder = null;
  binding.writerInstance = undefined;
  await projectionCommand(h.input, ["status"]);
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ copies: [] });
}, 30_000);

it.each([false, true])("inventories a restored unindexed edit after a link-only denial (interrupted=%s)", async interrupted => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const path = `${h.folder}/unindexed-copy.md`, file = join(h.checkout, path);
  const entry = index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing projected archive record");
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-unindexed-writer" };
  const copy = nameAsideFile({ path, base: entry.base.blob, writer, role: "aside" });
  const aside = join(h.checkout, copy), content = "An unindexed edited aside.\n";
  await mkdir(dirname(aside), { recursive: true });
  await writeFile(aside, content);
  await rm(join(location.stateDir, PROJECTION_INDEX_FILE));
  binding.deniedRecoverySource = aside;
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain("EACCES");
  const pending = (await h.disk()).index;
  expect(pending.archiveRecoveryCopies).toEqual([copy]);
  expect(pending.archiveDiscoveryPending).toBeUndefined();
  expect(pending.state).toBeNull();
  binding.deniedRecoverySource = null;
  if (interrupted) {
    const store = overrideEngineStore(h.store, { list: async () => {
      expect(await readFile(file, "utf8")).toBe(content);
      throw new Error("Stopped after recovery link, before publishing inventory");
    } });
    await expect(startProjection({ ...h.input, store })).rejects.toThrow("Stopped after recovery link");
    await expect(lstat(aside)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.disk()).index.archiveRecoveryCopies).toEqual([copy]);
  }
  const repaired = await projectionCommand(h.input, ["status"]);
  const recovered = (await h.disk()).index;
  expect(repaired.diagnostics).toContain(`${path}: withheld`);
  expect(await readFile(file, "utf8")).toBe(content);
  expect(recovered.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(recovered.archiveRecoveryCopies).toBeUndefined();
  expect(recovered.state).toBe(success(await h.store.version()));
}, 30_000);

it.each(["stat", "recheck"] as const)("sync restores an accessible sibling after a denied archive %s", async stage => {
  const h = await archiveRetirementFixture(), { index } = await h.disk();
  const active = Object.keys(index.entries).find(path => path.startsWith(".arc/active/") && path.endsWith("/meta-retiring.md"));
  if (active === undefined) throw new Error("Missing an accessible projected record");
  expect(await startProjection(h.input)).toMatchObject({ kind: "ready" });
  const file = join(h.checkout, h.path), sibling = join(h.checkout, active);
  await rm(sibling);
  if (stage === "stat") {
    await rm(file);
    binding.deniedValidation = file;
  } else {
    await chmod(file, 0o644);
    await writeFile(file, "");
    await utimes(file, new Date(0), new Date(0));
    binding.deniedLinkProbe = file;
  }
  await restoreSyncProjection(h.store, h.checkout, {});
  expect(projectionProcessState().diagnostics).toContainEqual(expect.objectContaining({ path: h.path,
    mark: expect.objectContaining({ reason: expect.stringContaining("EACCES") }) }));
  if (stage === "stat") {
    binding.deniedValidation = null;
    await expect(lstat(file)).rejects.toMatchObject({ code: "ENOENT" });
  } else {
    expect(binding.deniedLinkProbe).toBeNull();
    expect(await readFile(file, "utf8")).toBe("");
  }
  expect(await readFile(sibling, "utf8")).toContain("retiring");
  await endProjection(h.input);
  await projectionCommand(h.input, ["sync"]);
  expect(await readFile(file, "utf8")).toContain(h.primary.content.trim());
}, 30_000);

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

it("holds a resumed adoption read-back whose file a permission refusal hides, then finishes it after the repair", async () => {
  const h = await fixture(), { path, file, reference, content } = await openedNewText(h);
  binding.hooks = { afterMove: async at => {
    if (at === path) throw new Error("Stopped after the adoption read-back moved the file aside");
  } };
  await expect(startProjection(h)).rejects.toThrow("Stopped after the adoption read-back moved the file aside");
  binding.hooks = undefined;
  expect(await diskEntry(h, path)).toMatchObject({ opened: true, adoption: { kind: "read-back" }, inProgress: expect.any(Object) });
  // Access changes after the walk observed the file: the resumed read-back's own stat meets the refusal.
  let armed = false;
  const store = overrideEngineStore(h.store, { read: async input => {
    if (!armed && sameReference(input.reference, reference)) { armed = true; binding.deniedOnce = file; }
    return h.store.read(input);
  } });
  await startProjection({ ...h, store });
  const held = projectionProcessState().diagnostics.filter(each => each.path === path);
  await endProjection({ ...h, store });
  expect(binding.deniedOnce).toBeNull();
  expect(held.map(each => each.mark.reason).join("\n")).toContain("EACCES");
  expect(await diskEntry(h, path)).toMatchObject({ opened: true, adoption: { kind: "read-back" }, pending: true });
  await startProjection(h); await endProjection(h);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference })).content).toBe(content);
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
});

it("recovers an interrupted ordinary attachment to an existing archive record once", async () => {
  const h = await fixture(), { path, file, reference, content } = await openedNewText(h);
  const later = "Peer's newer correction.\n";
  await seed(h.f, reference, "Store's baseline before the attaching edit.\n");
  let submissions = 0;
  const store = overrideEngineStore(h.store, {
    batch: async input => {
      const result = await h.store.batch(input);
      submissions += 1;
      if (submissions === 1) {
        const accepted = success(await h.store.read({ reference }));
        expect(accepted.content).toBe(content);
        success(await h.store.write(update(h.f, accepted, later)));
        const root = projectionProcessState().roots.get(h.checkout);
        if (root === undefined) throw new Error("Missing projection root");
        root.checkpoint = async () => { throw new Error("Stopped immediately after attachment acceptance"); };
      }
      return result;
    },
  });
  const command = { ...h, store };
  await expect(startProjection(command)).rejects.toThrow("Stopped immediately after attachment acceptance");
  expect(await diskEntry(h, path)).toMatchObject({ opened: true, adoption: { kind: "write-back" }, archiveSubmission: expect.any(Object) });
  const peer = success(await h.store.read({ reference }));
  await startProjection(command); await endProjection(command);
  expect(submissions).toBe(1);
  expect(success(await h.store.read({ reference }))).toMatchObject({ content: later, version: peer.version, conflicts: [] });
  expect(await save(command)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(await readFile(file, "utf8")).toBe(later);
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it("reuses the accepted observation for a late edit during adoption read-back", async () => {
  const h = await fixture(), { path, file, reference, content } = await openedNewText(h);
  const late = "A late text edit while the new file is being adopted.\n";
  let submissions = 0;
  const store = overrideEngineStore(h.store, {
    batch: async input => {
      const result = await h.store.batch(input);
      submissions += 1;
      const landed = success(await h.store.read({ reference }));
      if (submissions === 1) {
        expect(landed.content).toBe(content);
        await writeFile(file, late);
      }
      if (submissions === 2) {
        expect(landed.content).toBe(late);
        const root = projectionProcessState().roots.get(h.checkout);
        if (root === undefined) throw new Error("Missing projection root");
        root.checkpoint = async () => { throw new Error("Stopped after the late edit landed"); };
      }
      return result;
    },
  });
  const command = { ...h, store };
  await expect(save(command)).rejects.toThrow("Stopped after the late edit landed");
  expect(await diskEntry(h, path)).toMatchObject({ opened: true, adoption: { kind: "read-back" }, archiveSubmission: expect.any(Object) });
  const accepted = success(await h.store.read({ reference }));
  expect(await save(command)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(submissions).toBe(2);
  expect(success(await h.store.read({ reference }))).toMatchObject({ content: late, version: accepted.version });
  expect(await readFile(file, "utf8")).toBe(late);
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it("sends no archive save whose index became unusable before its journal, and lands it once after the named rebuild", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  const content = await edit(h), edited = await readFile(file, "utf8");
  const header = JSON.parse(await readFile(join(h.projected.location.stateDir, "index"), "utf8")) as { groups: Record<string, { name: string }> };
  const partition = join(h.projected.location.stateDir, header.groups[".arc/completed/2026-q4"]!.name);
  let submissions = 0;
  const store = overrideEngineStore(h.store, { batch: async input => { submissions += 1; return h.store.batch(input); } });
  binding.afterPrepared = async () => { binding.afterPrepared = undefined; await rm(partition); };
  const refused = await save({ ...h, store });
  expect(submissions).toBe(0);
  expect(pathLines(refused.errors, h.path).join("\n")).toContain("The archive edit could not be recorded.");
  expect(refused.errors).toContain("Run arc sync from this checkout to rebuild the index, then retry arc save.");
  expect(await readFile(file, "utf8")).toBe(edited);
  await projectionCommand({ store, checkout: h.checkout }, ["sync"]);
  expect(await save({ ...h, store })).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(submissions).toBe(1);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it("refuses an archive save receipt whose matching commit carries no verifiable provenance, until the history is restored", async () => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  await edit(h);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  const git = async (...args: string[]) => (await h.f.ports.exec("git", args, { cwd: h.checkout })).stdout.trim();
  const saved = await git("log", "--all", "--fixed-strings", "--grep=Arc-Archive-Save:", "-n", "1", "--format=%H");
  const trailer = (await git("log", "-n", "1", "--format=%B", saved)).split("\n").find(line => line.startsWith("Arc-Archive-Save: "));
  if (trailer === undefined) throw new Error("The archive save carries no receipt");
  const id = trailer.split(" ")[1]!;
  // Each ref whose tip is the save, the record's history among them, gets a commit naming the receipt without its provenance.
  const tips = (await git("for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/")).split("\n").map(line => line.split(" ") as [string, string]);
  const receipted = [];
  for (const [tip, ref] of tips) if ((await git("log", "-n", "1", "--format=%B", tip)).includes(trailer)) receipted.push({ tip, ref });
  expect(receipted.length).toBeGreaterThan(0);
  const forged = [];
  for (const { tip, ref } of receipted) {
    const commit = await git("commit-tree", `${tip}^{tree}`, "-p", tip, "-m", "An unverified correction", "-m", trailer);
    await git("update-ref", ref, commit, tip);
    forged.push({ tip, ref, commit });
  }
  expect(await h.store.history({ reference: h.primary.reference, archiveSaveId: id })).toMatchObject({ status: "refused", refusal: {
    condition: "An archive save commit does not contain its exact record and acceptance provenance.",
    remedy: { text: "Restore the referenced store history, then retry arc save." } } });
  for (const { tip, ref, commit } of forged) await git("update-ref", ref, tip, commit);
  expect(await h.store.history({ reference: h.primary.reference, archiveSaveId: id })).toMatchObject({ status: "ok",
    result: [{ reference: h.primary.reference, provenance: { archiveSaveId: id } }] });
});
