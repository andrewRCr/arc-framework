/** The swap over a seeded projection: the old file moved aside, the staged file linked in, between two index writes. */
import { link, readFile, rename, rm, stat as fsStat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deferring, landingCopies, prepareSwap, SWAP_PATH, SWAP_WRITER, type PrepareSwapOptions,
} from "../../../helpers/store/projection/swap-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { gitBlobId, storedBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { checkAsideCopy } from "../../../../src/lib/store/projection/aside-copies.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { readStamplessFile } from "../../../../src/lib/store/projection/stampless.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

const PATH = SWAP_PATH;
const WRITER = SWAP_WRITER;

/** A prepared swap whose checkout this file removes after each test. */
async function prepared(
  path = PATH, contents?: readonly [string, string], readOnly = false, guarded: PrepareSwapOptions["guarded"] = {},
) {
  const swap = await prepareSwap({ path, ...(contents === undefined ? {} : { contents }), readOnly, guarded });
  directories.push(swap.seeded.checkout);
  return swap;
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
    expect(await checkAsideCopy({ checkout: seeded.checkout, path, entry: written, copy, format: "sha1", takeIn: deferring, writer: WRITER }))
      .toEqual({ kind: "no-edit", entry: written });
  });
});

describe("a copy refused at the first check", () => {
  const mark = { reason: "malformed-entry", remedy: { text: "Repair the malformed entry, then save again." } };
  const refusing: TakeInPort = async (request) => ({ answer: "refused", entry: request.entry, mark });

  it("is swapped back, keeping its pending mark through the second write, the replacement kept for the second check", async () => {
    const { laid, file, swap, path } = await prepared();
    const text = renderStampedFile({ content: "# Cohort: one\n\nA malformed save.\n", stamp: laid.base.blob });
    const result = await swap({ takeIn: refusing, hooks: { afterRecheck: async () => writeFile(file, text) } });
    expect(await readFile(file, "utf8")).toBe(text);
    const entry = result.index.entries[path];
    expect(entry).toMatchObject({ pending: true, refused: mark });
    if (entry?.kind !== "record") throw new Error("expected the file's record entry");
    expect(result.copies.map((each) => each.copy)).toEqual(entry.copies.map((record) => record.name));
    expect(result.copies).toHaveLength(1);
  });

  it("is linked back to a path gone absent, keeping its pending mark through the second write", async () => {
    const { laid, file, swap, path } = await prepared();
    const text = renderStampedFile({ content: "# Cohort: one\n\nA malformed save.\n", stamp: laid.base.blob });
    // The file is deleted while write-back reads the copy, so the copy's path is absent when the refusal returns.
    const deleting: TakeInPort = async (request) => { await rm(file); return refusing(request); };
    const result = await swap({ takeIn: deleting, hooks: { afterRecheck: async () => writeFile(file, text) } });
    expect(await readFile(file, "utf8")).toBe(text);
    expect(result.index.entries[path]).toMatchObject({ pending: true, refused: mark, copies: [] });
    expect(result.copies).toEqual([]);
  });

  it("stays aside where a save recreates the path while it is swapped back, the save kept and both copies checked again", async () => {
    const { seeded, laid, file, swap, path } = await prepared();
    const text = renderStampedFile({ content: "# Cohort: one\n\nA malformed save.\n", stamp: laid.base.blob });
    const save = renderStampedFile({ content: "# Cohort: one\n\nSaved mid-swap.\n", stamp: laid.base.blob });
    let links = 0;
    // The batch's own link comes first; the save lands before the swap back's.
    const savingFirst = async (existing: string, at: string) => { links += 1; if (links === 2) await writeFile(at, save); await link(existing, at); };
    const result = await swap({ takeIn: refusing, fs: { link: savingFirst }, hooks: { afterRecheck: async () => writeFile(file, text) } });
    expect(await readFile(file, "utf8")).toBe(save);
    const entry = result.index.entries[path];
    if (entry?.kind !== "record") throw new Error("expected the file's record entry");
    expect(entry).toMatchObject({ pending: true });
    const held = await Promise.all(entry.copies.map(async (record) => readFile(join(seeded.checkout, record.name), "utf8")));
    expect(held).toEqual([expect.stringContaining("A malformed save."), expect.stringContaining("Body, refreshed.")]);
    expect(result.copies.map((each) => each.copy)).toEqual(entry.copies.map((record) => record.name));
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
