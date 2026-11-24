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
import { readFile, chmod, writeFile, lstat, realpath, rename, rm, utimes } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { ProjectionSaveResult } from "../../../../src/lib/store/projection/save.js";
import { projectionEditResult } from "../../../../src/lib/store/projection/edit.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
const binding = vi.hoisted(() => ({
  store: null as Store | null,
  hooks: undefined as import("../../../../src/lib/store/projection/swap.js").SwapHooks | undefined,
  beforeChmod: null as ((path: string, mode: number) => Promise<void>) | null,
}));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, chmod: async (path: Parameters<typeof chmod>[0], mode: Parameters<typeof chmod>[1]) => {
    if (typeof path === "string" && typeof mode === "number") await binding.beforeChmod?.(path, mode);
    return actual.chmod(path, mode);
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
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { relockOpenedProjectionFiles } from "../../../../src/lib/store/projection/save-relock.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
const directories: string[] = [];
afterEach(async () => {
  binding.store = null;
  binding.hooks = undefined;
  binding.beforeChmod = null;
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

async function projectedCompanion(h: Awaited<ReturnType<typeof fixture>>, name: string, content: string) {
  const path = `${h.folder}/${name}`, file = join(h.checkout, path);
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, name);
  const base = await seed(h.f, reference, content);
  await startProjection(h);
  await endProjection(h);
  return { path, file, reference, base };
}

it("re-locks a settled empty archived text companion", async () => {
  const h = await fixture();
  const { path, file, reference } = await projectedCompanion(h, "empty.txt", "");
  await utimes(file, new Date(0), new Date(0));
  await openArchivedProjectionFile(h, path);
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path }] } }, errors: "" });
  expect(success(await h.store.read({ reference })).content).toBe("");
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it("keeps a companion opened when an editor empties it during the read-only lay", async () => {
  const h = await fixture(), original = "Text before the edit.\n";
  const { path, file, reference } = await projectedCompanion(h, "emptied.txt", original);
  await openArchivedProjectionFile(h, path);
  binding.hooks = { afterSaveReadOnly: async target => {
    if (target !== path) return;
    await chmod(file, 0o644);
    await writeFile(file, "");
    await utimes(file, new Date(0), new Date(0));
  } };
  const held = await save(h);
  expect(held.errors).toContain("retry arc save");
  expect(held.errors).not.toContain("arc sync");
  expect(held.result).not.toHaveProperty("result.relocked");
  expect(await diskEntry(h, path)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  expect(success(await h.store.read({ reference })).content).toBe(original);
  binding.hooks = undefined;
  const finished = "Text after the editor finished.\n";
  await writeFile(file, finished);
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path }] } }, errors: "" });
  expect(success(await h.store.read({ reference })).content).toBe(finished);
});

it("retains an opening when the file disappears at the read-only lay", async () => {
  const h = await fixture(), file = join(await realpath(h.checkout), h.path);
  await openArchivedProjectionFile(h, h.path);
  binding.beforeChmod = async (target, mode) => {
    if (resolve(target) !== file || (mode & 0o222) !== 0) return;
    binding.beforeChmod = null;
    await rm(file);
  };
  const saved = await save(h);
  expect(saved.errors).toContain("arc sync");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  await startProjection(h);
  await restoreSyncProjection(h.store, h.checkout, { dryRun: false });
  await endProjection(h);
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path: h.path }] } }, errors: "" });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
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
  expect(saved.result).not.toHaveProperty("result.relocked");
  expect(saved.errors).toContain("retry arc save");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  binding.hooks = undefined;
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path: h.path }] } } });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it.each(["re-lock", "writable restoration"] as const)("retains the permission-blocked opening during %s and re-locks the other file", async transition => {
  const h = await fixture(), file = join(await realpath(h.checkout), h.path);
  const second = await projectedCompanion(h, "second.txt", "A second correction.\n");
  await openArchivedProjectionFile(h, h.path);
  await openArchivedProjectionFile(h, second.path);
  const bytes = await readFile(file);
  let deny = transition === "re-lock";
  if (transition === "writable restoration") binding.hooks = { afterSaveReadOnly: async path => {
    if (path !== h.path) return;
    await chmod(file, 0o644);
    await writeFile(file, "");
    await chmod(file, 0o444);
    deny = true;
  } };
  binding.beforeChmod = async target => {
    if (resolve(target) === file && deny) {
      throw Object.assign(new Error("Permissions changed"), { code: "EACCES" });
    }
  };
  const saved = await save(h);
  expect(saved.result).toMatchObject({ status: "ok", result: { relocked: [{ path: second.path }] } });
  expect(saved.errors).toContain(`Cannot change permissions for ${h.path}`);
  expect(saved.errors).toContain("retry arc save");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(transition === "re-lock" ? 0o200 : 0);
  expect(await diskEntry(h, second.path)).not.toHaveProperty("opened");
  expect((await lstat(second.file)).mode & 0o222).toBe(0);
  binding.beforeChmod = null;
  binding.hooks = undefined;
  if (transition === "writable restoration") {
    await chmod(file, 0o644);
    await writeFile(file, bytes);
  }
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path: h.path }] } }, errors: "" });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

