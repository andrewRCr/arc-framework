/** Store-driven refresh over actual reference state and projected files. */
import { readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update, fixtureRenameProvenance } from "../../../helpers/store/suite-tools.js";
import { RecordReferenceSchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { commitProjectionIndex, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

const observation = vi.hoisted(() => ({ file: "", index: "", reference: "", events: [] as string[],
  firstHeader: null as (() => Promise<void>) | null }));
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual,
    lstatSync: (...args: Parameters<typeof actual.lstatSync>) => {
      const result = actual.lstatSync(...args);
      if (args[0] === observation.file) observation.events.push("file-stat");
      return result;
    },
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      const result = actual.readFileSync(...args);
      if (observation.index !== "" && typeof args[0] === "string" && args[0].startsWith(`${observation.index}-`)) observation.events.push("partition-read");
      return result;
    },
  };
});
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      if (args[0] === observation.file) observation.events.push("file-read");
      const result = await actual.readFile(...args);
      if (args[0] === observation.index) observation.events.push("header-read");
      return result;
    },
    lstat: (...args: Parameters<typeof actual.lstat>) => {
      if (args[0] === observation.file) observation.events.push("file-stat");
      return actual.lstat(...args);
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (args[1] === observation.index) observation.events.push("index");
      await actual.rename(...args);
      if (args[1] === observation.index && observation.firstHeader !== null) {
        const first = observation.firstHeader;
        observation.firstHeader = null;
        await first();
      }
    },
    writeFile: (...args: Parameters<typeof actual.writeFile>) => {
      if (args[0] === observation.reference) observation.events.push("reference");
      return actual.writeFile(...args);
    },
  };
});

const directories: string[] = [];
afterEach(async () => { observation.file = ""; observation.index = ""; observation.reference = ""; observation.events = [];
  observation.firstHeader = null; await removeGitBackedDirs(directories.splice(0)); });

async function fixture() {
  const target = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(target.f.root);
  const notes = await seed(target.f, recordReferences["work-item/notes"](target.primary.reference.owner), "Opening.\nStored note.\nClosing.\n");
  await rm(join(target.projected.location.stateDir, "index"));
  expect(await startProjection({ checkout: target.f.root, store: target.f.store })).toMatchObject({ kind: "ready" });
  await endProjection({ checkout: target.f.root, store: target.f.store });
  return { ...target, notes, path: ".arc/active/current/notes-alpha.md", metaPath: ".arc/active/current/meta-alpha.md" };
}

it("refreshes one changed record while leaving its unchanged neighbor untouched", async () => {
  const h = await fixture();
  const metaBefore = await stat(join(h.f.root, h.metaPath), { bigint: true });
  const changed = "Opening.\nNew stored note.\nClosing.\n";
  success(await h.f.store.write(update(h.f, h.notes, changed)));
  const version = success(await h.f.store.version());
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(changed);
  const metaAfter = await stat(join(h.f.root, h.metaPath), { bigint: true });
  expect({ ino: metaAfter.ino, mtimeNs: metaAfter.mtimeNs }).toEqual({ ino: metaBefore.ino, mtimeNs: metaBefore.mtimeNs });
  const index = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(index).toMatchObject({ kind: "index", index: { state: version, entries: { [h.path]: { pending: false } } } });
});


it("refreshes an index without a saved anchor through a full inventory rather than an invalid changes request", async () => {
  const h = await fixture();
  const read = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (read.kind !== "index") throw new Error("Missing index");
  await withProjectionLock(h.projected.location, session => commitProjectionIndex({ location: h.projected.location, checkout: h.f.root,
    index: { ...read.index, state: null }, checkpoint: session.step }));
  const changed = "Opening.\nRefreshed without an anchor.\nClosing.\n";
  success(await h.f.store.write(update(h.f, h.notes, changed)));
  const source = overrideEngineStore(h.f.store, { changes: () => { throw new Error("No lower anchor exists"); } });
  expect(await startProjection({ checkout: h.f.root, store: source })).toMatchObject({ kind: "ready" });
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(changed);
  expect(await readProjectionIndex(h.projected.location, true)).toMatchObject({ kind: "index", index: { state: success(await h.f.store.version()) } });
});


