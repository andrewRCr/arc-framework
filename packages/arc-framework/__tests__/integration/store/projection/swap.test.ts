/** The swap over a seeded projection: the old file moved aside, the staged file linked in, between two index writes. */
import { chmod, link, readFile, rename, rm, stat as fsStat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { gitBlobId, storedBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { checkAsideCopy } from "../../../../src/lib/store/projection/aside-copies.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { readReference, readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { readStamplessFile } from "../../../../src/lib/store/projection/stampless.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { swapBatch, type SwapBatchInput } from "../../../../src/lib/store/projection/swap.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

const PATH = ".arc/backlog/planned/one/cohort-one.md";
const WRITER = { pid: process.pid, processInstance: "swap-test", processScope: "pid:[swap-test]" };
const PROVENANCE = { verb: "save", lifecycleAction: "save" } as const;

/** A take-in that defers every edit. */
const deferring: TakeInPort = async (request) => ({ answer: "deferred", entry: request.entry });

/**
 * A projected file, its record's next version stored and staged, and the guard's decision to replace it, with a batch
 * that swaps it.
 */
async function prepared(
  path = PATH, contents: readonly [string, string] = ["# Cohort: one\n\nBody.\n", "# Cohort: one\n\nBody, refreshed.\n"], readOnly = false,
  guarded: { readonly before?: (file: string) => Promise<void>; readonly takeIn?: TakeInPort } = {},
) {
  const fixture = createReferenceFixture();
  const reference = fixture.reference("cohort/document", "one");
  const put = await fixture.store.write({ action: "put", reference, content: contents[0], expected: null, provenance: PROVENANCE });
  if (put.status !== "ok") throw new Error("the fixture write was refused");
  const seeded = await seedProjection({ store: fixture.store, files: [{ reference, path }] });
  directories.push(seeded.checkout);
  const laid = seeded.index.entries[path];
  if (laid?.kind !== "record") throw new Error("expected the file's record entry");
  const next = await fixture.store.write({ action: "put", reference, content: contents[1], expected: laid.base.version, provenance: PROVENANCE });
  if (next.status !== "ok") throw new Error("the fixture write was refused");
  const record = await fixture.store.read({ reference });
  if (record.status !== "ok") throw new Error("the fixture read was refused");
  if (readOnly) await chmod(join(seeded.checkout, path), 0o444);
  await guarded.before?.(join(seeded.checkout, path));
  const staged = await stageRecordFile({
    checkout: seeded.checkout, path, record: record.result, replacing: laid.base.blob, writer: WRITER, format: "sha1", readOnly,
  });
  const replace = await guardReplacement({
    checkout: seeded.checkout, path, entry: laid, staged, reference: await readReference(seeded.checkout), format: "sha1",
    store: fixture.store, writer: WRITER, takeIn: guarded.takeIn ?? deferring,
  });
  if (replace.kind !== "replace") throw new Error("expected the guard to replace the file");
  const file = join(seeded.checkout, path);
  const swap = (overrides: Partial<SwapBatchInput> = {}) => swapBatch({
    location: seeded.location, checkout: seeded.checkout, index: seeded.index, files: [{ path, replace }], readBack: false,
    writer: WRITER, format: "sha1", takeIn: deferring, ...overrides,
  });
  return { fixture, reference, seeded, laid, staged, file, swap, path, replace, record: record.result };
}

/** A take-in that lands what an aside copy holds over the record's current version, standing in for write-back's merge. */
function landingCopies(store: ReturnType<typeof createReferenceFixture>["store"]): TakeInPort {
  return async (request) => {
    const location = join(request.checkout, request.copy ?? request.path);
    const text = await readFile(location, "utf8");
    const current = await store.read({ reference: request.entry.reference });
    if (current.status !== "ok") throw new Error("the fixture read was refused");
    const written = await store.write({
      action: "put", reference: request.entry.reference, content: parseStampedFile(text).content, expected: current.result.version,
      provenance: PROVENANCE,
    });
    if (written.status !== "ok") throw new Error("the landing write was refused");
    const stat = await readStat(location);
    if (stat === null) throw new Error("nothing to take in");
    return { answer: "taken-in", entry: request.entry, read: { stat, blob: gitBlobId(text, "sha1") } };
  };
}

describe("the swap", () => {
  it("lands a save made after the re-check, in place or by renaming over the path, in the aside copy, and takes it in", async () => {
    for (const style of ["in place", "renamed over"] as const) {
      const { fixture, reference, laid, file, swap, record } = await prepared();
      const saved = "# Cohort: one\n\nSaved after the re-check.\n";
      const text = renderStampedFile({ content: saved, stamp: laid.base.blob });
      const afterRecheck = async (): Promise<void> => {
        if (style === "in place") return writeFile(file, text);
        await writeFile(`${file}.tmp`, text);
        await rename(`${file}.tmp`, file);
      };
      await swap({ takeIn: landingCopies(fixture.store), hooks: { afterRecheck } });
      const stored = await fixture.store.read({ reference });
      expect(stored.status === "ok" && stored.result.content).toBe(saved);
      expect(await readFile(file, "utf8")).toBe(renderStampedFile({ content: record.content, stamp: gitBlobId(record.content, "sha1") }));
    }
  });

  it("yields to a save that recreated the path before the link, the replaced version still recorded", async () => {
    const { laid, file, swap } = await prepared();
    const text = renderStampedFile({ content: "# Cohort: one\n\nRecreated before the link.\n", stamp: laid.base.blob });
    const result = await swap({ hooks: { afterMove: async () => writeFile(file, text) } });
    expect(await readFile(file, "utf8")).toBe(text);
    expect(result.index.entries[PATH]).toMatchObject({ base: laid.base, written: laid.written, pending: true });
  });

  it("rebuilds an absent file by the link alone, its in-progress record cleared by the second write, kept where it yields", async () => {
    const text = [".arc/user/andrew/scratch/two.txt", ["plain: text\n", "plain: refreshed\n"]] as const;
    const rebuilt = await prepared(...text);
    await rm(rebuilt.file);
    const done = await rebuilt.swap();
    expect(await readFile(rebuilt.file, "utf8")).toBe("plain: refreshed\n");
    expect(done.index.entries[rebuilt.path]).toMatchObject({ inProgress: null, copies: [] });

    const yielding = await prepared(...text);
    await rm(yielding.file);
    const saved = await yielding.swap({ hooks: { beforeRebuildLink: async () => writeFile(yielding.file, "plain: saved\n") } });
    expect(await readFile(yielding.file, "utf8")).toBe("plain: saved\n");
    expect(saved.index.entries[yielding.path]).toMatchObject({ inProgress: { replaces: yielding.laid.base, copy: null }, pending: true });
  });

  it("leaves a file whose move is still refused past the retry bound in place, its entry restored and pending", async () => {
    const { laid, file, swap } = await prepared();
    const held = await readFile(file, "utf8");
    const busy = Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    const result = await swap({ fs: { rename: async () => { throw busy; } }, retrySleep: async () => undefined });
    expect(await readFile(file, "utf8")).toBe(held);
    expect(result.index.entries[PATH]).toEqual({ ...laid, pending: true });
    expect(result.copies).toEqual([]);
  });

  it("clears the pending mark of a file put in place once the swaps are done, and keeps it for one whose move was refused", async () => {
    const placed = await prepared();
    const done = await placed.swap();
    expect(done.index.entries[PATH]).toMatchObject({ pending: false, base: placed.staged.base, stat: await readStat(placed.file) });
    expect(await readStat(join(placed.seeded.checkout, placed.staged.location))).toBeNull();

    const refused = await prepared();
    const busy = Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    const kept = await refused.swap({ fs: { rename: async () => { throw busy; } }, retrySleep: async () => undefined });
    expect(kept.index.entries[PATH]).toMatchObject({ pending: true });
  });

  it("keeps, in a read-back's batch, the pending mark a file carried into it, and clears the one the batch set", async () => {
    const carried = await prepared();
    const pending = { ...carried.replace, entry: { ...carried.replace.entry, pending: true } };
    const kept = await carried.swap({ readBack: true, files: [{ path: PATH, replace: pending }] });
    expect(kept.index.entries[PATH]).toMatchObject({ pending: true, base: carried.staged.base });

    const set = await prepared();
    const cleared = await set.swap({ readBack: true });
    expect(cleared.index.entries[PATH]).toMatchObject({ pending: false, base: set.staged.base });
  });

  it("keeps the pending mark of a file a new file was renamed over after its link", async () => {
    const { laid, file, swap } = await prepared();
    const text = renderStampedFile({ content: "# Cohort: one\n\nRenamed over after the link.\n", stamp: laid.base.blob });
    const afterFirstCheck = async (): Promise<void> => {
      await writeFile(`${file}.tmp`, text);
      await rename(`${file}.tmp`, file);
    };
    const result = await swap({ hooks: { afterFirstCheck } });
    expect(await readFile(file, "utf8")).toBe(text);
    expect(result.index.entries[PATH]).toMatchObject({ pending: true });
  });

  it("replaces a read-only file with its mode kept, the old file moved aside read-only", async () => {
    const { file, swap, record, seeded } = await prepared(PATH, ["# Cohort: one\n\nBody.\n", "# Cohort: one\n\nBody, refreshed.\n"], true);
    const result = await swap();
    expect(await readFile(file, "utf8")).toBe(renderStampedFile({ content: record.content, stamp: gitBlobId(record.content, "sha1") }));
    expect((await fsStat(file)).mode & 0o777).toBe(0o444);
    const [kept] = result.copies;
    if (kept === undefined) throw new Error("expected the aside copy");
    expect((await fsStat(join(seeded.checkout, kept.copy))).mode & 0o777).toBe(0o444);
  });

  it("retries a held file's move refused with EBUSY within the bound, and replaces it", async () => {
    const { file, swap, record } = await prepared();
    let refusals = 2;
    const busy = Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    const held = async (from: string, to: string): Promise<void> => {
      if (refusals > 0) { refusals -= 1; throw busy; }
      await rename(from, to);
    };
    const result = await swap({ fs: { rename: held }, retrySleep: async () => undefined });
    expect(await readFile(file, "utf8")).toBe(renderStampedFile({ content: record.content, stamp: gitBlobId(record.content, "sha1") }));
    expect(result.index.entries[PATH]).toMatchObject({ pending: false });
  });

  it("leaves a file pending, holding no edit, after a stop between the index write and the move, in completed/ too", async () => {
    const stop = async (): Promise<never> => { throw new Error("stopped"); };
    const markdown = await prepared(".arc/completed/one/cohort-one.md");
    await expect(markdown.swap({ hooks: { afterRecheck: stop } })).rejects.toThrow("stopped");
    const written = await onDisk(markdown.seeded.location, markdown.path);
    expect(written).toMatchObject({ pending: true, base: markdown.staged.base });
    const text = await readFile(markdown.file, "utf8");
    // The old file equals its own stamp's version, so write-back finds no edit in it.
    expect(storedBlobId(text, { format: "sha1", markdown: true })).toBe(parseStampedFile(text).stamp);

    const other = await prepared(".arc/completed/one/notes.txt", ["plain: text\n", "plain: refreshed\n"]);
    await expect(other.swap({ hooks: { afterRecheck: stop } })).rejects.toThrow("stopped");
    const record = await onDisk(other.seeded.location, other.path);
    const stat = await readStat(other.file);
    if (stat === null) throw new Error("the file is gone");
    const read = await readStamplessFile({
      entry: record, text: await readFile(other.file, "utf8"), mtimeNs: stat.mtimeNs, format: "sha1",
      memo: createHistoryMemo(other.fixture.store),
    });
    expect(read).toEqual({ status: "ok", result: { kind: "unedited" } });
  });

  it("leaves a file pending after a stop between the move and the link, its aside copy holding no edit", async () => {
    const { seeded, path, file, swap } = await prepared(".arc/completed/one/cohort-one.md");
    await expect(swap({ hooks: { afterMove: async () => { throw new Error("stopped"); } } })).rejects.toThrow("stopped");
    const written = await onDisk(seeded.location, path);
    expect(written).toMatchObject({ pending: true });
    expect(await readStat(file)).toBeNull();
    const [copy] = written.copies;
    if (copy === undefined) throw new Error("expected the aside copy's record");
    expect(await checkAsideCopy({ checkout: seeded.checkout, path, entry: written, copy, format: "sha1", takeIn: deferring }))
      .toEqual({ kind: "no-edit", entry: written });
  });
});

describe("a deleted projected file", () => {
  const contents = ["# Cohort: one\n\nBody.\n", "# Cohort: one\n\nBody, refreshed.\n"] as const;
  /** A take-in that finds no edit, as write-back's read gate does in an emptied Markdown file or a link. */
  const noEdit: TakeInPort = async (request) => ({ answer: "no-edit", entry: request.entry });

  it("is overwritten by the next replacement, whether emptied or replaced by a symbolic link", async () => {
    const emptied = await prepared(PATH, contents, false, { before: async (file) => writeFile(file, ""), takeIn: noEdit });
    const replaced = renderStampedFile({ content: emptied.record.content, stamp: gitBlobId(emptied.record.content, "sha1") });
    await emptied.swap();
    expect(await readFile(emptied.file, "utf8")).toBe(replaced);

    const target = { path: "" };
    const linked = await prepared(PATH, contents, false, {
      before: async (file) => {
        target.path = `${file}.elsewhere`;
        await writeFile(target.path, "# Someone else's notes\n");
        await rm(file);
        await symlink(target.path, file);
      },
    });
    await linked.swap();
    expect(await readStat(linked.file)).toMatchObject({ type: "file" });
    expect(await readFile(linked.file, "utf8")).toBe(replaced);
    expect(await readFile(target.path, "utf8")).toBe("# Someone else's notes\n");
  });
});

describe("a swap whose link fails after the move for another reason", () => {
  const failing = Object.assign(new Error("EIO: i/o error, link"), { code: "EIO" });
  /** A link that fails for the staged file alone, so linking a copy back still works. */
  const staleLink = async (existing: string, path: string): Promise<void> => {
    if (existing.endsWith(".staged")) throw failing;
    await link(existing, path);
  };

  it("links the aside copy back to the path, its entry restored and pending", async () => {
    const { laid, file, swap } = await prepared();
    const held = await readFile(file, "utf8");
    const result = await swap({ fs: { link: staleLink } });
    expect(await readFile(file, "utf8")).toBe(held);
    expect(result.index.entries[PATH]).toMatchObject({ base: laid.base, written: laid.written, pending: true, copies: [] });
    expect(result.copies).toEqual([]);
  });

  it("leaves the path absent and pending where the copy is a symbolic link, never linking it back", async () => {
    const { seeded, file, swap } = await prepared();
    const target = join(seeded.checkout, "elsewhere.md");
    await writeFile(target, "# Someone else's notes\n");
    await rm(file);
    await symlink(target, file);
    const result = await swap({ fs: { link: staleLink } });
    expect(await readStat(file)).toBeNull();
    expect(result.index.entries[PATH]).toMatchObject({ pending: true });
    expect(await readFile(target, "utf8")).toBe("# Someone else's notes\n");
  });
});

/** The entry the index on disk holds for a path. */
async function onDisk(location: Parameters<typeof readProjectionIndex>[0], path: string): Promise<RecordEntry> {
  const read = await readProjectionIndex(location, true);
  if (read.kind !== "index") throw new Error(`expected an index on disk, found ${read.kind}`);
  const entry = read.index.entries[path];
  if (entry?.kind !== "record") throw new Error(`expected a record entry at ${path}`);
  return entry;
}
