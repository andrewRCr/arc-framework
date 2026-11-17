/** The header commits content-addressed root partitions independently of unloaded roots. */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema } from "../../../../src/lib/store/identity.js";
import { commitProjectionIndex, readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { loadedProjectionGroups, loadProjectionGroups, ProjectionPartitionMismatch, replaceLoadedProjectionEntries, withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import { ProjectionIndexHeaderSchema, ProjectionIndexPartitionSchema } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";

let checkout: string;
let location: ProjectionLocation;
beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "arc-projection-partitions-"));
  const gitDir = join(checkout, ".git");
  location = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
  await mkdir(location.stateDir, { recursive: true });
});
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

const held = { kind: "ownerless" as const, stat: { type: "file" as const, size: 0n, ino: 18_446_744_073_709_551_615n, mtimeNs: 1_761_234_567_890_123_456n },
  refused: { reason: "unadoptable", remedy: { text: "Repair ownership." } } };
function index(): ProjectionIndex {
  return { format: 2, state: null, projectedUnder: { identity: SlugSchema.parse("andrew"), claim: null,
    layoutActive: "nested", view: { mode: "mine", pins: [] } }, withheldCopies: [], tripwires: {},
  ignoreFiles: null, ignoreGuard: null, entries: {
    ".arc/active/current/a.md": held,
    ".arc/completed/2026-q4/a.md": held,
    ".arc/user/andrew/USER-INBOX.md": held,
    ".arc/user/beth/USER-INBOX.md": held,
  } };
}

it("writes a header without entries and independently named root partitions", async () => {
  await writeProjectionIndex(location, index());
  const header = JSON.parse(await readFile(join(location.stateDir, "index"), "utf8")) as {
    entries?: unknown; groups: Record<string, { name: string; unsettled: boolean }>;
  };
  expect(header.entries).toBeUndefined();
  expect(ProjectionIndexHeaderSchema.safeParse(header).success).toBe(true);
  expect(Object.keys(header.groups).sort()).toEqual([".arc/active", ".arc/completed/2026-q4", ".arc/user/andrew", ".arc/user/beth"]);
  for (const [group, descriptor] of Object.entries(header.groups)) {
    expect(descriptor.unsettled).toBe(true);
    const bytes = await readFile(join(location.stateDir, descriptor.name), "utf8");
    expect(descriptor.name).toBe(`index-${gitBlobId(bytes, "sha1")}`);
    expect(Object.keys(JSON.parse(bytes))).toHaveLength(1);
    expect(ProjectionIndexPartitionSchema.safeParse(JSON.parse(bytes)).success).toBe(true);
    expect(Object.keys(JSON.parse(bytes))[0]).toContain(`${group}/`);
  }
  expect((await readdir(location.stateDir)).filter(name => name.startsWith("index-"))).toHaveLength(4);
});

async function disk(): Promise<ProjectionIndex> {
  const read = await readProjectionIndex(location, true);
  if (read.kind !== "index") throw new Error(`Index unavailable: ${JSON.stringify(read)}`);
  return read.index;
}
async function header() {
  return JSON.parse(await readFile(join(location.stateDir, "index"), "utf8")) as { groups: Record<string, { name: string; unsettled: boolean }> };
}

it("retains unread partitions when publishing one changed root", async () => {
  await writeProjectionIndex(location, index());
  const before = await header();
  const source = await disk();
  expect(Object.keys(source.entries)).toEqual([]);
  const changed = withProjectionEntry(source, ".arc/active/current/a.md", { ...held, refused: { reason: "pending", remedy: held.refused.remedy } });
  const archive = before.groups[".arc/completed/2026-q4"]!;
  await writeFile(join(location.stateDir, archive.name), "corrupted but unvisited");
  await commitProjectionIndex({ location, checkout, index: changed });
  const after = await header();
  expect(after.groups[".arc/active"]?.name).not.toBe(before.groups[".arc/active"]?.name);
  expect(after.groups[".arc/completed/2026-q4"]).toEqual(archive);
  expect(await readFile(join(location.stateDir, archive.name), "utf8")).toBe("corrupted but unvisited");
});

it("keeps derived indexes' loaded groups and entries independent", async () => {
  await writeProjectionIndex(location, index());
  const source = await disk();
  const branch = withProjectionEntry(source, ".arc/active/current/a.md", { ...held, stat: null });
  expect(Object.keys(source.entries)).toEqual([]);
  expect(branch.entries[".arc/user/beth/USER-INBOX.md"]).toEqual(held);
  expect(Object.keys(source.entries)).toEqual([]);
  expect(source.entries[".arc/active/current/a.md"]).toEqual(held);
  expect(Object.keys(source.entries)).toEqual([".arc/active/current/a.md"]);
  expect(branch.entries[".arc/active/current/a.md"]?.stat).toBeNull();
  expect(Object.hasOwn(branch.entries, ".arc/user/andrew/USER-INBOX.md")).toBe(true);
  expect(".arc/active/current/a.md" in branch.entries).toBe(true);
});

