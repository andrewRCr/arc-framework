/** Smudging racy entries at each index write, over real files and a real index. */
import { lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences, OwnerIdentitySchema, RecordVersionSchema } from "../../../../src/lib/store/identity.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import {
  checkChange, PROJECTION_REFERENCE, readReference, recordCleanStat, type ChangeCheck, type RecordedAfresh,
} from "../../../../src/lib/store/projection/change-detection.js";
import { commitProjectionIndex, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { FileStat, ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";

const T = new Date("2026-10-31T12:00:00.000Z");
const KEY = ".arc/active/meta-alpha.md";
const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" });

let checkout: string;
let path: string;
let location: ProjectionLocation;
beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "arc-projection-smudge-"));
  path = join(checkout, KEY);
  await mkdir(dirname(path), { recursive: true });
  const gitDir = join(checkout, ".git");
  location = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
  await mkdir(location.stateDir, { recursive: true });
});
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

async function statOf(target: string): Promise<FileStat> {
  const s = await lstat(target, { bigint: true });
  return { type: "file", size: s.size, mtimeNs: s.mtimeNs, ino: s.ino };
}

function indexWith(stat: FileStat, written: string): ProjectionIndex {
  return {
    format: 1, state: null,
    projectedUnder: { view: { mode: "mine", pins: [] }, identity: SlugSchema.parse("andrew"), claim: null, layoutActive: "nested" },
    withheldCopies: [], tripwires: {}, ignoreFiles: null,
    entries: {
      [KEY]: {
        kind: "record", reference: recordReferences["work-item/meta"](owner), stat, written,
        base: { blob: written, version: RecordVersionSchema.parse("v1") }, markers: null, notices: [], unshown: [],
        protected: false, changed: false, pending: false, withheld: false, refused: null, persisted: null,
        inProgress: null, copies: [],
      },
    },
  };
}

/** Pin the reference into the tick at `at`, as an index write in that tick leaves it. */
async function pinReference(at: Date): Promise<void> {
  await utimes(join(checkout, PROJECTION_REFERENCE), at, at);
}

const afresh = (...entries: string[]): RecordedAfresh => ({ entries: new Set(entries), ignoreFiles: false });

/** Record the file as written at `T`, its reference in the same tick, then carry it through a later index write. */
async function racyThenCarried(content: string, save: string): Promise<ProjectionIndex> {
  await writeFile(path, content);
  await utimes(path, T, T);
  const first = await commitProjectionIndex({
    location, checkout, index: indexWith(await statOf(path), gitBlobId(content, "sha1")), recorded: afresh(KEY),
  });
  await pinReference(T);
  await writeFile(path, save);
  await utimes(path, T, T);
  return commitProjectionIndex({ location, checkout, index: first, recorded: afresh() });
}

async function checkOf(index: ProjectionIndex): Promise<ChangeCheck> {
  const entry = index.entries[KEY];
  if (entry?.kind !== "record") throw new Error("expected the record entry");
  return { path, recorded: entry.stat, written: entry.written, reference: await readReference(checkout), format: "sha1" };
}

describe("smudging", () => {
  it("smudges an entry racy at an index write, so a save in its tick is still found after a later write", async () => {
    const later = await racyThenCarried("version one\n", "version two\n");
    expect(await checkChange(await checkOf(later))).toMatchObject({ status: "changed" });
  });

  it("leaves the stat of an entry the write records unsmudged, though it is racy against the reference replaced", async () => {
    await writeFile(path, "version one\n");
    expect(await readReference(checkout)).toBeNull();
    const stat = await statOf(path);
    const written = await commitProjectionIndex({
      location, checkout, index: indexWith(stat, gitBlobId("version one\n", "sha1")), recorded: afresh(KEY),
    });
    expect(written.entries[KEY]?.stat).toEqual(stat);
  });

  it("hashes a smudged entry whose file was truncated to empty, and finds the change", async () => {
    const later = await racyThenCarried("version one\n", "");
    expect(await checkChange(await checkOf(later))).toMatchObject({ status: "changed", blob: gitBlobId("", "sha1") });
  });

  it("re-records a smudged entry's stats once it hashes clean, so the next check matches it without a read", async () => {
    const later = await racyThenCarried("version one\n", "version one\n");
    const verdict = await checkChange(await checkOf(later));
    if (verdict.status !== "hashed-clean") throw new Error(`expected hashed-clean, got ${verdict.status}`);
    await commitProjectionIndex({ location, checkout, index: recordCleanStat(later, KEY, verdict.stat), recorded: afresh(KEY) });
    const stored = await readProjectionIndex(location, true);
    if (stored.kind !== "index") throw new Error("expected the index");
    expect(stored.index.entries[KEY]?.stat).toEqual(await statOf(path));
    const reads: string[] = [];
    const recordingRead = async (target: string): Promise<Uint8Array> => { reads.push(target); return readFile(target); };
    expect(await checkChange(await checkOf(stored.index), recordingRead)).toMatchObject({ status: "clean" });
    expect(reads).toEqual([]);
  });
});
