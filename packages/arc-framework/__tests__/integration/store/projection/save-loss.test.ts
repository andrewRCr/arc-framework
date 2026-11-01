/**
 * Saves timed into the engine's replacement, rebuild, and removal: each interval reached by the save it can catch, in
 * place, by renaming a new file over the path, and by truncating first, with a reader holding the file open, and a run
 * of saves fired at random moments into a run of commands, none of them lost.
 */
import { open, readFile, rm, type FileHandle } from "node:fs/promises";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import {
  gatedLanding, HANDLE_MODES, runSaveLoss, SAVE_MODES, SAVE_OUTCOMES, saveAs, saveThrough, startSaver, type HandleMode,
  type SaveMode, type SaveOutcome,
} from "../../../helpers/store/projection/save-loss.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import {
  prepareRemoval, prepareSwap, SWAP_PATH, SWAP_WRITER, type PrepareSwapOptions,
} from "../../../helpers/store/projection/swap-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { settleAsideCopy } from "../../../../src/lib/store/projection/aside-copies.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";
import { SETTLE_WINDOW_NS, SYSTEM_READ_GATE, wallClockNs } from "../../../../src/lib/store/projection/read-gate.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { swapBatch, type SwapBatchResult, type SwapHooks } from "../../../../src/lib/store/projection/swap.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

/** How many placed saves produced each interval's outcome on this platform, printed once the file's tests end. */
const reached: Record<string, number> = {};
afterAll(() => { console.info(`save-loss placed outcomes on ${process.platform}: ${JSON.stringify(reached)}`); });
function reach(outcome: string): void {
  reached[outcome] = (reached[outcome] ?? 0) + 1;
}

/**
 * Run a batch whose hooks open a reader on the file once any save after the re-check is placed, delete access shared,
 * as an editor or indexer holds it, so the swap moves a held file; the reader closes once the batch ends.
 */
async function whileHeld<T>(file: string, hooks: SwapHooks, batch: (hooks: SwapHooks) => Promise<T>): Promise<T> {
  let reader: FileHandle | undefined;
  try {
    return await batch({ ...hooks, afterRecheck: async (path) => { await hooks.afterRecheck?.(path); reader = await open(file, "r"); } });
  } finally {
    await reader?.close();
  }
}

/** The take-in, second check, and store read every placed save is judged by. */
function judging(prepared: Pick<Awaited<ReturnType<typeof prepareSwap>>, "fixture" | "reference" | "seeded" | "laid">) {
  const takeIn = gatedLanding(prepared.fixture.store);
  const { checkout, location } = prepared.seeded;
  return {
    takeIn,
    /** The command's second check over the copies a batch made. */
    secondCheck: (batch: SwapBatchResult) => runSecondCheck({
      location, checkout, index: batch.index, copies: batch.copies, removals: batch.removals, format: "sha1", takeIn,
      writer: SWAP_WRITER,
    }),
    stored: async () => {
      const read = await prepared.fixture.store.read({ reference: prepared.reference });
      return read.status === "ok" ? read.result.content : null;
    },
    /** A save of content under the stamp the file was laid with, as the editor holding it saves. */
    saved: (content: string) => renderStampedFile({ content, stamp: prepared.laid.base.blob }),
  };
}

async function swapping(options: PrepareSwapOptions = {}) {
  const prepared = await prepareSwap(options);
  directories.push(prepared.seeded.checkout);
  return { ...prepared, ...judging(prepared) };
}

async function removing() {
  const prepared = await prepareRemoval();
  directories.push(prepared.seeded.checkout);
  return { ...prepared, ...judging(prepared) };
}

async function indexOnDisk(location: ProjectionLocation): Promise<ProjectionIndex> {
  const read = await readProjectionIndex(location, true);
  if (read.kind !== "index") throw new Error(`expected an index on disk, found ${read.kind}`);
  return read.index;
}

async function contentAt(file: string): Promise<string> {
  return parseStampedFile(await readFile(file, "utf8")).content;
}

const REFRESHED = "# Cohort: one\n\nBody, refreshed.\n";

