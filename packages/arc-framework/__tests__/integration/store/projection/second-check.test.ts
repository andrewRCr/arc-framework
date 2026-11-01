/** The second check over swapped files: each aside copy checked again at the command's end, and settled. */
import { link, open, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deferring, landingCopies, prepareSwap, SWAP_WRITER, type PrepareSwapOptions,
} from "../../../helpers/store/projection/swap-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { settleAsideCopy } from "../../../../src/lib/store/projection/aside-copies.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { AsideCopyRecord, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { SETTLE_WINDOW_NS, SYSTEM_READ_GATE, wallClockNs } from "../../../../src/lib/store/projection/read-gate.js";
import { runSecondCheck, type SecondCheckInput } from "../../../../src/lib/store/projection/second-check.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import type { SwapHooks } from "../../../../src/lib/store/projection/swap.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

/**
 * A file swapped with a handle held open from before its move, so a save can still write into the aside copy, and a
 * second check over the copies the swap made.
 */
async function swappedWithHandle(options: PrepareSwapOptions = {}, hooks: SwapHooks = {}) {
  const prepared = await prepareSwap(options);
  directories.push(prepared.seeded.checkout);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  const result = await prepared.swap({
    hooks: { ...hooks, afterRecheck: async (path) => { handle = await open(prepared.file, "r+"); await hooks.afterRecheck?.(path); } },
  });
  /** Write a whole save through the handle opened before the move, as an editor holding the file would. */
  const writeThroughHandle = async (content: string): Promise<void> => {
    if (handle === undefined) throw new Error("no handle was opened");
    const text = renderStampedFile({ content, stamp: prepared.laid.base.blob });
    await handle.truncate(0);
    await handle.write(text, 0);
    await handle.close();
  };
  const secondCheck = (takeIn: TakeInPort, overrides: Partial<SecondCheckInput> = {}) => runSecondCheck({
    location: prepared.seeded.location, checkout: prepared.seeded.checkout, index: result.index, copies: result.copies,
    format: "sha1", takeIn, writer: SWAP_WRITER, ...overrides,
  });
  return { ...prepared, result, writeThroughHandle, secondCheck };
}

describe("the second check", () => {
  it("finds a save written through a handle opened before the move, landing after the first check", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nSaved through a held handle.\n");
    const [made] = swapped.result.copies;
    if (made === undefined) throw new Error("expected the swap's aside copy");
    const checked = await swapped.secondCheck(landingCopies(swapped.fixture.store));
    const stored = await swapped.fixture.store.read({ reference: swapped.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nSaved through a held handle.\n");
    expect(await readStat(join(swapped.seeded.checkout, made.copy))).toBeNull();
    expect(checked.index.entries[swapped.path]).toMatchObject({ copies: [] });
    expect((await onDisk(swapped.seeded.location, swapped.path)).copies).toEqual([]);
    expect(await readFile(swapped.file, "utf8")).toContain("Body, refreshed.");
  });

  it("keeps a copy whose take-in defers, for the next command's sweep, whose step takes it in", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nSaved, then deferred.\n");
    const checked = await swapped.secondCheck(deferring);
    expect(checked.settled.map((each) => each.settlement.kind)).toEqual(["kept"]);
    const kept = await onDisk(swapped.seeded.location, swapped.path);
    const [copy] = kept.copies;
    if (copy === undefined) throw new Error("expected the kept copy's record on disk");
    const later = await settleAsideCopy({
      checkout: swapped.seeded.checkout, path: swapped.path, entry: kept, copy, format: "sha1",
      takeIn: landingCopies(swapped.fixture.store), writer: SWAP_WRITER,
    });
    expect(later).toMatchObject({ kind: "deleted", entry: { copies: [] } });
    const stored = await swapped.fixture.store.read({ reference: swapped.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nSaved, then deferred.\n");
  });
});

describe("a copy whose edit the take-in refuses", () => {
  const mark = { reason: "malformed-entry", remedy: { text: "Repair the malformed entry, then save again." } };
  const refusing: TakeInPort = async (request) => ({ answer: "refused", entry: request.entry, mark });

  it("is swapped back onto a path still holding the replacement, the file pending and refused, and reported", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nA malformed save.\n");
    const checked = await swapped.secondCheck(refusing);
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "returned", how: "swapped-back", held: "refused" }]);
    expect(await readFile(swapped.file, "utf8")).toBe(renderStampedFile({ content: "# Cohort: one\n\nA malformed save.\n", stamp: swapped.laid.base.blob }));
    const entry = await onDisk(swapped.seeded.location, swapped.path);
    expect(entry).toMatchObject({ pending: true, refused: mark });
    const [made] = swapped.result.copies;
    if (made === undefined) throw new Error("expected the swap's aside copy");
    expect(entry.copies.map((record) => record.name)).not.toContain(made.copy);
    expect(await readStat(join(swapped.seeded.checkout, made.copy))).toBeNull();
    const [replacement] = entry.copies;
    if (replacement === undefined) throw new Error("expected the replacement's aside copy");
    expect(await readFile(join(swapped.seeded.checkout, replacement.name), "utf8")).toContain("Body, refreshed.");
    // The replacement holds what its swap back moved, so the next sweep deletes it as no edit.
    const swept = await settleAsideCopy({
      checkout: swapped.seeded.checkout, path: swapped.path, entry, copy: replacement, format: "sha1", takeIn: refusing, writer: SWAP_WRITER,
    });
    expect(swept).toMatchObject({ kind: "deleted", entry: { copies: [] } });
  });

  it("links a refused copy back to a path gone absent before the second check, the file pending", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nA malformed save.\n");
    await rm(swapped.file);
    const checked = await swapped.secondCheck(refusing);
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "returned", how: "linked-back", held: "refused" }]);
    expect(await readFile(swapped.file, "utf8")).toContain("A malformed save.");
    expect(await onDisk(swapped.seeded.location, swapped.path)).toMatchObject({ pending: true, refused: mark, copies: [] });
    const [made] = swapped.result.copies;
    if (made === undefined) throw new Error("expected the swap's aside copy");
    expect(await readStat(join(swapped.seeded.checkout, made.copy))).toBeNull();
  });

  it("keeps a refused copy whose path was saved over aside, reported with its path, and no later sweep sends it", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nA malformed save.\n");
    const later = renderStampedFile({ content: "# Cohort: one\n\nA later save.\n", stamp: swapped.staged.base.blob });
    const savingOver: TakeInPort = async (request) => { await rm(swapped.file); await writeFile(swapped.file, later); return refusing(request); };
    const checked = await swapped.secondCheck(savingOver);
    const [made] = swapped.result.copies;
    expect(checked.settled.map((each) => each.settlement))
      .toMatchObject([{ kind: "held-aside", held: "refused", path: swapped.path, copy: made?.copy }]);
    expect(await readFile(swapped.file, "utf8")).toBe(later);
    const kept = await onDisk(swapped.seeded.location, swapped.path);
    const [copy] = kept.copies;
    if (copy === undefined) throw new Error("expected the kept copy's record");
    const swept = await settleAsideCopy({
      checkout: swapped.seeded.checkout, path: swapped.path, entry: kept, copy, format: "sha1",
      takeIn: landingCopies(swapped.fixture.store), writer: SWAP_WRITER,
    });
    expect(swept).toMatchObject({ kind: "moved-on", path: swapped.path });
    const stored = await swapped.fixture.store.read({ reference: swapped.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nBody, refreshed.\n");
  });

  it("is swapped back past a reader that refuses the move for a moment, as one holding the file does on Windows", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nA malformed save.\n");
    let refusals = 2;
    const busy = async (from: string, to: string) => {
      if (refusals-- > 0) throw Object.assign(new Error("resource busy"), { code: "EBUSY" });
      await rename(from, to);
    };
    const checked = await swapped.secondCheck(refusing, { fs: { rename: busy }, retrySleep: async () => undefined });
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "returned", how: "swapped-back", held: "refused" }]);
    expect(await readFile(swapped.file, "utf8")).toContain("A malformed save.");
  });

  it("stays aside where a save recreates the path while it is swapped back, the save and the replacement kept", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nA malformed save.\n");
    const save = renderStampedFile({ content: "# Cohort: one\n\nSaved mid-swap.\n", stamp: swapped.staged.base.blob });
    const savingFirst = async (existing: string, path: string) => { await writeFile(path, save); await link(existing, path); };
    const checked = await swapped.secondCheck(refusing, { fs: { link: savingFirst } });
    const [made] = swapped.result.copies;
    if (made === undefined) throw new Error("expected the swap's aside copy");
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "held-aside", held: "refused", copy: made.copy }]);
    expect(await readFile(swapped.file, "utf8")).toBe(save);
    const entry = await onDisk(swapped.seeded.location, swapped.path);
    expect(entry.copies.map((record) => record.name)).toContain(made.copy);
    const replacement = entry.copies.find((record) => record.name !== made.copy);
    if (replacement === undefined) throw new Error("expected the replacement's aside copy");
    expect(await readFile(join(swapped.seeded.checkout, replacement.name), "utf8")).toContain("Body, refreshed.");
    expect(await readFile(join(swapped.seeded.checkout, made.copy), "utf8")).toContain("A malformed save.");
  });

  it("stays aside where a save recreates an absent path while it is linked back, the save kept", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nA malformed save.\n");
    await rm(swapped.file);
    const save = renderStampedFile({ content: "# Cohort: one\n\nSaved mid-link.\n", stamp: swapped.staged.base.blob });
    const savingFirst = async (existing: string, path: string) => { await writeFile(path, save); await link(existing, path); };
    const checked = await swapped.secondCheck(refusing, { fs: { link: savingFirst } });
    const [made] = swapped.result.copies;
    if (made === undefined) throw new Error("expected the swap's aside copy");
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "held-aside", held: "refused", copy: made.copy }]);
    expect(await readFile(swapped.file, "utf8")).toBe(save);
    expect((await onDisk(swapped.seeded.location, swapped.path)).copies.map((record) => record.name)).toEqual([made.copy]);
    expect(await readFile(join(swapped.seeded.checkout, made.copy), "utf8")).toContain("A malformed save.");
  });
});

