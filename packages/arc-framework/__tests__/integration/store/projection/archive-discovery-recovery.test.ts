/** Archive discovery retries and link observation after sync restoration. */
import { lstat, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { PROJECTION_INDEX_FILE, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { refreshMaterializationLinks } from "../../../../src/lib/store/projection/materialization-selection.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";

const binding = vi.hoisted(() => ({
  deniedLinkProbe: null as string | null,
  deniedReturnedUnlink: null as string | null,
  copyFault: null as { phase: "stat" | "payload"; paths: readonly string[]; denied: string | null } | null,
}));

function denyCopy(path: unknown, phase: "stat" | "payload"): void {
  const fault = binding.copyFault;
  if (typeof path !== "string" || fault?.phase !== phase || fault.denied !== null || !fault.paths.includes(path)) return;
  fault.denied = path;
  throw Object.assign(new Error("Archive copy observation refused"), { code: "EACCES" });
}

vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  const lstat = (async (...args: Parameters<typeof actual.lstat>) => {
    denyCopy(args[0], "stat");
    if (binding.deniedLinkProbe !== null && args[0] === binding.deniedLinkProbe) {
      binding.deniedLinkProbe = null;
      throw Object.assign(new Error("Archive destination access refused"), { code: "EACCES" });
    }
    return actual.lstat(...args);
  }) as typeof actual.lstat;
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    denyCopy(args[0], "payload");
    return actual.readFile(...args);
  }) as typeof actual.readFile;
  return { ...actual, lstat, readFile, default: { ...actual, lstat, readFile } };
});
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  const rmSync = (...args: Parameters<typeof actual.rmSync>) => {
    if (args[0] === binding.deniedReturnedUnlink) {
      binding.deniedReturnedUnlink = null;
      throw Object.assign(new Error("Returned copy removal refused"), { code: "EACCES" });
    }
    actual.rmSync(...args);
  };
  const lstatSync = ((...args: Parameters<typeof actual.lstatSync>) => {
    denyCopy(args[0], "stat");
    return actual.lstatSync(...args);
  }) as typeof actual.lstatSync;
  const readdirSync = ((...args: Parameters<typeof actual.readdirSync>) => {
    const { copyFault } = binding;
    if (copyFault?.phase === "stat" && typeof args[1] === "object" && args[1]?.withFileTypes
      && copyFault.paths.some(path => dirname(path) === args[0])) {
      throw Object.assign(new Error("Typed copy listing refused"), { code: "EACCES" });
    }
    return actual.readdirSync(...args);
  }) as typeof actual.readdirSync;
  return { ...actual, rmSync, lstatSync, readdirSync };
});
afterEach(() => { binding.deniedLinkProbe = null; binding.deniedReturnedUnlink = null; binding.copyFault = null; });