async function projectedConflict(h: Awaited<ReturnType<typeof fixture>>) {
  const companion = await projectedCompanion(h, "conflict.md", "opening\nbase\nclosing\n");
  for (const content of ["opening\ncurrent\nclosing\n", "opening\nincoming\nclosing\n"]) {
    success(await h.store.write(update(h.f, companion.base, content)));
  }
  await startProjection(h);
  await endProjection(h);
  const before = success(await h.store.read({ reference: companion.reference }));
  const conflict = before.conflicts[0];
  if (conflict === undefined) throw new Error("No conflict was produced");
  expect(await readFile(companion.file, "utf8")).toContain("<<<<<<<");
  return { ...companion, before, conflict };
}

it("re-locks an unchanged opening with standing conflict markers", async () => {
  const h = await fixture();
  const { path, file, reference, before } = await projectedConflict(h);
  const bytes = await readFile(file);
  await openArchivedProjectionFile(h, path);
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path }] } }, errors: "" });
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
  expect(await readFile(file)).toEqual(bytes);
  expect(success(await h.store.read({ reference }))).toEqual(before);
});

it.each([false, true])("keeps a text companion opened after a save that changed only its line endings (observed first=%s)", async observed => {
  const h = await fixture(), content = "First line.\nSecond line.\n";
  const { path, file, reference, base } = await projectedCompanion(h, "endings.txt", content);
  await openArchivedProjectionFile(h, path);
  await writeFile(file, content.replaceAll("\n", "\r\n"));
  await utimes(file, new Date(0), new Date(0));
  // An earlier command reads the file as holding no edit and records its stat, which must not stand for its bytes.
  if (observed) { expect(await startProjection(h)).toMatchObject({ kind: "ready" }); await endProjection(h); }
  const saved = await save(h);
  expect(saved.result).toMatchObject({ status: "ok" });
  expect(saved.result).not.toHaveProperty("result.relocked");
  expect(pathLines(saved.errors, path)).toEqual([expect.stringContaining("only in line endings, which are not stored")]);
  expect(saved.errors).toContain("Restore the file's line endings, then retry arc save.");
  expect(success(await h.store.read({ reference }))).toEqual(base);
  expect(await diskEntry(h, path)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  expect(await readFile(file, "utf8")).toBe(content.replaceAll("\n", "\r\n"));
  await writeFile(file, content);
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path }] } }, errors: "" });
  expect(success(await h.store.read({ reference }))).toEqual(base);
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
});

it.each([false, true])("applies changed edit rights only when the opening contains an edit (edited=%s)", async edited => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  const content = edited ? await edit(h) : null;
  const identity = (name: string) => createProjectionEnginePorts(h.checkout).exec("git", ["config", "arc.identity", name], { cwd: h.checkout });
  await identity("beth");
  const saved = await save(h);
  if (content === null) {
    expect(saved.result).toMatchObject({ status: "ok", result: { relocked: [{ path: h.path }] } });
    expect(await diskEntry(h)).not.toHaveProperty("opened");
    expect((await lstat(file)).mode & 0o222).toBe(0);
    return;
  }
  expect(projectionProcessState().diagnostics).toContainEqual(expect.objectContaining({ path: h.path, copy: null,
    mark: expect.objectContaining({ reason: expect.stringContaining("andrew") }) }));
  expect(pathLines(saved.errors, h.path)).toHaveLength(1);
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  await identity("andrew");
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path: h.path }] } }, errors: "" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
});

it.each([true, false])("names the files a refused save re-locked (json=%s)", async json => {
  const h = await fixture();
  await openArchivedProjectionFile(h, h.path);
  const fault = createRefusingStore(h.store);
  binding.hooks = { beforeSaveMarkClear: async () => {
    fault.refuse("version", { code: "lock-held", class: "recoverable", lock: "archive", condition: "Archive writer held.",
      remedy: { text: "Release the writer and retry arc save." } });
  } };
  const saved = await save({ ...h, store: fault.store }, [], json);
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
  if (json) expect(saved.result).toMatchObject({ status: "refused", relocked: [{ path: h.path,
    remedy: { text: expect.stringContaining(`arc edit ${h.path} from ${await realpath(h.checkout)}`) } }] });
  else {
    expect(saved.output).toContain("Release the writer");
    expect(saved.output).toContain(`Re-locked ${h.path}.`);
  }
});

async function openFromRemedy(h: Awaited<ReturnType<typeof fixture>>, text: string, expectedPath: string) {
  const [, operand, checkout] = /Run arc edit (\S+) from (\S+) /u.exec(text) ?? [];
  if (operand === undefined || checkout === undefined) throw new Error(`No arc edit operand and checkout in ${text}`);
  const previous = process.cwd();
  try {
    process.chdir(checkout);
    await startProjection(h);
    expect(await projectionEditResult(h.store, h.checkout, operand)).toMatchObject({ status: "ok", result: { path: expectedPath } });
    await endProjection(h);
  } finally { process.chdir(previous); }
}