describe("a copy whose take-in clashes", () => {
  const markers = { length: 7, sets: [{ shows: "checkout" as const }] };
  const clashing: TakeInPort = async (request) => ({ answer: "clashed", entry: { ...request.entry, markers } });

  it("at the second check is swapped back to its path, pending and held by its markers, and reported", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nA clashing save.\n");
    const checked = await swapped.secondCheck(clashing);
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "returned", how: "swapped-back", held: "clashed" }]);
    expect(await readFile(swapped.file, "utf8")).toContain("A clashing save.");
    expect(await onDisk(swapped.seeded.location, swapped.path)).toMatchObject({ pending: true, markers, refused: null });
  });

  it("at the sweep, its path saved over, stays aside, reported with its path", async () => {
    const swapped = await swappedWithHandle();
    await swapped.writeThroughHandle("# Cohort: one\n\nA clashing save.\n");
    await swapped.secondCheck(deferring);
    const kept = await onDisk(swapped.seeded.location, swapped.path);
    const [copy] = kept.copies;
    if (copy === undefined) throw new Error("expected the kept copy's record");
    const later = renderStampedFile({ content: "# Cohort: one\n\nA later save.\n", stamp: swapped.staged.base.blob });
    const savingOver: TakeInPort = async (request) => { await rm(swapped.file); await writeFile(swapped.file, later); return clashing(request); };
    const swept = await settleAsideCopy({
      checkout: swapped.seeded.checkout, path: swapped.path, entry: kept, copy, format: "sha1", takeIn: savingOver, writer: SWAP_WRITER,
    });
    expect(swept).toMatchObject({ kind: "held-aside", held: "clashed", path: swapped.path, copy: copy.name });
    expect(await readStat(join(swapped.seeded.checkout, copy.name))).not.toBeNull();
    expect(await readFile(swapped.file, "utf8")).toBe(later);
  });
});