describe("a save timed into a replacement", () => {
  for (const mode of SAVE_MODES) {
    it(`is rescued from the aside copy at the first check where it lands after the re-check, saved ${mode}`, async () => {
      const swap = await swapping();
      const content = `# Cohort: one\n\nSaved ${mode} after the re-check.\n`;
      const batch = await whileHeld(swap.file, { afterRecheck: () => saveAs(mode, swap.file, swap.saved(content)) },
        (hooks) => swap.swap({ takeIn: swap.takeIn, hooks }));
      expect(await swap.stored()).toBe(content);
      await swap.secondCheck(batch);
      expect(await swap.stored()).toBe(content);
      reach("replacement: rescued at the first check");
    });

    it(`stands at the path it recreated after the move, the replacement yielding to it, saved ${mode}`, async () => {
      const swap = await swapping();
      const content = `# Cohort: one\n\nSaved ${mode} after the move.\n`;
      const batch = await whileHeld(swap.file, { afterMove: () => saveAs(mode, swap.file, swap.saved(content)) },
        (hooks) => swap.swap({ takeIn: swap.takeIn, hooks }));
      await swap.secondCheck(batch);
      expect(await contentAt(swap.file)).toBe(content);
      expect(batch.index.entries[swap.path]).toMatchObject({ pending: true, base: swap.laid.base });
      expect(await swap.stored()).toBe(REFRESHED);
      reach("replacement: yielded to the save");
    });
  }

  for (const mode of HANDLE_MODES) {
    it(`is rescued at the second check where it writes after the first through a handle opened before the move, saved ${mode}`, async () => {
      const swap = await swapping();
      const content = `# Cohort: one\n\nSaved ${mode} after the first check.\n`;
      const batch = await whileHeld(swap.file, heldThrough(swap.file, mode, swap.saved(content)),
        (hooks) => swap.swap({ takeIn: swap.takeIn, hooks }));
      expect(await swap.stored()).toBe(REFRESHED);
      await swap.secondCheck(batch);
      expect(await swap.stored()).toBe(content);
      reach("replacement: rescued at the second check");
    });
  }

  it("is kept for the next sweep where a save that truncated before the move stalls past the settle window", async () => {
    const swap = await swapping();
    const content = "# Cohort: one\n\nSaved after a stall.\n";
    let handle: FileHandle | undefined;
    const batch = await whileHeld(swap.file, { afterRecheck: async () => { handle = await open(swap.file, "r+"); await handle.truncate(0); } },
      (hooks) => swap.swap({ takeIn: swap.takeIn, hooks }));
    // The host stalls the save past the settle window across the command's second check, as one did on Windows.
    const stalled = { ...SYSTEM_READ_GATE, now: () => wallClockNs() + 2n * SETTLE_WINDOW_NS };
    await runSecondCheck({
      location: swap.seeded.location, checkout: swap.seeded.checkout, index: batch.index, copies: batch.copies,
      removals: batch.removals, format: "sha1", takeIn: swap.takeIn, writer: SWAP_WRITER, gate: stalled,
    });
    await handle?.write(swap.saved(content), 0);
    await handle?.close();
    expect(await swap.stored()).toBe(REFRESHED);
    const entry = (await indexOnDisk(swap.seeded.location)).entries[swap.path];
    const [copy] = entry?.kind === "record" ? entry.copies : [];
    if (entry?.kind !== "record" || copy === undefined) throw new Error("expected the copy kept for the next sweep");
    await settleAsideCopy({
      checkout: swap.seeded.checkout, path: swap.path, entry, copy, format: "sha1", takeIn: swap.takeIn, writer: SWAP_WRITER,
    });
    expect(await swap.stored()).toBe(content);
    reach("replacement: kept past the settle window for the next sweep");
  });
});

describe("a save timed into a rebuild", () => {
  for (const mode of SAVE_MODES) {
    it(`wins where it recreates the absent path before the link, which yields, saved ${mode}`, async () => {
      const swap = await swapping({ guarded: { before: (file) => rm(file) } });
      const content = `# Cohort: one\n\nSaved ${mode} before the rebuild's link.\n`;
      const batch = await swap.swap({
        takeIn: swap.takeIn, hooks: { beforeRebuildLink: () => saveAs(mode, swap.file, swap.saved(content)) },
      });
      await swap.secondCheck(batch);
      expect(await contentAt(swap.file)).toBe(content);
      expect(batch.copies).toEqual([]);
      expect(batch.index.entries[swap.path]).toMatchObject({ pending: true, base: swap.laid.base });
      reach("rebuild: yielded to the save");
    });
  }
});