it("publishes the index and reference once after a no-change start finishes its file checks", async () => {
  const h = await fixture();
  observation.file = join(h.f.root, h.path);
  observation.index = join(h.projected.location.stateDir, "index");
  observation.reference = join(h.f.root, ".arc/system/.local/projection/reference");
  observation.events = [];
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  expect(observation.events.filter(event => event === "index" || event === "reference")).toEqual(["index", "reference"]);
  expect(observation.events.lastIndexOf("file-stat")).toBeLessThan(observation.events.indexOf("index"));
  expect(observation.events).toContain("file-stat");
});

it("reads its header, walked partition, and file stats while the issued store read remains held", async () => {
  const h = await fixture();
  observation.file = join(h.f.root, h.path);
  observation.index = join(h.projected.location.stateDir, "index");
  observation.events = [];
  let release = (): void => undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  const store = overrideEngineStore(h.f.store, { version: async () => {
    observation.events.push("state-started");
    await held;
    return h.f.store.version();
  } });
  const start = startProjection({ store, checkout: h.f.root });
  try {
    await vi.waitFor(() => expect(observation.events).toEqual(expect.arrayContaining(["state-started", "header-read", "partition-read", "file-stat"])));
    expect(observation.events.indexOf("state-started")).toBeLessThan(observation.events.indexOf("header-read"));
    expect(observation.events).not.toContain("index");
  } finally { release(); await start; }
  expect(await start).toMatchObject({ kind: "ready" });
});

it.each(["withheld", "link"])("discards early stats after a %s recovery publishes a new reference", async recovery => {
  const h = await fixture(), file = join(h.f.root, h.path), meta = join(h.f.root, h.metaPath);
  const old = new Date(Date.now() - 5_000);
  await utimes(file, old, old);
  const input = { store: h.f.store, checkout: h.f.root };
  await startProjection(input); await endProjection(input);
  if (recovery === "withheld") {
    const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
    const entry = disk.kind === "index" ? disk.index.entries[h.metaPath] : undefined;
    if (disk.kind !== "index" || entry?.kind !== "record") throw new Error("Missing current metadata");
    await withProjectionLock(h.projected.location, session => commitProjectionIndex({ location: h.projected.location, checkout: h.f.root,
      index: withProjectionEntry(disk.index, h.metaPath, { ...entry, withheld: true }), checkpoint: session.step }));
  }
  await rm(meta);
  const target = join(h.f.root, "external-meta.md");
  if (recovery === "link") { await writeFile(target, "External metadata stays untouched.\n"); await symlink(target, meta, "file"); }
  const bytes = await readFile(file, "utf8");
  observation.file = file;
  observation.index = join(h.projected.location.stateDir, "index");
  observation.events = [];
  let edited = false;
  observation.firstHeader = async () => {
    await writeFile(file, bytes.replace("Stored note.", "Late edit after observation."));
    edited = true;
    observation.events.push("late-edit");
  };
  const store = overrideEngineStore(h.f.store, { list: request => {
    if (edited) observation.events.push("record-list");
    return h.f.store.list(request);
  } });
  expect(await startProjection({ ...input, store })).toMatchObject({ kind: "ready" });
  expect(edited).toBe(true);
  const afterEdit = observation.events.slice(observation.events.indexOf("late-edit") + 1);
  expect(afterEdit.indexOf("file-stat")).toBeGreaterThanOrEqual(0);
  if (recovery === "withheld") {
    expect(afterEdit.indexOf("record-list")).toBeGreaterThanOrEqual(0);
    expect(afterEdit.indexOf("file-stat")).toBeLessThan(afterEdit.indexOf("record-list"));
  }
  expect(success(await h.f.store.read({ reference: h.notes.reference })).content).toContain("Late edit after observation.");
  if (recovery === "link") expect(await readFile(target, "utf8")).toBe("External metadata stays untouched.\n");
});

