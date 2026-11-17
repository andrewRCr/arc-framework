/** Publication failures and lock-free readers recover through the header's whole-index boundary. */
import { copyFileSync, readdirSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { parseProjectionJson, withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { captureProjectionLocal } from "../../../../src/lib/store/projection/local-capture.js";
import { RecordReferenceSchema, RecordVersionSchema } from "../../../../src/lib/store/identity.js";

const fault = vi.hoisted(() => ({ header: "", stateDir: "", stopHeader: false, retain: "",
  beforePartitions: null as (() => Promise<void>) | null, onPartitionRead: null as (() => void) | null }));
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (fault.onPartitionRead !== null && typeof args[0] === "string" && args[0].startsWith(join(fault.stateDir, "index-"))) {
        const action = fault.onPartitionRead; fault.onPartitionRead = null; action();
      }
      return actual.readFileSync(...args);
    },
  };
});
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual,
    rename: async (from: string, to: string) => {
      if (fault.stopHeader && to === fault.header) throw new Error("stopped before header publication");
      return actual.rename(from, to);
    },
    rm: async (path: string, options?: Parameters<typeof actual.rm>[1]) => {
      if (path === fault.retain) throw Object.assign(new Error("partition held open"), { code: "EACCES" });
      return actual.rm(path, options);
    },
    readdir: async (path: string) => {
      if (path === fault.stateDir && fault.beforePartitions !== null) {
        const action = fault.beforePartitions; fault.beforePartitions = null; await action();
      }
      return actual.readdir(path);
    },
  };
});
let checkout: string;
beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "arc-projection-index-recovery-"));
  fault.stateDir = join(checkout, ".git/arc-projection"); fault.header = join(fault.stateDir, "index");
  await mkdir(fault.stateDir, { recursive: true });
});
afterEach(async () => { fault.stopHeader = false; fault.retain = ""; fault.beforePartitions = null; fault.onPartitionRead = null;
  await rm(checkout, { recursive: true, force: true }); });
const path = ".arc/active/current/a.md";
const entry = { kind: "ownerless" as const, stat: null, refused: { reason: "old", remedy: { text: "Repair ownership." } } };
function location() {
  const gitDir = join(checkout, ".git");
  return { gitDir, commonDir: gitDir, primary: true, stateDir: fault.stateDir };
}
function index(): ProjectionIndex {
  return { format: 2, state: null, projectedUnder: { identity: SlugSchema.parse("andrew"), claim: null,
    layoutActive: "nested", view: { mode: "mine", pins: [] } }, withheldCopies: [], tripwires: {}, ignoreFiles: null,
  ignoreGuard: null, entries: { [path]: entry } };
}
async function disk(): Promise<ProjectionIndex> {
  const read = await readProjectionIndex(location(), true, { groups: "all" });
  if (read.kind !== "index") throw new Error("Index unavailable");
  return read.index;
}

it("keeps the old header readable after interrupted publication and collects the orphan on the next write", async () => {
  await writeProjectionIndex(location(), index());
  const before = await readFile(fault.header, "utf8"), source = await disk();
  fault.stopHeader = true;
  await expect(writeProjectionIndex(location(), withProjectionEntry(source, path,
    { ...entry, refused: { ...entry.refused, reason: "new" } }))).rejects.toThrow("stopped before header publication");
  expect(await readFile(fault.header, "utf8")).toBe(before);
  expect((await disk()).entries[path]).toEqual(entry);
  expect((await readdir(fault.stateDir)).filter(name => name.startsWith("index-"))).toHaveLength(2);
  fault.stopHeader = false;
  await writeProjectionIndex(location(), source);
  expect((await readdir(fault.stateDir)).filter(name => name.startsWith("index-"))).toHaveLength(1);
});