describe("a save timed into a removal", () => {
  for (const mode of SAVE_MODES) {
    it(`is rescued from the aside copy at the first check where it lands after the re-check, saved ${mode}`, async () => {
      const removal = await removing();
      const content = `# Cohort: one\n\nSaved ${mode} after the removal's re-check.\n`;
      const batch = await whileHeld(removal.file, { afterRecheck: () => saveAs(mode, removal.file, removal.saved(content)) },
        (hooks) => removal.remove({ takeIn: removal.takeIn, hooks }));
      expect(await removal.stored()).toBe(content);
      await removal.secondCheck(batch);
      expect((await indexOnDisk(removal.seeded.location)).entries[removal.path]).toBeUndefined();
      reach("removal: rescued at the first check");
    });

    it(`stays at the path it recreated after the move, pending, and the next removal takes it in first, saved ${mode}`, async () => {
      const removal = await removing();
      const content = `# Cohort: one\n\nSaved ${mode} after the removal's move.\n`;
      const batch = await whileHeld(removal.file, { afterMove: () => saveAs(mode, removal.file, removal.saved(content)) },
        (hooks) => removal.remove({ takeIn: removal.takeIn, hooks }));
      await removal.secondCheck(batch);
      expect(await contentAt(removal.file)).toBe(content);
      const { checkout, location } = removal.seeded;
      const index = await indexOnDisk(location);
      const entry = index.entries[removal.path];
      expect(entry).toMatchObject({ pending: true });
      if (entry?.kind !== "record") throw new Error("expected the removed file's entry");
      // The next command's removal re-checks the file and takes the save in before the file goes.
      const again = await guardReplacement({
        checkout, path: removal.path, entry, staged: null, reference: await readReference(checkout), format: "sha1",
        store: removal.fixture.store, writer: SWAP_WRITER, takeIn: removal.takeIn,
      });
      expect(await removal.stored()).toBe(content);
      if (again.kind !== "replace") throw new Error(`expected the next removal to go ahead, found ${again.cause}`);
      const next = await swapBatch({
        location, checkout, index, files: [{ path: removal.path, replace: again }], readBack: false, writer: SWAP_WRITER,
        format: "sha1", takeIn: removal.takeIn,
      });
      await removal.secondCheck(next);
      expect((await indexOnDisk(location)).entries[removal.path]).toBeUndefined();
      reach("removal: kept pending, taken in by the next removal");
    });
  }

  for (const mode of HANDLE_MODES) {
    it(`is rescued at the second check where it writes after the first through a handle opened before the move, saved ${mode}`, async () => {
      const removal = await removing();
      const content = `# Cohort: one\n\nSaved ${mode} after the removal's first check.\n`;
      const batch = await whileHeld(removal.file, heldThrough(removal.file, mode, removal.saved(content)),
        (hooks) => removal.remove({ takeIn: removal.takeIn, hooks }));
      expect(await removal.stored()).toBe("# Cohort: one\n\nBody.\n");
      await removal.secondCheck(batch);
      expect(await removal.stored()).toBe(content);
      expect((await indexOnDisk(removal.seeded.location)).entries[removal.path]).toBeUndefined();
      reach("removal: rescued at the second check");
    });
  }
});

/** Hooks that open the file for writing after the re-check, before the move, and save through it after the first check. */
function heldThrough(file: string, mode: HandleMode, text: string) {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  return {
    afterRecheck: async () => { handle = await open(file, "r+"); },
    afterFirstCheck: async () => {
      if (handle === undefined) throw new Error("the handle was never opened");
      await saveThrough(handle, mode, text);
      await handle.close();
    },
  };
}

/** Each mode's saves run as several tests, so each stays inside the tier's timeout where a command costs more. */
const RUNS = 10;
const SAVES_PER_RUN = 100;
/** Each mode's counts across its runs, printed once the file's tests end. */
const totals = new Map<SaveMode, Record<SaveOutcome, number>>();
afterAll(() => {
  for (const [mode, outcomes] of totals) {
    console.info(`save-loss randomized on ${process.platform}, saved ${mode}: ${JSON.stringify(outcomes)}`);
  }
});

describe("saves fired at random moments into a run of commands", () => {
  for (const mode of SAVE_MODES) {
    for (let run = 1; run <= RUNS; run += 1) {
      it(`lose none of ${SAVES_PER_RUN} saved ${mode}, each kept in the store, at its path, or aside (${run} of ${RUNS})`, async () => {
        const fixture = createReferenceFixture();
        const reference = fixture.reference("cohort/document", "one");
        const put = await fixture.store.write({
          action: "put", reference, content: "# Cohort: one\n\nBody.\n", expected: null,
          provenance: { verb: "save", lifecycleAction: "save" },
        });
        if (put.status !== "ok") throw new Error("the fixture write was refused");
        const seeded = await seedProjection({ store: fixture.store, files: [{ reference, path: SWAP_PATH }] });
        directories.push(seeded.checkout);
        const saver = startSaver();
        try {
          const counts = await runSaveLoss({
            store: fixture.store, reference, seeded, path: SWAP_PATH, mode, cycles: SAVES_PER_RUN, saver, random: Math.random,
          });
          const total = totals.get(mode) ?? Object.fromEntries(SAVE_OUTCOMES.map((outcome) => [outcome, 0])) as Record<SaveOutcome, number>;
          for (const outcome of SAVE_OUTCOMES) total[outcome] += counts.outcomes[outcome];
          totals.set(mode, total);
          expect(counts.losses).toEqual([]);
        } finally {
          await saver.close();
        }
      });
    }
  }
});
