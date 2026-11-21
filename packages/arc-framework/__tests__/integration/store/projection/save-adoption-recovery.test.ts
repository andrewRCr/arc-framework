/** Recover accepted archive Markdown across both installation journal formats. */
import { chmod, lstat, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences, sameReference } from "../../../../src/lib/store/identity.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { createAdoptionFixture, usePredecessorAdoptionJournal } from "../../../helpers/store/projection/adoption-fixture.js";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { success, update } from "../../../helpers/store/suite-tools.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

const binding = vi.hoisted(() => ({
  hooks: undefined as import("../../../../src/lib/store/projection/swap.js").SwapHooks | undefined,
  writerInstance: undefined as string | undefined,
  deniedOnce: null as string | null,
}));

vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, lstatSync: ((...args: Parameters<typeof actual.lstatSync>) => {
    if (binding.deniedOnce !== null && args[0] === binding.deniedOnce) {
      binding.deniedOnce = null;
      throw Object.assign(new Error("Archive leaf refused once"), { code: "EACCES" });
    }
    return actual.lstatSync(...args);
  }) as typeof actual.lstatSync };
});
vi.mock("../../../../src/lib/store/projection/engine-ports.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/projection/engine-ports.js")>();
  return { ...actual, createProjectionEnginePorts: (...args: Parameters<typeof actual.createProjectionEnginePorts>) => {
    const ports = actual.createProjectionEnginePorts(...args), instance = binding.writerInstance;
    return { ...ports, hooks: binding.hooks,
      writer: instance === undefined ? ports.writer : async () => ({ ...await ports.writer(), processInstance: instance }) };
  } };
});

const directories: string[] = [];
afterEach(async () => {
  binding.hooks = undefined;
  binding.writerInstance = undefined;
  binding.deniedOnce = null;
  await removeGitBackedDirs(directories.splice(0));
});

async function fixture() {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  const checkout = h.f.root;
  directories.push(checkout);
  const path = Object.keys(h.projected.index.entries)[0]!;
  return { ...h, path, store: h.f.store, checkout };
}

async function save(input: { store: Store; checkout: string }, args: readonly string[] = []) {
  const previous = process.cwd();
  try {
    process.chdir(input.checkout);
    const { diagnostics, result } = await projectionCommand(input, ["save", ...args]);
    return { result, errors: diagnostics };
  } finally { process.chdir(previous); }
}

async function diskEntry(h: Awaited<ReturnType<typeof fixture>>, path: string) {
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing archive index");
  return disk.index.entries[path];
}

async function openedAdoption(h: Awaited<ReturnType<typeof fixture>>, stamped: boolean, extension = "md") {
  const name = `new.${extension}`, path = `${h.folder}/${name}`, file = join(h.checkout, path);
  const content = "The new archived text.\n";
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, name);
  const bytes = stamped ? renderStampedFile({ content, stamp: gitBlobId("Previous rendering.\n", "sha1") }) : content;
  await writeFile(file, bytes);
  await openArchivedProjectionFile(h, path);
  return { path, file, reference, content, bytes };
}