it("does not rewrite value-equal entries even when object property order differs", async () => {
  await writeProjectionIndex(location, index());
  const before = await header();
  const source = await disk();
  const path = join(location.stateDir, before.groups[".arc/active"]!.name);
  const beforeStat = await stat(path, { bigint: true });
  const changed = withProjectionEntry(source, ".arc/active/current/a.md", { refused: held.refused, stat: held.stat, kind: held.kind });
  await commitProjectionIndex({ location, checkout, index: changed });
  expect((await header()).groups[".arc/active"]).toEqual(before.groups[".arc/active"]);
  expect((await stat(path, { bigint: true })).mtimeNs).toBe(beforeStat.mtimeNs);
});

it("drops the last entry's group and collects only partitions no longer named", async () => {
  await writeProjectionIndex(location, index());
  const before = await header();
  const source = await disk();
  await commitProjectionIndex({ location, checkout, index: withProjectionEntry(source, ".arc/active/current/a.md", undefined) });
  expect((await header()).groups[".arc/active"]).toBeUndefined();
  expect(await readdir(location.stateDir)).not.toContain(before.groups[".arc/active"]!.name);
  expect((await header()).groups[".arc/user/beth"]).toEqual(before.groups[".arc/user/beth"]);
});

it("throws a named mismatch on late access and reads a missing partition as unreadable", async () => {
  await writeProjectionIndex(location, index());
  const source = await disk(), name = (await header()).groups[".arc/active"]!.name;
  await writeFile(join(location.stateDir, name), JSON.stringify({ ".arc/active/current/a.md": { ...held, stat: null } }));
  expect(() => source.entries[".arc/active/current/a.md"]).toThrow(ProjectionPartitionMismatch);
  expect(() => loadProjectionGroups(source, [".arc/active"])).toThrow(name);
  expect(await readProjectionIndex(location, true, { groups: [".arc/active"] })).toEqual({ kind: "unusable", cause: "unreadable", header: await header() });
  await rm(join(location.stateDir, name));
  expect(await readProjectionIndex(location, true)).toEqual({ kind: "unusable", cause: "unreadable", header: await header() });
});

it("treats inherited property names as absent paths without reading a fabricated partition", async () => {
  await writeProjectionIndex(location, index());
  const read = await disk();
  for (const path of ["constructor", "toString", "__proto__"]) {
    expect(read.entries[path]).toBeUndefined();
    expect(path in read.entries).toBe(false);
    expect(Object.getOwnPropertyDescriptor(read.entries, path)).toBeUndefined();
  }
});