it.each([["nested", false], ["link", true], ["absent", false]] as const)(
  "finishes owed archive enumeration after a %s boundary (damaged partition=%s)", async (boundary, damaged) => {
  const h = await archiveRetirementFixture(), { location } = await h.disk();
  const scope = `${h.folder}/owed`, folder = join(h.checkout, scope), path = `${scope}/unindexed.md`;
  const saved = join(h.checkout, "owed-outside-archive");
  await mkdir(folder);
  await writeFile(join(h.checkout, path), "An unindexed edit in the owed directory.\n");
  const headerPath = join(location.stateDir, PROJECTION_INDEX_FILE);
  await rm(headerPath);
  let phase: "deny" | "opaque" | "repaired" = "deny";
  const checkListing = (absolute: string) => {
    if (absolute === folder && phase === "deny") throw Object.assign(new Error("Cannot enumerate"), { code: "EACCES" });
    if (absolute === folder && phase === "opaque") throw new Error("Enumerated a foreign archive subtree");
  };
  const input = { ...h.input, ports: () => ({ ...createProjectionEnginePorts(h.checkout), walkFs: {
    readdir: (absolute: string) => {
      checkListing(absolute);
      return readdirSync(absolute, { withFileTypes: true });
    },
    readdirNames: (absolute: string) => { checkListing(absolute); return readdirSync(absolute); },
  } }) };
  expect((await projectionCommand(input, ["status"])).diagnostics).toContain("EACCES");
  expect((await h.disk()).index).toMatchObject({ archiveDiscoveryPending: [scope], state: null });
  await rename(folder, saved);
  if (boundary === "nested") await mkdir(join(folder, ".git"), { recursive: true });
  if (boundary === "link") await symlink(saved, folder, "junction");
  if (damaged) await removeArchivePartition(headerPath, location.stateDir);
  phase = "opaque";
  const retry = await projectionCommand(input, ["status"]);
  expect(retry.result).toMatchObject({ kind: "ready" });
  const pending = (await h.disk()).index;
  if (boundary === "absent") {
    expect(pending.archiveDiscoveryPending).toBeUndefined();
    expect(pending.state).toBe(success(await h.store.version()));
    return;
  }
  expect(pending).toMatchObject({ archiveDiscoveryPending: [scope], state: null });
  expect(pending.entries[path]).toBeUndefined();
  await rm(folder, { recursive: true });
  await rename(saved, folder);
  phase = "repaired";
  expect((await projectionCommand(input, ["status"])).diagnostics).toContain(`${path}: withheld`);
  const after = (await h.disk()).index;
  expect(after.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(after.archiveDiscoveryPending).toBeUndefined();
  expect(after.state).toBe(success(await h.store.version()));
}, 30_000);

it.each(["status", "sync"] as const)("%s honors a proved archive file when its leaf is now a link", async command => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const file = join(h.checkout, h.path), saved = join(h.checkout, "prior-archive-file.md");
  await rename(file, saved);
  await symlink(saved, file, "file");
  await writeProjectionIndex(location, { ...index, archiveDiscoveryPending: [h.path], state: null });
  await projectionCommand(h.input, [command]);
  expect((await h.disk()).index.archiveDiscoveryPending).toBeUndefined();
  expect((await lstat(file)).isSymbolicLink()).toBe(command === "status");
}, 30_000);

it("excludes a new nested checkout before it can contribute rebuild debt", async () => {
  const h = await archiveRetirementFixture(), { location } = await h.disk();
  const foreign = join(h.checkout, h.folder, "foreign"), unreadable = join(foreign, "unreadable");
  await mkdir(join(foreign, ".git"), { recursive: true });
  await mkdir(unreadable);
  await writeFile(join(unreadable, "foreign.md"), "Another checkout's file.\n");
  await rm(join(location.stateDir, PROJECTION_INDEX_FILE));
  const foreignListings: string[] = [];
  const checkListing = (path: string) => {
    if (path === foreign || path === unreadable) foreignListings.push(path);
    if (path === unreadable) throw Object.assign(new Error("Foreign directory unreadable"), { code: "EACCES" });
  };
  await projectionCommand({ ...h.input, ports: () => ({ ...createProjectionEnginePorts(h.checkout), walkFs: {
    readdir: path => { checkListing(path); return readdirSync(path, { withFileTypes: true }); },
    readdirNames: path => { checkListing(path); return readdirSync(path); },
  } }) }, ["status"]);
  const recovered = (await h.disk()).index;
  expect(foreignListings).toEqual([]);
  expect(recovered.archiveDiscoveryPending).toBeUndefined();
  expect(recovered.state).toBe(success(await h.store.version()));
}, 30_000);