/** A read gate whose clock runs past the settle window, so an empty copy reads as old as a stalled save leaves it. */
const aged = { ...SYSTEM_READ_GATE, now: () => wallClockNs() + 2n * SETTLE_WINDOW_NS };

/**
 * A file swapped while a save holds it truncated, as an editor that empties a file before writing it does, and a second
 * check over the copies the swap made, its clock past the settle window.
 */
async function truncatedBeforeMove(options: PrepareSwapOptions = {}) {
  const prepared = await prepareSwap(options);
  directories.push(prepared.seeded.checkout);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  const result = await prepared.swap({
    hooks: { afterRecheck: async () => { handle = await open(prepared.file, "r+"); await handle.truncate(0); } },
  });
  const [made] = result.copies;
  if (made === undefined || handle === undefined) throw new Error("expected the swap's aside copy and the save's handle");
  const saving = handle;
  /** Write the save's text through its handle, after the truncation, as the editor's write does. */
  const finishSave = async (text: string): Promise<void> => { await saving.write(text, 0); await saving.close(); };
  const secondCheck = (takeIn: TakeInPort) => runSecondCheck({
    location: prepared.seeded.location, checkout: prepared.seeded.checkout, index: result.index, copies: result.copies,
    format: "sha1", takeIn, writer: SWAP_WRITER, gate: aged,
  });
  /** The next command's step over the copy, as its sweep runs it, its clock past the settle window too. */
  const sweepStep = async (takeIn: TakeInPort) => settleAsideCopy({
    checkout: prepared.seeded.checkout, path: prepared.path, entry: await onDisk(prepared.seeded.location, prepared.path),
    copy: await recorded(prepared.seeded.location, prepared.path, made.copy), format: "sha1", takeIn, writer: SWAP_WRITER, gate: aged,
  });
  return { ...prepared, made, saving, finishSave, secondCheck, sweepStep };
}