it("publishes a clean smudged file's observed stat once and avoids hashing it on the next no-change start", async () => {
  const h = await fixture();
  const file = join(h.f.root, h.path), past = new Date(Date.now() - 5_000);
  await utimes(file, past, past);
  const disk = await readProjectionIndex(h.projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing index");
  const entry = disk.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing notes entry");
  await withProjectionLock(h.projected.location, session => commitProjectionIndex({ location: h.projected.location, checkout: h.f.root,
    index: withProjectionEntry(disk.index, h.path, { ...entry, stat: null }), checkpoint: session.step }));
  observation.file = file;
  observation.events = [];
  const command = { checkout: h.f.root, store: h.f.store };
  await startProjection(command);
  expect(observation.events.filter(event => event === "file-read")).toHaveLength(1);
  const recorded = await readProjectionIndex(h.projected.location, true);
  expect(recorded.kind === "index" && recorded.index.entries[h.path]?.stat).not.toBeNull();
  observation.events = [];
  await startProjection(command);
  expect(observation.events).toContain("file-stat");
  expect(observation.events).not.toContain("file-read");
});

it("includes the start's observed stats and ignore record in the first refresh publication", async () => {
  const h = await fixture();
  const file = join(h.f.root, h.path), past = new Date(Date.now() - 5_000);
  await utimes(file, past, past);
  const expected = await stat(file, { bigint: true });
  const disk = await readProjectionIndex(h.projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing index");
  const entry = disk.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing notes entry");
  await withProjectionLock(h.projected.location, session => commitProjectionIndex({ location: h.projected.location, checkout: h.f.root,
    index: { ...withProjectionEntry(disk.index, h.path, { ...entry, stat: null }), ignoreFiles: null, ignoreGuard: null }, checkpoint: session.step }));
  await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "assessment"), "A fresh assessment.\n");
  observation.index = join(h.projected.location.stateDir, "index");
  let observed = false;
  observation.firstHeader = async () => {
    const first = await readProjectionIndex(h.projected.location, true);
    if (first.kind !== "index") throw new Error("Missing first refresh publication");
    expect(first.index.entries[h.path]?.stat).toMatchObject({ ino: expected.ino, mtimeNs: expected.mtimeNs, size: expected.size });
    expect(first.index.ignoreFiles?.length).toBeGreaterThan(0);
    expect(first.index.ignoreGuard).not.toBeNull();
    observed = true;
  };
  await startProjection({ checkout: h.f.root, store: h.f.store });
  expect(observed).toBe(true);
});


it("keeps a pending file's newer write-back when refresh follows the start's captured state", async () => {
  const h = await fixture();
  const read = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (read.kind !== "index") throw new Error("Missing index");
  const entry = read.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing notes entry");
  await withProjectionLock(h.projected.location, session => commitProjectionIndex({ location: h.projected.location, checkout: h.f.root,
    index: withProjectionEntry(read.index, h.path, { ...entry, pending: true }), checkpoint: session.step }));
  const authored = "Opening.\nNew authored note.\nClosing.\n";
  await writeFile(join(h.f.root, h.path), renderStampedFile({ content: authored, stamp: gitBlobId(h.notes.content, "sha1") }));
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  expect(success(await h.f.store.read({ reference: h.notes.reference })).content).toBe(authored);
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(authored);
});

it("lays a newly added owner record without replacing its existing files", async () => {
  const h = await fixture();
  const before = await stat(join(h.f.root, h.path), { bigint: true });
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "assessment");
  await seed(h.f, reference, "A new assessment.\n");
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  expect(parseStampedFile(await readFile(join(h.f.root, ".arc/active/current/assessment-alpha.md"), "utf8")).content).toBe("A new assessment.\n");
  const after = await stat(join(h.f.root, h.path), { bigint: true });
  expect({ ino: after.ino, mtimeNs: after.mtimeNs }).toEqual({ ino: before.ino, mtimeNs: before.mtimeNs });
});