it("keeps an owed directory that a planned record has never observed as a file", async () => {
  const h = await archiveRetirementFixture(), { location } = await h.disk();
  const directory = join(h.checkout, h.path), path = `${h.path}/unindexed.md`, saved = join(h.checkout, "saved-owed-directory");
  await rm(directory);
  await mkdir(directory);
  await writeFile(join(h.checkout, path), "An edit in a directory at a planned file location.\n");
  await rm(join(location.stateDir, PROJECTION_INDEX_FILE));
  let deny = true;
  const checkListing = (absolute: string) => {
    if (absolute === directory && deny) throw Object.assign(new Error("Refused listing"), { code: "EACCES" });
  };
  const input = { ...h.input, ports: () => ({ ...createProjectionEnginePorts(h.checkout), walkFs: {
    readdir: (absolute: string) => { checkListing(absolute); return readdirSync(absolute, { withFileTypes: true }); },
    readdirNames: (absolute: string) => { checkListing(absolute); return readdirSync(absolute); },
  } }) };
  await projectionCommand(input, ["status"]);
  expect((await h.disk()).index).toMatchObject({ archiveDiscoveryPending: [h.path], entries: { [h.path]: { kind: "record", stat: null } } });
  await rename(directory, saved);
  await symlink(saved, directory, "junction");
  deny = false;
  await projectionCommand(input, ["sync"]);
  expect((await lstat(directory)).isSymbolicLink()).toBe(true);
  await projectionCommand(input, ["status"]);
  expect((await h.disk()).index).toMatchObject({ archiveDiscoveryPending: [h.path], state: null });
  await rm(directory);
  await rename(saved, directory);
  expect((await projectionCommand(input, ["status"])).diagnostics).toContain(`${path}: withheld`);
  expect((await h.disk()).index.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
}, 30_000);

it("sync leaves the junction above an owed child in place even at a proved file path", async () => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const file = join(h.checkout, h.path), saved = join(h.checkout, "saved-owed-child");
  const child = `${h.path}/unindexed.md`, content = "An edit behind the junction.\n";
  expect(index.entries[h.path]?.stat?.type).toBe("file");
  await rm(file);
  await mkdir(saved);
  await writeFile(join(saved, "unindexed.md"), content);
  await symlink(saved, file, "junction");
  await writeProjectionIndex(location, { ...index, archiveDiscoveryPending: [child], state: null });
  await projectionCommand(h.input, ["sync"]);
  expect((await lstat(file)).isSymbolicLink()).toBe(true);
  expect((await h.disk()).index).toMatchObject({ archiveDiscoveryPending: [child], state: null });
  await rm(file);
  await rename(saved, file);
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain(`${child}: withheld`);
  expect((await h.disk()).index.entries[child]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(await readFile(join(h.checkout, child), "utf8")).toBe(content);
}, 30_000);

async function removeArchivePartition(headerPath: string, stateDir: string): Promise<void> {
  const header = JSON.parse(await readFile(headerPath, "utf8")) as { groups: Record<string, { name: string }> };
  const archive = Object.entries(header.groups).find(([key]) => key.startsWith(".arc/completed/"));
  if (archive === undefined) throw new Error("Missing archive partition");
  await rm(join(stateDir, archive[1].name));
}

it.each([false, true])("transfers a missing returned alias to an owed path (damaged partition=%s)", async damaged => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const folder = `${h.folder}/returned`, path = `${folder}/unindexed.md`;
  const destination = join(h.checkout, path), boundary = join(h.checkout, folder, ".git");
  const content = "An edit returned before its inventory was published.\n";
  await mkdir(boundary, { recursive: true });
  await writeFile(destination, content);
  const writer = await createProjectionEnginePorts(h.checkout).writer();
  const copy = nameAsideFile({ path, base: gitBlobId("Original.\n", "sha1"), writer, role: "aside" });
  await writeProjectionIndex(location, { ...index, archiveRecoveryCopies: [copy], state: null });
  if (damaged) await removeArchivePartition(join(location.stateDir, PROJECTION_INDEX_FILE), location.stateDir);
  await projectionCommand(h.input, ["status"]);
  const held = (await h.disk()).index;
  expect(held.archiveRecoveryCopies).toBeUndefined();
  expect(held.archiveDiscoveryPending).toEqual([path]);
  expect(held.state).toBeNull();
  expect(held.entries[path]).toBeUndefined();
  await rm(boundary, { recursive: true });
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain(`${path}: withheld`);
  expect((await h.disk()).index.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(await readFile(destination, "utf8")).toBe(content);
}, 30_000);

it.each([false, true])("transfers a vanished alias at an unproved leaf junction (damaged partition=%s)", async damaged => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const path = `${h.folder}/returned-at-opaque-leaf.md`, file = join(h.checkout, path), target = join(h.checkout, "returned-opaque-scope");
  const edit = "An unindexed edit beneath the returned scope.\n", child = `${path}/hidden.md`;
  await mkdir(target);
  await writeFile(join(target, "hidden.md"), edit);
  await symlink(target, file, "junction");
  const writer = await createProjectionEnginePorts(h.checkout).writer();
  const copy = nameAsideFile({ path, base: gitBlobId("Original.\n", "sha1"), writer, role: "aside" });
  await writeProjectionIndex(location, { ...index, archiveRecoveryCopies: [copy], state: null });
  if (damaged) await removeArchivePartition(join(location.stateDir, PROJECTION_INDEX_FILE), location.stateDir);
  await projectionCommand(h.input, ["status"]);
  const held = (await h.disk()).index;
  expect(held.archiveRecoveryCopies).toBeUndefined();
  expect(held).toMatchObject({ archiveDiscoveryPending: [path], state: null });
  expect((await lstat(file)).isSymbolicLink()).toBe(true);
  await rm(file);
  await rename(target, file);
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain(`${child}: withheld`);
  expect((await h.disk()).index.entries[child]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(await readFile(join(h.checkout, child), "utf8")).toBe(edit);
}, 30_000);

it.each(["stat", "payload"] as const)("rebuild retains the first archive copy after %s denial and settles its sibling", async phase => {
  const h = await archiveRetirementFixture(), sibling = `${h.folder}/z-unindexed-copy.txt`;
  await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "z-unindexed-copy.txt"), "Accessible text.\n");
  await projectionCommand(h.input, ["status"]);
  const { location, index } = await h.disk();
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-copy-observer" };
  const copies = await Promise.all([h.path, sibling].map(async path => {
    const entry = index.entries[path];
    if (entry?.kind !== "record") throw new Error("Missing projected base");
    const name = nameAsideFile({ path, writer, base: entry.base.blob, role: "aside" });
    const absolute = join(h.checkout, name);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, await readFile(join(h.checkout, path)));
    return { absolute, name };
  }));
  await rm(join(location.stateDir, PROJECTION_INDEX_FILE));
  const fault = { phase, paths: copies.map(copy => copy.absolute), denied: null as string | null };
  binding.copyFault = fault;
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain("EACCES");
  const held = copies.find(copy => copy.absolute === fault.denied);
  if (held === undefined) throw new Error("The sweep did not encounter the denial");
  await expect(lstat(held.absolute)).resolves.toBeDefined();
  for (const copy of copies.filter(each => each !== held)) await expect(lstat(copy.absolute)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.disk()).index).toMatchObject({ archiveRecoveryCopies: [held.name], state: null });
  binding.copyFault = null;
  await projectionCommand(h.input, ["status"]);
  await expect(lstat(held.absolute)).rejects.toMatchObject({ code: "ENOENT" });
  const recovered = (await h.disk()).index;
  expect(recovered.archiveRecoveryCopies).toBeUndefined();
  expect(recovered.state).toBe(success(await h.store.version()));
}, 30_000);

