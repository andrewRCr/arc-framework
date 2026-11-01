/** Removing a projected file: the swap without the link, an edit taken in first, its entry kept until the file is gone. */
import { lstat, open, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deferring, landingCopies, prepareRemoval, SWAP_WRITER, type PrepareRemovalOptions } from "../../../helpers/store/projection/swap-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import type { GitDirectoryFileAccess } from "../../../../src/lib/git/directories.js";
import { createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { sweepAsideFolder } from "../../../../src/lib/store/projection/sweep.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import type { SwapBatchResult } from "../../../../src/lib/store/projection/swap.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";

const directories: string[] = [];
const mark = { reason: "record-archived", remedy: { text: "Move the edit to the archived record's successor." } };
const refusing: TakeInPort = async (request) => ({ answer: "refused", entry: request.entry, mark });
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

const gitFs: GitDirectoryFileAccess = { lstat, readFile: (path) => readFile(path, "utf8"), realpath };
/** A take-in no step in these tests should reach. */
const unreached: TakeInPort = async () => { throw new Error("the take-in was reached"); };

/** Raised by a hook to stop a batch where a command would stop. */
class Stop extends Error {}

/** A prepared removal whose checkout this file removes after each test. */
async function prepared(options: PrepareRemovalOptions = {}) {
  const removal = await prepareRemoval(options);
  directories.push(removal.seeded.checkout);
  /** The command's second check over the copies a batch made, under the take-in given. */
  const secondCheck = (batch: SwapBatchResult, takeIn: TakeInPort) => runSecondCheck({
    location: removal.seeded.location, checkout: removal.seeded.checkout, index: batch.index, copies: batch.copies,
    removals: batch.removals, format: "sha1", takeIn, writer: SWAP_WRITER,
  });
  return { ...removal, secondCheck };
}

/** Save an edit over the file under the stamp it carries, as an editor holding it would. */
function editTo(content: string): (file: string) => Promise<void> {
  return async (file) => {
    const { stamp } = parseStampedFile(await readFile(file, "utf8"));
    if (stamp === null) throw new Error("expected the file's stamp");
    await writeFile(file, renderStampedFile({ content, stamp }));
  };
}

/** Ignore the projected roots, as the sweep's ignore check requires before it writes. */
async function ignoreProjectedRoots(checkout: string): Promise<void> {
  const lines = [".arc/active/", ".arc/backlog/", ".arc/completed/", ".arc/system/.local/"];
  await writeFile(join(checkout, ".git/info/exclude"), lines.map((line) => `${line}\n`).join(""));
  await writeFile(join(checkout, ".gitignore"), ".arc/user/*/\n");
}

/** The next command's sweep, with the index on disk, its writer another instance of this process. */
async function sweepAfter(removal: Awaited<ReturnType<typeof prepared>>, takeIn: TakeInPort) {
  const { checkout, location } = removal.seeded;
  return sweepAsideFolder({
    location, checkout, index: await indexOnDisk(location), format: "sha1", takeIn,
    writer: { ...SWAP_WRITER, processInstance: "a-later-run" },
    guard: { root: checkout, identity: SlugSchema.parse("andrew"), exec: createExecaGitExecInput(), fs: gitFs },
  });
}

async function entryOnDisk(location: Parameters<typeof readProjectionIndex>[0], path: string): Promise<RecordEntry | undefined> {
  const entry = (await indexOnDisk(location)).entries[path];
  if (entry !== undefined && entry.kind !== "record") throw new Error(`expected a record entry at ${path}`);
  return entry;
}

async function indexOnDisk(location: Parameters<typeof readProjectionIndex>[0]): Promise<ProjectionIndex> {
  const read = await readProjectionIndex(location, true);
  if (read.kind !== "index") throw new Error(`expected an index on disk, found ${read.kind}`);
  return read.index;
}

describe("removing a file", () => {
  it("takes the file's edit in before it goes, and drops its entry once the file and its last aside copy are gone", async () => {
    const edited = "# Cohort: one\n\nEdited before the removal.\n";
    const removal = await prepared({ guarded: { before: editTo(edited), takeIn: landingCopies } });
    expect(removal.guarded.kind).toBe("replace");
    const stored = await removal.fixture.store.read({ reference: removal.reference });
    expect(stored.status === "ok" && stored.result.content).toBe(edited);
    const batch = await removal.remove();
    expect(await readStat(removal.file)).toBeNull();
    expect(batch.index.entries[removal.path]).toMatchObject({ pending: true, stat: null });
    await removal.secondCheck(batch, landingCopies(removal.fixture.store));
    expect((await indexOnDisk(removal.seeded.location)).entries[removal.path]).toBeUndefined();
  });

  it("re-checks the file after its edit is taken in, taking in an edit saved meanwhile before the file goes", async () => {
    let saves = 0;
    const savingOnce = (store: Parameters<typeof landingCopies>[0]): TakeInPort => async (request) => {
      const landed = await landingCopies(store)(request);
      saves += 1;
      if (saves === 1) await editTo("# Cohort: one\n\nSaved while the first edit went in.\n")(join(request.checkout, request.path));
      return landed;
    };
    const removal = await prepared({ guarded: { before: editTo("# Cohort: one\n\nThe first edit.\n"), takeIn: savingOnce } });
    expect(removal.guarded.kind).toBe("replace");
    const stored = await removal.fixture.store.read({ reference: removal.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nSaved while the first edit went in.\n");
  });

  it("keeps a removed file's entry while an aside copy of its path remains, which the next sweep links back, pending", async () => {
    const removal = await prepared();
    const batch = await removal.remove();
    const [made] = batch.copies;
    if (made === undefined) throw new Error("expected the removal's aside copy");
    const { stamp } = parseStampedFile(await readFile(join(removal.seeded.checkout, made.copy), "utf8"));
    const saved = "# Cohort: one\n\nSaved into the copy.\n";
    await writeFile(join(removal.seeded.checkout, made.copy), renderStampedFile({ content: saved, stamp: stamp ?? "" }));
    const kept = await removal.secondCheck(batch, deferring);
    expect(kept.settled.map((each) => each.settlement.kind)).toEqual(["kept"]);
    expect(await entryOnDisk(removal.seeded.location, removal.path))
      .toMatchObject({ pending: true, stat: null, copies: [{ name: made.copy }] });
    // The next sweep links the copy back to its absent path as it is, a pending file the next refresh removes.
    await ignoreProjectedRoots(removal.seeded.checkout);
    const swept = await sweepAfter(removal, unreached);
    expect(swept.swept.map((each) => each.outcome.kind)).toEqual(["linked-back"]);
    expect(await readFile(removal.file, "utf8")).toContain("Saved into the copy.");
    expect(await entryOnDisk(removal.seeded.location, removal.path)).toMatchObject({ pending: true, copies: [] });
  });

  it("links an edit refused at the first check back to its path, marked refused and pending, its entry kept", async () => {
    const edited = "# Cohort: one\n\nEdited to an archived record.\n";
    const removal = await prepared();
    const batch = await removal.remove({ takeIn: refusing, hooks: { afterRecheck: async () => editTo(edited)(removal.file) } });
    expect(await readFile(removal.file, "utf8")).toContain(edited.trim().split("\n").at(-1) ?? "");
    expect(batch.index.entries[removal.path]).toMatchObject({ pending: true, refused: mark, copies: [] });
    await removal.secondCheck(batch, landingCopies(removal.fixture.store));
    expect(await entryOnDisk(removal.seeded.location, removal.path)).toMatchObject({ pending: true, refused: mark });
  });

  it("leaves the file at its path, pending, where the take-in defers or clashes", async () => {
    const markers = { length: 7, sets: [{ shows: "checkout" as const }] };
    const clashing = () => (async (request) => ({ answer: "clashed", entry: { ...request.entry, markers } })) as TakeInPort;
    for (const takeIn of [() => deferring, clashing]) {
      const removal = await prepared({ guarded: { before: editTo("# Cohort: one\n\nAn edit.\n"), takeIn } });
      expect(removal.guarded).toMatchObject({ kind: "unreplaced", entry: { pending: true } });
      expect(await readFile(removal.file, "utf8")).toContain("An edit.");
    }
  });

  it("drops the entry of a file already gone at its removal at the batch's second write, no copy made", async () => {
    const removal = await prepared({ guarded: { before: (file) => rm(file) } });
    const batch = await removal.remove();
    expect(batch.copies).toEqual([]);
    expect(await entryOnDisk(removal.seeded.location, removal.path)).toBeUndefined();
  });

  it("keeps an edited copy unsent where a save recreated the removed file's path, even with the file's old bytes", async () => {
    const removal = await prepared();
    const laid = await readFile(removal.file, "utf8");
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    const { stamp } = parseStampedFile(laid);
    const edit = renderStampedFile({ content: "# Cohort: one\n\nSaved through a held handle.\n", stamp: stamp ?? "" });
    const batch = await removal.remove({
      takeIn: landingCopies(removal.fixture.store),
      hooks: {
        afterRecheck: async () => { handle = await open(removal.file, "r+"); },
        afterMove: async () => {
          await handle?.truncate(0);
          await handle?.write(edit, 0);
          await handle?.close();
          // An editor saving its unchanged buffer over the path the file left.
          await writeFile(removal.file, laid);
        },
      },
    });
    expect(batch.copies.map((each) => each.path)).toEqual([removal.path]);
    expect(await readFile(join(removal.seeded.checkout, batch.copies[0]?.copy ?? ""), "utf8")).toBe(edit);
    const stored = await removal.fixture.store.read({ reference: removal.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nBody.\n");
  });

  it("leaves a withheld file at its path, its entry as it was, reaching no take-in", async () => {
    const removal = await prepared({ withheld: true, guarded: { takeIn: () => unreached } });
    expect(removal.guarded).toEqual({ kind: "unreplaced", cause: "withheld", entry: removal.laid });
    expect(await readFile(removal.file, "utf8")).toContain("Body.");
  });

  it("links back the copy a removal stopped after its move left, the entry still pending, at the next sweep", async () => {
    const removal = await prepared();
    await removal.remove({ hooks: { afterMove: async () => { throw new Stop(); } } }).catch((error: unknown) => {
      if (!(error instanceof Stop)) throw error;
    });
    expect(await readStat(removal.file)).toBeNull();
    await ignoreProjectedRoots(removal.seeded.checkout);
    const swept = await sweepAfter(removal, unreached);
    expect(swept.swept.map((each) => each.outcome.kind)).toEqual(["linked-back"]);
    expect(await readFile(removal.file, "utf8")).toContain("Body.");
    expect(await entryOnDisk(removal.seeded.location, removal.path)).toMatchObject({ pending: true, copies: [] });
  });
});

describe("removing a file at a path the projection now lays another record at", () => {
  it("takes the leaving file's edit in against its own record, and deleting its copy leaves the path pending for the arrival", async () => {
    const edited = "# Cohort: one\n\nThe leaving file's edit.\n";
    const removal = await prepared({ relaid: true, guarded: { before: editTo(edited), takeIn: landingCopies } });
    const stored = await removal.fixture.store.read({ reference: removal.reference });
    expect(stored.status === "ok" && stored.result.content).toBe(edited);
    const batch = await removal.remove();
    await removal.secondCheck(batch, landingCopies(removal.fixture.store));
    expect(await readStat(removal.file)).toBeNull();
    expect(await entryOnDisk(removal.seeded.location, removal.path))
      .toMatchObject({ reference: removal.reference, stat: null, pending: true, copies: [] });
  });

  it("links an edit refused at the first check back there, the entry the leaving record's while it stands", async () => {
    const removal = await prepared({ relaid: true });
    const batch = await removal.remove({ takeIn: refusing, hooks: { afterRecheck: async () => editTo("# Cohort: one\n\nRefused.\n")(removal.file) } });
    await removal.secondCheck(batch, landingCopies(removal.fixture.store));
    expect(await readFile(removal.file, "utf8")).toContain("Refused.");
    expect(await entryOnDisk(removal.seeded.location, removal.path)).toMatchObject({ reference: removal.reference, pending: true, refused: mark });
  });

  it("puts a copy refused at the second check back, holding the arrival back, and takes it in against the leaving record", async () => {
    const removal = await prepared({ relaid: true });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    const batch = await removal.remove({ hooks: { afterRecheck: async () => { handle = await open(removal.file, "r+"); } } });
    const { stamp } = parseStampedFile(await readFile(join(removal.seeded.checkout, batch.copies[0]?.copy ?? ""), "utf8"));
    const saved = renderStampedFile({ content: "# Cohort: one\n\nSaved through a held handle.\n", stamp: stamp ?? "" });
    await handle?.truncate(0);
    await handle?.write(saved, 0);
    await handle?.close();
    const checked = await removal.secondCheck(batch, refusing);
    expect(checked.settled.map((each) => each.settlement)).toMatchObject([{ kind: "returned", how: "linked-back", held: "refused" }]);
    const held = await entryOnDisk(removal.seeded.location, removal.path);
    expect(held).toMatchObject({ reference: removal.reference, pending: true, refused: mark });
    if (held === undefined) throw new Error("expected the leaving record's entry");
    // The next command's removal re-checks the file and takes the edit in against the record it was projected from.
    const retried = await guardReplacement({
      checkout: removal.seeded.checkout, path: removal.path, entry: held, staged: null,
      reference: await readReference(removal.seeded.checkout), format: "sha1", store: removal.fixture.store, writer: SWAP_WRITER,
      takeIn: landingCopies(removal.fixture.store),
    });
    expect(retried.kind).toBe("replace");
    const stored = await removal.fixture.store.read({ reference: removal.reference });
    expect(stored.status === "ok" && stored.result.content).toBe("# Cohort: one\n\nSaved through a held handle.\n");
  });
});