it("clears a reverted refused edit and performs its pending refresh without sending the clean bytes", async () => {
  const h = await fixture();
  const companion = await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "repair.txt"), "Opening.\nBase.\nClosing.\n");
  const path = ".arc/active/current/repair.txt", command = { checkout: h.f.root, store: h.f.store };
  await startProjection(command);
  await endProjection(command);
  const refused = createRefusingStore(h.f.store);
  refused.refuse("batch", StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/project/work-items",
    condition: "The edit's namespace needs repair.", remedy: { text: "Repair the namespace and retry." } }));
  await writeFile(join(h.f.root, path), "Authored opening.\nBase.\nClosing.\n");
  const updated = "Opening.\nBase.\nNew stored closing.\n";
  success(await h.f.store.write(update(h.f, companion, updated)));
  const version = success(await h.f.store.version());
  await startProjection({ ...command, store: refused.store });
  await endProjection({ ...command, store: refused.store });
  expect(await readProjectionIndex(h.projected.location, true)).toMatchObject({ kind: "index", index: { entries: {
    [path]: { pending: true, refused: { reason: "The edit's namespace needs repair." } },
  } } });
  await writeFile(join(h.f.root, path), companion.content);
  await startProjection(command);
  await endProjection(command);
  expect(await readFile(join(h.f.root, path), "utf8")).toBe(updated);
  expect(await readProjectionIndex(h.projected.location, true)).toMatchObject({ kind: "index", index: { entries: {
    [path]: { pending: false, refused: null },
  } } });
  expect(success(await h.f.store.version())).toBe(version);
});


it("re-lays every renamed owner file and carries its changed mark to the new path", async () => {
  const h = await fixture();
  const anchor = success(await h.f.store.version());
  const edited = "Opening.\nAn edit at the former name.\nClosing.\n";
  await writeFile(join(h.f.root, h.path), renderStampedFile({ content: edited, stamp: gitBlobId(h.notes.content, "sha1") }));
  const renamed = RecordReferenceSchema.parse({ ...h.primary.reference, owner: { ...h.primary.reference.owner, name: "beta" } });
  success(await h.f.store.write({ ...update(h.f, h.primary, h.primary.content.replaceAll("alpha", "beta")), reference: renamed,
    provenance: fixtureRenameProvenance }));
  const current = success(await h.f.store.read({ reference: renamed }));
  expect(success(await h.f.store.read({ reference: renamed, asOf: anchor }))).toMatchObject({ reference: h.primary.reference, placement: { kind: "active" } });
  await writeWorktreeMarker(h.f.root, { spawnedByArc: false, createdFor: boundWorkUnitSubject(current),
    spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  expect(parseStampedFile(await readFile(join(h.f.root, ".arc/active/current/notes-beta.md"), "utf8")).content).toBe(edited);
  expect(parseStampedFile(await readFile(join(h.f.root, ".arc/active/current/meta-beta.md"), "utf8")).content).toContain("beta");
  await expect(readFile(join(h.f.root, h.path))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(h.f.root, h.metaPath))).rejects.toMatchObject({ code: "ENOENT" });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(disk).toMatchObject({ kind: "index", index: { entries: { ".arc/active/current/notes-beta.md": { changed: true, pending: false } } } });
});

it("removes a deleted record's file and drops its settled entry", async () => {
  const h = await fixture();
  success(await h.f.store.write({ action: "remove", reference: h.notes.reference, expected: h.notes.version,
    provenance: { verb: "fixture", lifecycleAction: "remove" } }));
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  await endProjection({ checkout: h.f.root, store: h.f.store });
  await expect(readFile(join(h.f.root, h.path))).rejects.toMatchObject({ code: "ENOENT" });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(disk.kind === "index" && disk.index.entries[h.path]).toBeUndefined();
});