it("keeps a previously withheld copy withheld when typing it fails during rebuild", async () => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const path = `${h.folder}/unindexed-withheld.md`, content = "An edit that stays withheld.\n";
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-withheld-writer" };
  const copy = nameAsideFile({ path, writer, role: "aside", base: gitBlobId("Original.\n", "sha1") });
  const absolute = join(h.checkout, copy), header = join(location.stateDir, PROJECTION_INDEX_FILE);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
  await writeProjectionIndex(location, { ...index, withheldCopies: [copy] });
  await removeArchivePartition(header, location.stateDir);
  binding.copyFault = { phase: "stat", paths: [absolute], denied: null };
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain("EACCES");
  expect(binding.copyFault.denied).toBe(absolute);
  binding.copyFault = null;
  await projectionCommand(h.input, ["status"]);
  expect((await h.disk()).index.withheldCopies).toEqual([copy]);
  expect((await h.disk()).index.archiveRecoveryCopies).toBeUndefined();
  await expect(lstat(join(h.checkout, path))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(absolute, "utf8")).toBe(content);
}, 30_000);

it("keeps a returned unindexed alias and its retry when unlink loses access", async () => {
  const h = await archiveRetirementFixture(), { location } = await h.disk();
  const path = `${h.folder}/returned-with-denial.md`, destination = join(h.checkout, path);
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-return-writer" };
  const copy = nameAsideFile({ path, base: gitBlobId("Original.\n", "sha1"), writer, role: "aside" });
  const absolute = join(h.checkout, copy), edit = "A recovery edit that still needs classification.\n";
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, edit);
  await rm(join(location.stateDir, PROJECTION_INDEX_FILE));
  binding.deniedReturnedUnlink = absolute;
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain("EACCES");
  expect(binding.deniedReturnedUnlink).toBeNull();
  expect((await h.disk()).index).toMatchObject({ archiveRecoveryCopies: [copy], state: null });
  expect(await readFile(absolute, "utf8")).toBe(edit);
  expect(await readFile(destination, "utf8")).toBe(edit);
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain(`${path}: withheld`);
  await expect(lstat(absolute)).rejects.toMatchObject({ code: "ENOENT" });
  const settled = (await h.disk()).index;
  expect(settled.archiveRecoveryCopies).toBeUndefined();
  expect(settled.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
}, 30_000);