it("retains a held obsolete partition and collects it on a subsequent write", async () => {
  await writeProjectionIndex(location(), index());
  const source = await disk(), names = await readdir(fault.stateDir);
  fault.retain = join(fault.stateDir, names.find(name => name.startsWith("index-"))!);
  await writeProjectionIndex(location(), withProjectionEntry(source, path, { ...entry, stat: null,
    refused: { ...entry.refused, reason: "new" } }));
  expect(await readFile(fault.retain, "utf8")).toContain('"old"');
  fault.retain = "";
  await writeProjectionIndex(location(), await disk());
  expect((await readdir(fault.stateDir)).filter(name => name.startsWith("index-"))).toHaveLength(1);
});

it("retries the whole lock-free read when a newer header collected its old partition", async () => {
  await writeProjectionIndex(location(), index());
  const source = await disk();
  fault.beforePartitions = async () => writeProjectionIndex(location(), withProjectionEntry(source, path,
    { ...entry, refused: { ...entry.refused, reason: "new" } }));
  const read = await readProjectionIndex(location(), true, { groups: "all", retry: true });
  expect(read.kind === "index" && read.index.entries[path]).toMatchObject({ refused: { reason: "new" } });
  expect((await readdir(fault.stateDir)).filter(name => name.startsWith("index-"))).toHaveLength(1);
});

it("answers unreadable without deleting anything when the header still names its missing partition", async () => {
  await writeProjectionIndex(location(), index());
  const before = await readFile(fault.header, "utf8");
  const name = (await readdir(fault.stateDir)).find(name => name.startsWith("index-"))!;
  await rm(join(fault.stateDir, name));
  expect(await readProjectionIndex(location(), true, { groups: "all", retry: true })).toEqual({ kind: "unusable", cause: "unreadable", header: parseProjectionJson(before) });
  expect(await readFile(fault.header, "utf8")).toBe(before);
});

/** Stage a newer publication elsewhere, applied in one synchronous step that collects every partition it replaces. */
async function stagedPublication(newer: ProjectionIndex): Promise<() => void> {
  const staging = join(checkout, ".git/staged-publication");
  await mkdir(staging, { recursive: true });
  await writeProjectionIndex({ ...location(), stateDir: staging }, newer);
  return () => {
    const old = readdirSync(fault.stateDir).filter(name => name.startsWith("index-"));
    for (const name of readdirSync(staging)) if (name.startsWith("index-")) copyFileSync(join(staging, name), join(fault.stateDir, name));
    copyFileSync(join(staging, "index"), fault.header);
    const kept = new Set(readdirSync(staging));
    for (const name of old) if (!kept.has(name)) rmSync(join(fault.stateDir, name));
  };
}

const bound = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: { type: "work-item", name: "a" }, key: "a.md" });
const boundEntry: RecordEntry = { kind: "record", reference: bound, stat: null, written: "a".repeat(40),
  base: { blob: "a".repeat(40), version: RecordVersionSchema.parse("v1") }, markers: null, notices: [], unshown: [],
  protected: false, changed: false, pending: true, withheld: false, refused: null, persisted: null, inProgress: null, copies: [] };

it("restarts a lock-free capture once when a publication collects its path's partition mid-read", async () => {
  await writeProjectionIndex(location(), index());
  fault.onPartitionRead = await stagedPublication(withProjectionEntry(await disk(), path, boundEntry));
  const captured = await captureProjectionLocal({ checkout, path, source: "file", location: location() });
  expect(fault.onPartitionRead).toBeNull();
  expect(captured).toMatchObject({ status: "ok", result: { binding: bound } });
});

it("answers the capture's own remedy when its path's partition stays unreadable", async () => {
  await writeProjectionIndex(location(), index());
  const name = (await readdir(fault.stateDir)).find(each => each.startsWith("index-"))!;
  await writeFile(join(fault.stateDir, name), "{}");
  const captured = await captureProjectionLocal({ checkout, path, source: "file", location: location() });
  expect(captured).toMatchObject({ status: "refused", nativeRefusal: true, refusal: { remedy: {
    text: expect.stringContaining(`Let the command publishing the projection index at ${checkout} finish`) } } });
});