describe("a copy left empty by a save that truncates before writing", () => {
  it("is kept by the second check past the settle window, and the next sweep takes in the save written since", async () => {
    const swapped = await truncatedBeforeMove();
    const checked = await swapped.secondCheck(landingCopies(swapped.fixture.store));
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "kept", answer: "empty" }]);
    expect((await onDisk(swapped.seeded.location, swapped.path)).copies.map((record) => record.name)).toEqual([swapped.made.copy]);
    await swapped.finishSave(renderStampedFile({ content: "# Cohort: one\n\nWritten after a stall.\n", stamp: swapped.laid.base.blob }));
    expect(await swapped.sweepStep(landingCopies(swapped.fixture.store))).toMatchObject({ kind: "deleted", entry: { copies: [] } });
    const stored = await swapped.fixture.store.read({ reference: swapped.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nWritten after a stall.\n");
  });

  it("still empty at the next sweep, is deleted there as a deleted file, the record untouched", async () => {
    const swapped = await truncatedBeforeMove();
    await swapped.secondCheck(landingCopies(swapped.fixture.store));
    await swapped.saving.close();
    expect(await readStat(join(swapped.seeded.checkout, swapped.made.copy))).not.toBeNull();
    expect(await swapped.sweepStep(landingCopies(swapped.fixture.store))).toMatchObject({ kind: "deleted", entry: { copies: [] } });
    expect(await readStat(join(swapped.seeded.checkout, swapped.made.copy))).toBeNull();
    const stored = await swapped.fixture.store.read({ reference: swapped.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nBody, refreshed.\n");
  });

  it("leaves the second check deleting a copy holding what its swap moved, and one that is not a file", async () => {
    const plain = await prepareSwap();
    directories.push(plain.seeded.checkout);
    const unsaved = await plain.swap();
    const linked = await prepareSwap();
    directories.push(linked.seeded.checkout);
    const relinked = await linked.swap();
    const [copy] = relinked.copies;
    if (copy === undefined) throw new Error("expected the swap's aside copy");
    await rm(join(linked.seeded.checkout, copy.copy));
    await symlink(linked.file, join(linked.seeded.checkout, copy.copy));
    for (const [swapped, result] of [[plain, unsaved], [linked, relinked]] as const) {
      const checked = await runSecondCheck({
        location: swapped.seeded.location, checkout: swapped.seeded.checkout, index: result.index, copies: result.copies,
        format: "sha1", takeIn: landingCopies(swapped.fixture.store), writer: SWAP_WRITER, gate: aged,
      });
      expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "deleted", entry: { copies: [] } }]);
      for (const { copy: name } of result.copies) expect(await readStat(join(swapped.seeded.checkout, name))).toBeNull();
    }
  });

  it("of a file other than Markdown, is neither sent nor deleted by the second check", async () => {
    const swapped = await truncatedBeforeMove({ path: ".arc/user/andrew/scratch/two.txt", contents: ["plain: text\n", "plain: refreshed\n"] });
    const checked = await swapped.secondCheck(landingCopies(swapped.fixture.store));
    await swapped.saving.close();
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "kept", answer: "empty" }]);
    expect(await readStat(join(swapped.seeded.checkout, swapped.made.copy))).not.toBeNull();
    const stored = await swapped.fixture.store.read({ reference: swapped.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("plain: refreshed\n");
  });
});

describe("a save through a handle held across the move", () => {
  it("landing after the first check and after a later save to the path is kept, reported, the later save standing", async () => {
    const swapped = await swappedWithHandle();
    const later = renderStampedFile({ content: "# Cohort: one\n\nA later save.\n", stamp: swapped.staged.base.blob });
    await rm(swapped.file);
    await writeFile(swapped.file, later);
    await swapped.writeThroughHandle("# Cohort: one\n\nAn older buffer's save.\n");
    const checked = await swapped.secondCheck(landingCopies(swapped.fixture.store));
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "moved-on", path: swapped.path }]);
    expect(await readFile(swapped.file, "utf8")).toBe(later);
    const stored = await swapped.fixture.store.read({ reference: swapped.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nBody, refreshed.\n");
  });

  it("is skipped by the second check where the index no longer records its copy", async () => {
    const swapped = await swappedWithHandle();
    const checked = await swapped.secondCheck(deferring, { copies: [{ path: swapped.path, copy: "gone" }] });
    expect(checked.settled).toEqual([]);
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

/** The record the index on disk holds for one aside copy of a path. */
async function recorded(location: Parameters<typeof readProjectionIndex>[0], path: string, copy: string): Promise<AsideCopyRecord> {
  const found = (await onDisk(location, path)).copies.find((record) => record.name === copy);
  if (found === undefined) throw new Error(`expected the index to record ${copy}`);
  return found;
}