it("reads back every group its writer forms, including dot folders and unslugged user folders", async () => {
  const written: ProjectionIndex = { ...index(), entries: {
    ".arc/completed/.hidden/a.md": held, ".arc/user/Blair/notes.md": held, ".arc/user/andrew/USER-INBOX.md": held } };
  await writeProjectionIndex(location, written);
  const disk = await readProjectionIndex(location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error(`The written index read back as ${disk.cause}`);
  expect(Object.keys(disk.index.entries).sort()).toEqual(Object.keys(written.entries).sort());
});

it.each([".arc/active/current", ".arc/completed/..", ".arc/user/.", ".arc/system"])("refuses a header naming the group %s", async group => {
  await writeProjectionIndex(location, index());
  const path = join(location.stateDir, "index");
  const header = JSON.parse(await readFile(path, "utf8")) as { groups: Record<string, unknown> };
  header.groups[group] = header.groups[".arc/active"];
  await writeFile(path, JSON.stringify(header));
  expect(await readProjectionIndex(location, true, { groups: "all" })).toMatchObject({ kind: "unusable" });
});

it("refuses to replace a path in a root partition the pass did not enumerate", async () => {
  await writeProjectionIndex(location, index());
  const source = await disk();
  loadProjectionGroups(source, [".arc/active"]);
  const groups = loadedProjectionGroups(source);
  const entries = Object.fromEntries(Object.entries(source.entries));
  expect(() => replaceLoadedProjectionEntries(source, { ...entries, ".arc/user/beth/USER-INBOX.md": held }, groups))
    .toThrow(/did not read in full/u);
});

it("keeps a root partition loaded after the pass enumerated its entries", async () => {
  await writeProjectionIndex(location, index());
  const source = await disk();
  loadProjectionGroups(source, [".arc/active"]);
  const groups = loadedProjectionGroups(source);
  const pending = { ...held, refused: { reason: "pending", remedy: held.refused.remedy } };
  const entries = Object.fromEntries(Object.entries(source.entries).map(([path]) => [path, pending]));
  loadProjectionGroups(source, [".arc/user/beth"]);
  await commitProjectionIndex({ location, checkout, index: replaceLoadedProjectionEntries(source, entries, groups) });
  const after = await disk();
  loadProjectionGroups(after, "all");
  expect(after.entries[".arc/active/current/a.md"]).toEqual(pending);
  expect(after.entries[".arc/user/beth/USER-INBOX.md"]).toEqual(held);
});

it("deletes an entry the pass leaves out of an enumerated root and keeps every other root", async () => {
  await writeProjectionIndex(location, index());
  const source = await disk();
  loadProjectionGroups(source, [".arc/active", ".arc/user/andrew"]);
  const groups = loadedProjectionGroups(source);
  const entries = Object.fromEntries(Object.entries(source.entries).filter(([path]) => path !== ".arc/user/andrew/USER-INBOX.md"));
  await commitProjectionIndex({ location, checkout, index: replaceLoadedProjectionEntries(source, entries, groups) });
  const after = await disk();
  loadProjectionGroups(after, "all");
  expect(Object.keys(after.entries).sort()).toEqual([".arc/active/current/a.md", ".arc/completed/2026-q4/a.md", ".arc/user/beth/USER-INBOX.md"]);
});

const blob = gitBlobId("alpha\n", "sha1"), v1 = RecordVersionSchema.parse("v1");
const settled: RecordEntry = { kind: "record", reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" })),
  stat: held.stat, written: blob, base: { blob, version: v1 }, markers: null, notices: [], unshown: [], protected: false, changed: false,
  pending: false, withheld: false, refused: null, persisted: null, inProgress: null, copies: [] };
const copy = { name: "a.md.aside", moving: blob, rendering: { markers: null, notices: [] }, linked: null, writeBackSent: false, landed: null };

it.each<[string, Partial<RecordEntry>, boolean]>([
  ["an aside copy", { copies: [copy] }, true],
  ["a taken-in input copy", { persisted: { stamp: blob, takenIn: { kind: "copy", name: copy.name, blob, version: v1 } } }, true],
  ["an adoption", { adoption: { kind: "write-back" } }, true],
  ["a pending mark", { pending: true }, true],
  ["a withheld mark", { withheld: true }, true],
  ["a refusal", { refused: held.refused }, true],
  ["an unshown conflict", { unshown: [settled.reference] }, true],
  ["a landed take-in", { persisted: { stamp: blob, takenIn: { kind: "landed", version: v1 } } }, false],
  ["nothing outstanding", {}, false],
])("sets its root partition's unsettled mark by a record holding %s", async (_name, arm, unsettled) => {
  await writeProjectionIndex(location, { ...index(), entries: {
    ".arc/active/current/a.md": settled, ".arc/completed/2026-q4/a.md": { ...settled, ...arm } } });
  const groups = (await header()).groups;
  expect(groups[".arc/completed/2026-q4"]?.unsettled).toBe(unsettled);
  expect(groups[".arc/active"]?.unsettled).toBe(false);
});

it("loads a marked cold partition on the walked load and leaves an unmarked one unread", async () => {
  await writeProjectionIndex(location, { ...index(), entries: {
    ".arc/active/current/a.md": settled, ".arc/user/andrew/USER-INBOX.md": settled,
    ".arc/completed/2026-q3/a.md": settled, ".arc/completed/2026-q4/a.md": { ...settled, pending: true },
    ".arc/user/beth/USER-INBOX.md": settled } });
  const groups = (await header()).groups;
  for (const cold of [".arc/completed/2026-q3", ".arc/user/beth"]) {
    await writeFile(join(location.stateDir, groups[cold]!.name), "corrupted but unvisited");
  }
  const source = await disk();
  loadProjectionGroups(source, "walked");
  expect([...loadedProjectionGroups(source)].sort()).toEqual([".arc/active", ".arc/completed/2026-q4", ".arc/user/andrew"]);
  expect(Object.keys(source.entries).sort()).toEqual([".arc/active/current/a.md", ".arc/completed/2026-q4/a.md", ".arc/user/andrew/USER-INBOX.md"]);
  expect(source.entries[".arc/completed/2026-q4/a.md"]).toMatchObject({ pending: true });
});