it.each([
  [false, "predecessor", false], [true, "predecessor", false], [false, "current", false], [true, "current", false],
  [false, "predecessor", true], [true, "predecessor", true], [false, "current", true], [true, "current", true],
] as const)("uses the proved Markdown installation after its writer exits (installed=%s, journal=%s, stamped=%s)", async (installed, journal, stamped) => {
  const h = await fixture(), { path, file, reference, content, bytes: accepted } = await openedAdoption(h, stamped);
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
  if (journal === "predecessor") await usePredecessorAdoptionJournal(h.projected.location, path);
  if (installed) {
    await chmod(file, 0o644);
    await writeFile(file, accepted);
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

async function interruptAdoptionInstallation(journal: "current" | "predecessor", stamped: boolean,
  options: { extension?: "txt"; linked?: true } = {}) {
  const h = options.linked ? await linkedAdoptionFixture() : await fixture();
  const { path, file, reference, content, bytes } = await openedAdoption(h, stamped, options.extension);
  const peer = "A peer's newer archive correction.\n";
  let sends = 0;
  const store = overrideEngineStore(h.store, {
    batch: async input => {
      const result = await h.store.batch(input);
      if (++sends === 1) success(await h.store.write(update(h.f, success(await h.store.read({ reference })), peer)));
      return result;
    },
  });
  const command = { ...h, store };
  binding.hooks = { afterFirstCheck: async observed => { if (observed === path) throw new Error("Stopped after the archive link"); } };
  binding.writerInstance = "renamed-adoption-writer";
  await expect(save(command)).rejects.toThrow("Stopped after the archive link");
  const interrupted = await diskEntry(h, path);
  const interruptedCopy = interrupted?.kind === "record" ? interrupted.persisted?.takenIn : undefined;
  if (interruptedCopy?.kind !== "copy") throw new Error("Missing interrupted base copy");
  expect(await readFile(join(h.projected.location.stateDir, TAKEN_IN_FOLDER, interruptedCopy.name), "utf8")).toBe(content);
  const installed = await lstat(file, { bigint: true });
  expect(parseStampedFile(await readFile(file, "utf8")).content).toBe(peer);
  if (journal === "predecessor") await usePredecessorAdoptionJournal(h.projected.location, path);
  binding.hooks = undefined;
  binding.writerInstance = undefined;
  return { h, command, path, file, reference, content, bytes, installed, interruptedCopy, sends: () => sends };
}

async function replaceMarkdownFromEditor(file: string, bytes: string) {
  const written = `${file}.editor`;
  await writeFile(written, bytes);
  await rename(written, file);
}

it.each([["current", false], ["predecessor", false], ["current", true], ["predecessor", true]] as const)(
  "holds a rename-over archive revert on the %s journal until explicitly resolved (stamped=%s)", async (journal, stamped) => {
  const { h, command, path, file, reference, content, bytes, installed, interruptedCopy, sends } =
    await interruptAdoptionInstallation(journal, stamped);
  await replaceMarkdownFromEditor(file, bytes);
  expect((await lstat(file, { bigint: true })).ino).not.toBe(installed.ino);

  const before = success(await h.store.read({ reference }));
  const held = await save(command);
  expect(held.errors).toContain("The archive installation could not be established");
  const entry = await diskEntry(h, path);
  expect(entry).toMatchObject({ opened: true, pending: true, adoption: { kind: "read-back" },
    base: { version: before.version }, refused: { reason: "bases-disagree" } });
  const token = entry?.refused?.remedy.argv?.at(-1);
  if (token === undefined) throw new Error("Missing explicit resolution token");
  const retained = entry?.kind === "record" ? entry.persisted?.takenIn : undefined;
  if (retained?.kind !== "copy") throw new Error("Missing retained accepted base");
  const retainedFile = join(h.projected.location.stateDir, TAKEN_IN_FOLDER, retained.name);
  expect(retained.name).toBe(interruptedCopy.name);
  expect(await readFile(retainedFile, "utf8")).toBe(content);
  expect((await save(command)).errors).toContain(token);
  const addition = "Another line in the held editor buffer.\n";
  await writeFile(file, bytes + addition);
  expect((await save(command)).errors).toContain(token);
  expect(await readFile(retainedFile, "utf8")).toBe(content);
  expect(await readFile(file, "utf8")).toBe(bytes + addition);
  expect(success(await h.store.read({ reference })).version).toBe(before.version);
  expect(sends()).toBe(1);

  const fault = createRefusingStore(command.store);
  fault.refuse("read", { code: "lock-held", class: "recoverable", lock: "archive", condition: "Temporary archive read refusal.",
    remedy: { text: "Retry after the archive store is available." } });
  let denyLeaf = !stamped;
  const retry = overrideEngineStore(command.store, { read: async input => {
    if (!sameReference(input.reference, reference)) return command.store.read(input);
    if (stamped) return fault.store.read(input);
    if (denyLeaf) { denyLeaf = false; binding.deniedOnce = file; }
    return command.store.read(input);
  } });
  expect((await save({ ...command, store: retry })).errors).toContain(stamped ? "Temporary archive read refusal" : "EACCES");
  expect((await diskEntry(h, path))?.refused?.remedy.argv?.at(-1)).toBe(token);

  const resolved = await save(command, ["--resolve", token]);
  expect(resolved.result, resolved.errors).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference })).content).toBe(content + addition);
  expect(parseStampedFile(await readFile(file, "utf8")).content).toBe(content + addition);
  expect(await diskEntry(h, path)).not.toHaveProperty("adoption");
  expect(sends()).toBe(2);
});

it.each(["current", "predecessor"] as const)("keeps the %s Markdown adoption safe across a leaf link", async journal => {
  const { h, command, path, file, bytes, installed, sends } = await interruptAdoptionInstallation(journal, false);
  await rm(file);
  await symlink(join(h.checkout, h.path), file);
  await persistProjectionRemoval(h.checkout, { store: command.store, identity: SlugSchema.parse("andrew") });
  expect(await diskEntry(h, path)).toMatchObject({ stat: { ino: installed.ino }, adoption: { kind: "read-back" } });
  // An index last reconciled by an earlier version can already have lost the staged stat.
  if (journal === "predecessor") {
    const { location } = h.projected;
    const disk = await readProjectionIndex(location, true, { groups: "all" });
    if (disk.kind !== "index" || disk.index.entries[path]?.kind !== "record") throw new Error("Missing interrupted adoption");
    await writeProjectionIndex(location, withProjectionEntry(disk.index, path, { ...disk.index.entries[path], stat: null }));
  }
  await replaceMarkdownFromEditor(file, bytes);
  expect((await save(command)).errors).toContain("The archive installation could not be established");
  expect(await readFile(file, "utf8")).toBe(bytes);
  expect(sends()).toBe(1);
});

