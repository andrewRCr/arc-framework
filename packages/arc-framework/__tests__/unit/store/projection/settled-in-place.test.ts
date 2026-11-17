/** A settled file stays in place only while its record renders to the bytes it holds, under the same protection. */
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecordReferenceSchema, RecordVersionSchema } from "../../../../src/lib/store/identity.js";
import { StoreRecordSchema, type StoreRecord } from "../../../../src/lib/store/read.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import type { FileStat, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import type { RenderedRecord } from "../../../../src/lib/store/projection/record-render.js";
import { keepSettledFileInPlace, type SettledInPlaceInput } from "../../../../src/lib/store/projection/settled-in-place.js";
import { renderedRecordText } from "../../../../src/lib/store/projection/staging.js";

let checkout: string;
beforeEach(async () => { checkout = await mkdtemp(join(tmpdir(), "arc-settled-in-place-")); });
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

const LATER = BigInt(Date.now() + 3_600_000) * 1_000_000n;
const conflict = RecordReferenceSchema.parse({ kind: "personal/conflict-record", owner: { type: "person", name: "andrew" }, key: "clash" });

function record(path: string, version: string): StoreRecord {
  return StoreRecordSchema.parse({ reference: { kind: "personal/document", owner: { type: "person", name: "andrew" },
    key: path.slice(".arc/user/andrew/".length) }, content: "Opening.\nStored.\nClosing.\n", version: RecordVersionSchema.parse(version),
  formatVersion: 1, conflicts: [] });
}

function rendering(stored: StoreRecord, extra: Partial<RenderedRecord> = {}): RenderedRecord {
  return { content: stored.content, notices: [], state: { markers: null, notices: [], unshown: [] }, ...extra };
}

/** An arriving record's complete basis, journaled while the path's leaving record still holds it. */
function arriving(): NonNullable<RecordEntry["handoff"]> {
  const stored = record(".arc/user/andrew/scratch/arriving.md", "v1");
  return { kind: "record", reference: stored.reference, stat: null, written: gitBlobId("Arriving.\n", "sha1"),
    base: { blob: gitBlobId(stored.content, "sha1"), version: stored.version }, markers: null, notices: [], unshown: [],
    protected: false, changed: false, pending: true, withheld: false, refused: null, persisted: null, inProgress: null, copies: [] };
}

async function statOf(path: string): Promise<FileStat> {
  const s = await lstat(join(checkout, path), { bigint: true });
  return { type: "file", size: s.size, mtimeNs: s.mtimeNs, ino: s.ino };
}

/** Lay a record's rendering at a path, and the settled entry recording it at the earlier version. */
async function laid(path: string, overrides: Partial<RecordEntry> = {}) {
  const earlier = record(path, "v1"), current = record(path, "v2");
  const text = renderedRecordText({ path, record: earlier, content: earlier.content, format: "sha1" });
  await mkdir(dirname(join(checkout, path)), { recursive: true });
  await writeFile(join(checkout, path), text);
  const prior: RecordEntry = { kind: "record", reference: earlier.reference, stat: await statOf(path), written: gitBlobId(text, "sha1"),
    base: { blob: gitBlobId(earlier.content, "sha1"), version: earlier.version }, markers: null, notices: [], unshown: [],
    protected: false, changed: false, pending: false, withheld: false, refused: null, persisted: null, inProgress: null, copies: [],
    ...overrides };
  const input: SettledInPlaceInput = { checkout, path, prior, record: current, rendered: rendering(current), protected: false,
    reference: LATER, format: "sha1" };
  return { input, prior, current, text };
}

describe.each([".arc/user/andrew/scratch/note.md", ".arc/user/andrew/scratch/note.txt"])("%s", path => {
  it("keeps a clean settled file, recording the record's version and rendering state", async () => {
    const { input, prior, current } = await laid(path);
    const kept = await keepSettledFileInPlace({ ...input, rendered: rendering(current,
      { state: { markers: null, notices: [], unshown: [conflict] } }) });
    expect(kept).toEqual({ ...prior, unshown: [conflict], base: { blob: prior.base.blob, version: current.version } });
    expect(await statOf(path)).toEqual(prior.stat);
  });

  it("re-records the stat when only a hash proves the file unchanged", async () => {
    const { input, prior } = await laid(path);
    const stale = { ...prior, stat: { ...prior.stat!, mtimeNs: prior.stat!.mtimeNs - 1n } };
    const kept = await keepSettledFileInPlace({ ...input, prior: stale });
    expect(kept?.stat).toEqual(prior.stat);
  });

  it("lays the file when its protection changes", async () => {
    const { input } = await laid(path);
    expect(await keepSettledFileInPlace({ ...input, protected: true })).toBeNull();
  });

  it("lays the file when its rendering changes", async () => {
    const { input, current } = await laid(path);
    const changed = path.endsWith(".md") ? rendering(current, { notices: ["A stored conflict is open."] })
      : rendering(current, { content: current.content + "More.\n" });
    expect(await keepSettledFileInPlace({ ...input, rendered: changed })).toBeNull();
  });

  it("lays the file when it was deleted or edited", async () => {
    const { input, text } = await laid(path);
    await writeFile(join(checkout, path), text + "A hand edit.\n");
    expect(await keepSettledFileInPlace(input)).toBeNull();
    await rm(join(checkout, path));
    expect(await keepSettledFileInPlace(input)).toBeNull();
  });

  it.each<[string, Partial<RecordEntry>]>([
    ["pending", { pending: true }],
    ["withheld", { withheld: true }],
    ["refused", { refused: { reason: "refused", remedy: { text: "Retry." } } }],
    ["mid-replacement", { inProgress: { replaces: { blob: gitBlobId("x", "sha1"), version: RecordVersionSchema.parse("v0") }, copy: null } }],
    ["handing off", { handoff: arriving() }],
    ["adopting", { adoption: { kind: "write-back" } }],
    ["still recording", { persisted: { stamp: gitBlobId("x", "sha1"), recording: true,
      takenIn: { kind: "copy", name: "taken-in", blob: gitBlobId("x", "sha1"), version: RecordVersionSchema.parse("v0") } } }],
  ])("lays the file when its entry is %s", async (_label, overrides) => {
    const { input } = await laid(path, overrides);
    expect(await keepSettledFileInPlace(input)).toBeNull();
  });
});