it("keeps a walked edit in rebuild discovery after a denied redundant aside is later discarded", async () => {
  const h = await archiveRetirementFixture(), { location } = await h.disk();
  const path = `${h.folder}/present-unindexed.md`, file = join(h.checkout, path);
  const content = "The live unindexed edit.\n", redundant = "An unchanged aside for that destination.\n";
  await writeFile(file, content);
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-redundant-writer" };
  const copy = nameAsideFile({ path, writer, role: "aside", base: gitBlobId(redundant, "sha1") });
  const aside = join(h.checkout, copy);
  await mkdir(dirname(aside), { recursive: true });
  await writeFile(aside, redundant);
  await rm(join(location.stateDir, PROJECTION_INDEX_FILE));
  // Typed listing sees the file. The sweep's own destination probe is the first denied operation.
  binding.deniedLinkProbe = file;
  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain("EACCES");
  const pending = (await h.disk()).index;
  expect(pending.archiveDiscoveryPending).toEqual([path]);
  expect(pending.archiveRecoveryCopies).toEqual([copy]);
  expect(pending.state).toBeNull();
  const next = await projectionCommand(h.input, ["status"]);
  const repaired = (await h.disk()).index;
  expect(next.diagnostics).toContain(`${path}: withheld`);
  expect(repaired.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(repaired.archiveDiscoveryPending).toBeUndefined();
  expect(repaired.archiveRecoveryCopies).toBeUndefined();
  expect(repaired.state).toBe(success(await h.store.version()));
  await expect(lstat(aside)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(file, "utf8")).toBe(content);
});

it("publishes the accessible link recheck when another restored archive leaf loses access", async () => {
  const h = await archiveRetirementFixture();
  const sibling = `${h.folder}/z-restored.md`;
  const companion = recordReferences["work-item/companion"](h.primary.reference.owner, "z-restored.md");
  await seed(h.f, companion, "Another restored file.\n");
  expect(await startProjection(h.input)).toMatchObject({ kind: "ready" });
  const root = projectionProcessState().roots.get(h.checkout);
  if (root === undefined) throw new Error("Missing the sync root");
  const repaired = new Set([h.path, sibling]);
  root.blockedByLink = path => repaired.has(path) ? path : null;
  binding.deniedLinkProbe = join(h.checkout, sibling);
  await refreshMaterializationLinks(root, repaired);
  expect(root.blockedByLink(h.path)).toBeNull();
  expect(root.blockedByLink(sibling)).toBe(sibling);
  expect(root.archiveDiscoveryHolds?.get(sibling)?.reason).toContain("EACCES");
  await endProjection(h.input);
});