it.each(["current", "predecessor"] as const)("completes %s read-back when a peer restores the accepted text", async journal => {
  const { h, command, path, file, reference, content, bytes, sends } = await interruptAdoptionInstallation(journal, true);
  await replaceMarkdownFromEditor(file, bytes);
  success(await h.store.write(update(h.f, success(await h.store.read({ reference })), content)));
  const current = success(await h.store.read({ reference }));
  expect(await save(command)).toMatchObject({ result: { status: "ok", result: { relocked: [{ path }] } }, errors: "" });
  expect(success(await h.store.read({ reference })).version).toBe(current.version);
  expect(parseStampedFile(await readFile(file, "utf8")).content).toBe(content);
  expect(await diskEntry(h, path)).not.toHaveProperty("adoption");
  expect(sends()).toBe(1);
});

it.each(["current", "predecessor"] as const)("uses the installed %s text evidence after a temporary leaf link", async journal => {
  const { h, command, path, file, content, installed, sends } = await interruptAdoptionInstallation(journal, false, { extension: "txt" });
  const moved = join(h.checkout, "editor-retained.txt");
  await rename(file, moved);
  await symlink(join(h.checkout, h.path), file);
  await persistProjectionRemoval(h.checkout, { store: command.store, identity: SlugSchema.parse("andrew") });
  expect(await diskEntry(h, path)).toMatchObject({ stat: { ino: installed.ino }, adoption: { kind: "read-back" } });
  await rm(file);
  await rename(moved, file);
  await chmod(file, 0o644);
  await writeFile(file, content);
  expect((await save(command)).errors).toContain("ambiguous-base");
  expect(await readFile(file, "utf8")).toBe(content);
  expect(sends()).toBe(1);
});

async function linkedAdoptionFixture() {
  const h = await archiveRetirementFixture();
  return { ...h, projected: { ...h.projected, ...await h.disk() } };
}

async function peerWrite(h: Awaited<ReturnType<typeof fixture>>, reference: Parameters<Store["read"]>[0]["reference"],
  content: string, refuseRead = false): Promise<void> {
  beginProjectionCommand();
  const peer = h.f.store;
  const unavailable = createRefusingStore(peer);
  unavailable.refuse("read", { code: "lock-held", class: "recoverable", lock: "archive", condition: "Transient peer read.",
    remedy: { text: "Retry the peer read." } });
  let fault = false;
  let deniedReads = 0;
  const source = overrideEngineStore(peer, { read: query => {
    if (!fault || !sameReference(query.reference, reference)) return peer.read(query);
    deniedReads += 1;
    return unavailable.store.read(query);
  } });
  const checkout = h.f.root, store = withFanOut(source, createProjectionFanOutDependencies(checkout));
  const visits: string[] = [];
  const input = { checkout, store, ports: () => ({ ...createProjectionEnginePorts(checkout),
    beforeFanOutTarget: async (path: string) => { visits.push(path); },
  }) };
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  try {
    const current = success(await peer.read({ reference }));
    fault = refuseRead;
    success(await store.write(update(h.f, current, content)));
    expect(visits).toContain(h.checkout);
    if (refuseRead) expect(deniedReads).toBeGreaterThan(0);
  } finally {
    fault = false;
    await endProjection(input);
  }
}

it.each([["current", false], ["predecessor", true]] as const)(
  "keeps a %s adoption token and buffer during peer refresh (refusal=%s)", async (journal, refuseRead) => {
  const { h, command, path, file, reference, bytes, sends } = await interruptAdoptionInstallation(journal, true, { linked: true });
  const staged = await readFile(file, "utf8");
  await replaceMarkdownFromEditor(file, bytes);
  expect((await save(command)).errors).toContain("The archive installation could not be established");
  const held = await diskEntry(h, path);
  const token = held?.refused?.remedy.argv?.at(-1);
  if (token === undefined || held?.kind !== "record") throw new Error("Missing the adopted hold");
  // The old rendering can hash clean against the staged entry even though the held buffer remains the editor's.
  await writeFile(file, staged);
  await peerWrite(h, reference, "Another peer correction.\n", refuseRead);
  expect(await readFile(file, "utf8")).toBe(staged);
  expect(await diskEntry(h, path)).toMatchObject({ base: held.base, persisted: held.persisted, refused: held.refused });
  expect((await save(command)).errors).toContain(token);
  expect(sends()).toBe(1);
  expect((await save(command, ["--resolve", token])).result).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference })).content).toBe(parseStampedFile(staged).content);
  expect(sends()).toBe(2);
});

it.each(["current", "predecessor"] as const)("uses current stored agreement in a peer visit of the %s journal", async journal => {
  const { h, path, file, reference, content, bytes, sends } = await interruptAdoptionInstallation(journal, true, { linked: true });
  await replaceMarkdownFromEditor(file, bytes);
  await peerWrite(h, reference, content);
  expect(parseStampedFile(await readFile(file, "utf8")).content).toBe(content);
  expect((await diskEntry(h, path))?.refused).toBeNull();
  expect(sends()).toBe(1);
});