it("reopens a re-locked file from the checkout its save remedy names after a save in a subdirectory", async () => {
  const h = await fixture(), cwd = join(h.checkout, ".arc");
  await openArchivedProjectionFile(h, h.path);
  const { result } = await save({ ...h, cwd });
  if (result?.status !== "ok" || result.result.relocked?.[0] === undefined) throw new Error("No re-locked file");
  await openFromRemedy(h, result.result.relocked[0].remedy.text, h.path);
  expect(await diskEntry(h)).toHaveProperty("opened", true);
});

it("opens a marked archive file from the checkout its resolution remedy names after a save in a subdirectory", async () => {
  const h = await fixture(), cwd = join(h.checkout, ".arc");
  const { path, conflict } = await projectedConflict(h);
  const { result } = await save({ ...h, cwd }, ["--resolve", formatConflictToken(conflict)]);
  if (result?.status !== "refused") throw new Error("Save did not report standing markers");
  expect(result.refusal.condition).toContain("still has markers");
  await openFromRemedy(h, result.refusal.remedy.text, path);
  expect(await diskEntry(h, path)).toHaveProperty("opened", true);
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
  expect(parseStampedFile(await readFile(file, "utf8"))?.content).toBe(content);
  expect(accepted.content).toBe(content);
  if (point === "after lay") {
    expect(accepted.version).toBe(original.version);
    expect(interrupted).toHaveProperty("persisted", null);
  } else {
    expect(accepted.version).not.toBe(original.version);
    expect(interrupted).toMatchObject({ persisted: { takenIn: { version: accepted.version } } });
  }
  expect((await lstat(file)).mode & 0o200).toBe(point === "before swap" ? 0o200 : 0);
  binding.hooks = undefined;
  await startProjection(h); await endProjection(h);
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(accepted.version);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
  expect(parseStampedFile(await readFile(file, "utf8"))?.content).toBe(content);
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content, version: accepted.version });
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

it("retains an opening and retry remedy for a deferred take-in", async () => {
  const h = await fixture(), file = join(h.checkout, h.path);
  await openArchivedProjectionFile(h, h.path);
  await startProjection(h);
  const state = projectionProcessState();
  const root = state.command === null ? undefined : state.roots.get(state.command.checkout);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (root === undefined || disk.kind !== "index") throw new Error("No opened archive projection");
  const entry = disk.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing opened archive record");
  // The file is left as laid, so the deferred answer alone holds the opening.
  const observation = { path: h.path, result: { answer: "deferred", entry }, installation: "attempted" } as const;
  const held = await withProjectionLock(root.location, async session => {
    const saveRoot = { ...root, checkpoint: session.step, context: { ...root.context, checkpoint: session.step, verb: "save" as const } };
    return await relockOpenedProjectionFiles(saveRoot, disk.index, new Map([[h.path, observation]]),
      async () => { throw new Error("A deferred edit was sent again"); });
  });
  expect(held).toMatchObject({ status: "done" });
  expect(state.diagnostics).toContainEqual(expect.objectContaining({ path: h.path,
    mark: expect.objectContaining({ remedy: { text: expect.stringContaining("let saving finish, and retry arc save") } }) }));
  expect(await diskEntry(h)).toMatchObject({ opened: true });
  expect((await lstat(file)).mode & 0o200).toBe(0o200);
  await endProjection(h);

  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path: h.path }] } } });
  expect(await diskEntry(h)).not.toHaveProperty("opened");
  expect((await lstat(file)).mode & 0o222).toBe(0);
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
  directories.push(h.f.root);
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
  expect(saved.errors).toMatch(new RegExp(`arc edit \\S*returned\\.txt from \\S+ to open it again`, "u"));
  expect(await diskEntry(h, path)).toBeUndefined();
  await writeFile(file, "Returning prose.\n");
  await openArchivedProjectionFile(h, path);
  expect(await save(h)).toMatchObject({ result: { status: "ok" }, errors: "" });
  expect(success(await h.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "returned.txt") })).content).toBe("Returning prose.\n");
  expect(await diskEntry(h, path)).not.toHaveProperty("opened");
});

it("names the rights refusal that stops an accepted edit's read-back and finishes once the rights return", async () => {
  const h = await fixture(), file = join(h.checkout, h.path), exec = createProjectionEnginePorts(h.checkout).exec;
  await openArchivedProjectionFile(h, h.path);
  const content = await edit(h, "Accepted before the rights changed.");
  const ignore = join(await resolveGitCommonDir(exec, h.checkout), "info/exclude"), rules = await readFile(ignore, "utf8");
  await writeFile(ignore, rules.replace(".arc/completed/\n", ""));
  await save(h);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  await writeFile(ignore, rules);
  const identity = (name: string) => exec("git", ["config", "arc.identity", name], { cwd: h.checkout });
  await identity("beth");
  expect((await save(h)).errors).toContain("andrew");
  expect(await diskEntry(h)).toHaveProperty("opened", true);
  await identity("andrew");
  expect(await save(h)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path: h.path }] } }, errors: "" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect((await lstat(file)).mode & 0o222).toBe(0);
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
