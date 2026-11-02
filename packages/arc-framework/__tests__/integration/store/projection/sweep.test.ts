/** The sweep over a seeded projection: the copies and staged files a stopped or exited writer left, taken over. */
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { landingCopies, prepareSwap, SWAP_PATH, SWAP_WRITER, type PrepareSwapOptions } from "../../../helpers/store/projection/swap-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import type { GitDirectoryFileAccess } from "../../../../src/lib/git/directories.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { PROJECTION_REFERENCE, readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { recordWriteBackSent } from "../../../../src/lib/store/projection/aside-copies.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import type { SwapHooks } from "../../../../src/lib/store/projection/swap.js";
import { sweepAsideFolder, type SweepInput } from "../../../../src/lib/store/projection/sweep.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

const execInput = createExecaGitExecInput();
const gitFs: GitDirectoryFileAccess = { lstat, readFile: (path) => readFile(path, "utf8"), realpath };
const identity = SlugSchema.parse("andrew");
const EXCLUDE_LINES = [".arc/active/", ".arc/backlog/", ".arc/completed/", ".arc/system/.local/"];
/** Another instance of this process, so every copy a swap test's writer made reads as left by one that has exited. */
const SWEEPER = { ...SWAP_WRITER, processInstance: "sweep-test" };
/** A process other than the one whose copies a swap test makes, in the same process scope. */
const SWEEPER_ELSEWHERE = { pid: SWAP_WRITER.pid + 1, processInstance: "sweep-test", processScope: SWAP_WRITER.processScope };
/** A take-in no sweep in these tests should reach. */
const unreached: TakeInPort = async () => { throw new Error("the take-in was reached"); };
/** A take-in that finds no edit, as write-back's read gate does in a symbolic link. */
const noEdit: TakeInPort = async (request) => ({ answer: "no-edit", entry: request.entry });

/** Raised by a hook to stop a swap where a command would stop. */
class Stop extends Error {}

/** A swap over a checkout whose projected roots are ignored, stopped where `stop` names, or run whole. */
async function leftBy(
  stop: keyof SwapHooks | null, options: PrepareSwapOptions = {},
  hooksFor: (prepared: Awaited<ReturnType<typeof prepareSwap>>) => SwapHooks = () => ({}),
) {
  const prepared = await prepareSwap(options);
  directories.push(prepared.seeded.checkout);
  const hooks = hooksFor(prepared);
  await writeFile(join(prepared.seeded.checkout, ".git/info/exclude"), EXCLUDE_LINES.map((line) => `${line}\n`).join(""));
  await writeFile(join(prepared.seeded.checkout, ".gitignore"), ".arc/user/*/\n");
  const stopping: SwapHooks = stop === null ? hooks : { ...hooks, [stop]: async (path: string) => {
    await hooks[stop]?.(path);
    throw new Stop(`stopped ${stop}`);
  } };
  try {
    await prepared.swap({ hooks: stopping });
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
  }
  const { checkout, location } = prepared.seeded;
  /** Sweep with the index on disk, as the next command's start reads it. */
  const sweep = async (takeIn: TakeInPort, overrides: Partial<SweepInput> = {}) => sweepAsideFolder({
    ignoreRules: (await readProjectionConfiguration(createExecaGitExec(), checkout)).ignoreRules,
    readIgnoreRules: async () => (await readProjectionConfiguration(createExecaGitExec(), checkout)).ignoreRules,
    location, checkout, index: await indexOnDisk(location), format: "sha1", takeIn, writer: SWEEPER,
    guard: { root: checkout, identity, exec: execInput, fs: gitFs }, ...overrides,
  });
  return { ...prepared, checkout, location, sweep };
}

async function indexOnDisk(location: Parameters<typeof readProjectionIndex>[0]): Promise<ProjectionIndex> {
  const read = await readProjectionIndex(location, true);
  if (read.kind !== "index") throw new Error(`expected an index on disk, found ${read.kind}`);
  return read.index;
}

async function entryOnDisk(location: Parameters<typeof readProjectionIndex>[0], path: string): Promise<RecordEntry> {
  const entry = (await indexOnDisk(location)).entries[path];
  if (entry?.kind !== "record") throw new Error(`expected a record entry at ${path}`);
  return entry;
}

describe("the sweep", () => {
  it.each([
    ["landed", false], ["landed", true], ["deferred", false], ["deferred", true],
  ] as const)("keeps the next edited copy after a %s send, with its path absent %s", async (answer, absent) => {
    const h = await leftBy(null);
    const index = await indexOnDisk(h.location);
    const entry = index.entries[h.path];
    const [first] = entry?.kind === "record" ? entry.copies : [];
    if (entry?.kind !== "record" || first === undefined) throw new Error("expected a copy");
    const second = { ...first, name: nameAsideFile({ path: h.path, base: h.laid.base.blob, writer: SWAP_WRITER, role: "aside" }) };
    const saved = (body: string) => renderStampedFile({ content: `# Cohort: one\n\n${body}\n`, stamp: h.laid.base.blob });
    await writeFile(join(h.checkout, first.name), saved("First edit."));
    await writeFile(join(h.checkout, second.name), saved("Older buffer edit."));
    await writeProjectionIndex(h.location, { ...index, entries: { ...index.entries, [h.path]: { ...entry, copies: [first, second] } } });
    const sent: (string | null)[] = [];
    const land = landingCopies(h.fixture.store);
    const takeIn: TakeInPort = async (request) => {
      sent.push(request.copy);
      const marked = recordWriteBackSent(request.entry, request.copy);
      const result = answer === "landed" ? await land({ ...request, entry: marked })
        : { answer: "deferred" as const, entry: marked };
      if (absent) await rm(h.file, { force: true });
      return result;
    };

    const swept = await h.sweep(takeIn);

    expect(sent).toEqual([first.name]);
    expect(swept.swept[1]).toMatchObject({ copy: second.name, outcome: { kind: "moved-on" } });
    expect(await readFile(join(h.checkout, second.name), "utf8")).toBe(saved("Older buffer edit."));
    if (absent) expect(await readStat(h.file)).toBeNull();
    if (answer === "landed") {
      const stored = await h.fixture.store.read({ reference: h.reference });
      expect(stored.status === "ok" && stored.result.content).toContain("First edit.");
    }
  });

  it.each(["recorded", "unrecorded", "no-index"])("preserves a %s directory copy and permits retry after repair", async (mode) => {
    const h = await leftBy("afterMove");
    const index = await indexOnDisk(h.location);
    const entry = index.entries[h.path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("expected a copy");
    const copy = entry.copies[0].name;
    const copyPath = join(h.checkout, copy);
    await rm(copyPath);
    await mkdir(copyPath);
    await writeFile(join(copyPath, "saved.txt"), "preserved contents");
    const overrides: Partial<SweepInput> = mode === "no-index" ? { index: null } : mode === "unrecorded" ? {
      index: { ...index, entries: { ...index.entries, [h.path]: { ...entry, copies: [] } } },
    } : {};
    const swept = await h.sweep(unreached, overrides);
    if (mode === "recorded") {
      expect(swept.swept).toMatchObject([{ outcome: { kind: "not-a-file", path: h.path, copy,
        remedy: { text: expect.stringContaining(copyPath) } } }]);
    } else {
      expect(swept.left).toMatchObject([{ path: h.path, copy, reason: "not-a-file", remedy: { text: expect.stringContaining(copyPath) } }]);
    }
    expect(await readFile(join(copyPath, "saved.txt"), "utf8")).toBe("preserved contents");
    await rename(copyPath, join(h.checkout, "saved-directory"));
    const retried = await h.sweep(unreached, { ...overrides, index: swept.index });
    expect(retried.swept.every(({ outcome }) => outcome.kind === "dropped")).toBe(true);
    expect(retried.left).toEqual([]);
    expect(await readFile(join(h.checkout, "saved-directory/saved.txt"), "utf8")).toBe("preserved contents");
  });
  it("links back a copy an exited writer left with its path absent, the file pending", async () => {
    const left = await leftBy("afterMove");
    const before = await entryOnDisk(left.location, left.path);
    const [copy] = before.copies;
    if (copy === undefined) throw new Error("expected the stopped swap's copy record");
    expect(await readStat(left.file)).toBeNull();
    const swept = await left.sweep(unreached);
    expect(swept.swept).toMatchObject([{ path: left.path, copy: copy.name, outcome: { kind: "linked-back" } }]);
    expect(await readFile(left.file, "utf8")).toContain("Body.");
    expect(await readStat(join(left.checkout, copy.name))).toBeNull();
    expect(await entryOnDisk(left.location, left.path)).toMatchObject({ pending: true, copies: [] });
  });

  it("links back a copy holding an edit as it is, leaving no second copy behind", async () => {
    const left = await leftBy("afterMove");
    const [copy] = (await entryOnDisk(left.location, left.path)).copies;
    if (copy === undefined) throw new Error("expected the stopped swap's copy record");
    const edited = renderStampedFile({ content: "# Cohort: one\n\nSaved through a held handle.\n", stamp: left.laid.base.blob });
    await writeFile(join(left.checkout, copy.name), edited);
    const swept = await left.sweep(unreached);
    expect(swept.swept.map((each) => each.outcome.kind)).toEqual(["linked-back"]);
    expect(swept.left).toEqual([]);
    expect(await readFile(left.file, "utf8")).toBe(edited);
    expect(await readStat(join(left.checkout, copy.name))).toBeNull();
  });

  it("marks a file pending where the person deleted it after a whole swap, its copy linked back or, a link, deleted", async () => {
    const whole = await leftBy(null);
    expect(await entryOnDisk(whole.location, whole.path)).toMatchObject({ pending: false });
    await rm(whole.file);
    expect((await whole.sweep(unreached)).swept.map((each) => each.outcome.kind)).toEqual(["linked-back"]);
    expect(await entryOnDisk(whole.location, whole.path)).toMatchObject({ pending: true, copies: [] });

    const linked = await leftBy(null, { guarded: { takeIn: noEdit, before: async (file) => {
      await writeFile(join(file.slice(0, file.length - SWAP_PATH.length), "target.md"), "A file elsewhere.\n");
      await rm(file);
      await symlink(join(file.slice(0, file.length - SWAP_PATH.length), "target.md"), file);
    } } });
    expect(await entryOnDisk(linked.location, linked.path)).toMatchObject({ pending: false });
    await rm(linked.file);
    expect((await linked.sweep(unreached)).swept.map((each) => each.outcome.kind)).toEqual(["deleted"]);
    expect(await readStat(linked.file)).toBeNull();
    expect(await entryOnDisk(linked.location, linked.path)).toMatchObject({ pending: true, copies: [] });
  });

  it("never links back a symbolic-link copy: deleted as no edit, its target untouched, the path left absent and pending", async () => {
    let target = "";
    const left = await leftBy("afterMove", { guarded: { takeIn: noEdit, before: async (file) => {
      // A file at the checkout's root, outside every projected root.
      target = join(file.slice(0, file.length - SWAP_PATH.length), "target.md");
      await writeFile(target, "A file elsewhere.\n");
      await rm(file);
      await symlink(target, file);
    } } });
    const [copy] = (await entryOnDisk(left.location, left.path)).copies;
    if (copy === undefined) throw new Error("expected the stopped swap's copy record");
    expect((await readStat(join(left.checkout, copy.name)))?.type).toBe("symlink");
    const swept = await left.sweep(unreached);
    expect(swept.swept).toMatchObject([{ path: left.path, copy: copy.name, outcome: { kind: "deleted" } }]);
    expect(await readStat(left.file)).toBeNull();
    expect(await readStat(join(left.checkout, copy.name))).toBeNull();
    expect(await readFile(target, "utf8")).toBe("A file elsewhere.\n");
    expect(await entryOnDisk(left.location, left.path)).toMatchObject({ pending: true, copies: [] });
  });

  it("takes in a copy holding an edit an exited writer left, and leaves a live writer's copy alone", async () => {
    const saved = "# Cohort: one\n\nSaved after the re-check.\n";
    const left = await leftBy(null, {}, ({ file, laid }) => ({
      afterRecheck: async () => writeFile(file, renderStampedFile({ content: saved, stamp: laid.base.blob })),
    }));
    const [copy] = (await entryOnDisk(left.location, left.path)).copies;
    if (copy === undefined) throw new Error("expected the kept copy's record");
    const live = await left.sweep(landingCopies(left.fixture.store), { writer: SWAP_WRITER });
    expect(live.swept).toEqual([]);
    expect(await readStat(join(left.checkout, copy.name))).not.toBeNull();
    const swept = await left.sweep(landingCopies(left.fixture.store));
    expect(swept.swept).toMatchObject([{ path: left.path, copy: copy.name, outcome: { kind: "deleted" } }]);
    const stored = await left.fixture.store.read({ reference: left.reference });
    expect(stored.status === "ok" && stored.result.content).toBe(saved);
    expect(await readStat(join(left.checkout, copy.name))).toBeNull();
    expect((await entryOnDisk(left.location, left.path)).copies).toEqual([]);
  });

  it("takes over a copy whose writer's process ID now runs another instance of this process", async () => {
    const left = await leftBy("afterMove");
    const swept = await left.sweep(unreached, { writer: { ...SWAP_WRITER, processInstance: "a-later-run" }, isProcessAlive: () => true });
    expect(swept.swept.map((each) => each.outcome.kind)).toEqual(["linked-back"]);
  });

  it("keeps a copy whose writer's process ID is in use, as a reused one may be, until that process exits", async () => {
    const left = await leftBy("afterMove");
    const another = { ...SWEEPER_ELSEWHERE };
    let alive = true;
    const isProcessAlive = (pid: number) => pid === SWAP_WRITER.pid ? alive : true;
    expect((await left.sweep(unreached, { writer: another, isProcessAlive })).swept).toEqual([]);
    expect(await readStat(left.file)).toBeNull();
    alive = false;
    expect((await left.sweep(unreached, { writer: another, isProcessAlive })).swept.map((each) => each.outcome.kind)).toEqual(["linked-back"]);
    expect(await readFile(left.file, "utf8")).toContain("Body.");
  });

  it("leaves a copy written from another process scope, reported with its path", async () => {
    const left = await leftBy("afterMove");
    const [copy] = (await entryOnDisk(left.location, left.path)).copies;
    if (copy === undefined) throw new Error("expected the stopped swap's copy record");
    const elsewhere = { ...SWEEPER, processScope: "pid:[another-container]" };
    const swept = await left.sweep(unreached, { writer: elsewhere, isProcessAlive: () => false });
    expect(swept.swept).toEqual([]);
    expect(swept.left).toEqual([{ path: left.path, copy: copy.name, reason: "other-scope" }]);
    expect(await readStat(join(left.checkout, copy.name))).not.toBeNull();
    expect(await readStat(left.file)).toBeNull();
  });

  it("deletes a staged file an exited writer left, and leaves the reference stamp and a live writer's staged file", async () => {
    const left = await leftBy("afterRecheck");
    const staged = join(left.checkout, left.staged.location);
    expect(await readStat(staged)).not.toBeNull();
    await left.sweep(unreached, { writer: SWAP_WRITER });
    expect(await readStat(staged)).not.toBeNull();
    await left.sweep(unreached);
    expect(await readStat(staged)).toBeNull();
    expect(await readStat(join(left.checkout, PROJECTION_REFERENCE))).not.toBeNull();
  });

  it("drops a copy's record whose copy was never made, or was moved back to its path", async () => {
    const neverMade = await leftBy("afterRecheck");
    const [unmade] = (await entryOnDisk(neverMade.location, neverMade.path)).copies;
    if (unmade === undefined) throw new Error("expected the first index write's copy record");
    expect((await neverMade.sweep(unreached)).swept).toMatchObject([{ copy: unmade.name, outcome: { kind: "dropped" } }]);
    expect((await entryOnDisk(neverMade.location, neverMade.path)).copies).toEqual([]);
    const movedBack = await leftBy("afterMove");
    const [moved] = (await entryOnDisk(movedBack.location, movedBack.path)).copies;
    if (moved === undefined) throw new Error("expected the stopped swap's copy record");
    await rename(join(movedBack.checkout, moved.name), movedBack.file);
    expect((await movedBack.sweep(unreached)).swept).toMatchObject([{ copy: moved.name, outcome: { kind: "dropped" } }]);
    expect((await entryOnDisk(movedBack.location, movedBack.path)).copies).toEqual([]);
    expect(await readFile(movedBack.file, "utf8")).toContain("Body.");
  });

  it("deletes copies a failed command left holding what their swap was moving, two of one file, without the take-in", async () => {
    const left = await leftBy(null);
    const index = await indexOnDisk(left.location);
    const entry = index.entries[left.path];
    const [first] = entry?.kind === "record" ? entry.copies : [];
    if (entry?.kind !== "record" || first === undefined) throw new Error("expected the swap's unchecked copy record");
    const second = { ...first, name: nameAsideFile({ path: left.path, base: left.laid.base.blob, writer: SWAP_WRITER, role: "aside" }) };
    await copyFile(join(left.checkout, first.name), join(left.checkout, second.name));
    await writeProjectionIndex(left.location, { ...index, entries: { ...index.entries, [left.path]: { ...entry, copies: [first, second] } } });
    const swept = await left.sweep(unreached);
    expect(swept.swept.map((each) => [each.copy, each.outcome.kind])).toEqual([[first.name, "deleted"], [second.name, "deleted"]]);
    expect(await readStat(join(left.checkout, first.name))).toBeNull();
    expect(await readStat(join(left.checkout, second.name))).toBeNull();
    expect((await entryOnDisk(left.location, left.path)).copies).toEqual([]);
  });

  it("clears the in-progress record a failed replacement left once it deletes the copy that record names", async () => {
    const left = await leftBy(null, { path: ".arc/user/andrew/scratch/two.txt", contents: ["plain: text\n", "plain: refreshed\n"] });
    const before = await entryOnDisk(left.location, left.path);
    const [copy] = before.copies;
    expect(before.inProgress).toEqual({ replaces: left.laid.base, copy: copy?.name });
    const swept = await left.sweep(unreached);
    expect(swept.swept.map((each) => each.outcome.kind)).toEqual(["deleted"]);
    expect(await entryOnDisk(left.location, left.path)).toMatchObject({ inProgress: null, copies: [] });
    expect(await readFile(left.file, "utf8")).toBe("plain: refreshed\n");
  });
});

describe("a copy whose edit the take-in refuses at the sweep", () => {
  const mark = { reason: "malformed-entry", remedy: { text: "Repair the malformed entry, then save again." } };
  const refusing: TakeInPort = async (request) => ({ answer: "refused", entry: request.entry, mark });

  it("is swapped back onto its path, the file pending and refused, its replacement listed for the second check", async () => {
    const malformed = "# Cohort: one\n\nA malformed save.\n";
    const left = await leftBy(null, {}, ({ file, laid }) => ({
      afterRecheck: async () => writeFile(file, renderStampedFile({ content: malformed, stamp: laid.base.blob })),
    }));
    const [copy] = (await entryOnDisk(left.location, left.path)).copies;
    if (copy === undefined) throw new Error("expected the kept copy's record");
    const swept = await left.sweep(refusing);
    expect(swept.swept).toMatchObject([{ copy: copy.name, outcome: { kind: "returned", how: "swapped-back", held: "refused" } }]);
    expect(await readFile(left.file, "utf8")).toContain("A malformed save.");
    const entry = await entryOnDisk(left.location, left.path);
    expect(entry).toMatchObject({ pending: true, refused: mark });
    const [replacement] = entry.copies;
    if (replacement === undefined) throw new Error("expected the replacement's copy record");
    expect(swept.copies).toEqual([{ path: left.path, copy: replacement.name }]);
    expect(await readFile(join(left.checkout, replacement.name), "utf8")).toContain("Body, refreshed.");
  });
});

describe("a copy the index does not record", () => {
  it("is deleted where it equals its base, and otherwise kept and reported with its path", async () => {
    const left = await leftBy(null);
    const named = () => nameAsideFile({ path: left.path, base: left.laid.base.blob, writer: SWAP_WRITER, role: "aside" });
    const unedited = named();
    const edited = named();
    await mkdir(dirname(join(left.checkout, unedited)), { recursive: true });
    // What the file held as laid, before its swap.
    await writeFile(join(left.checkout, unedited), renderStampedFile({ content: "# Cohort: one\n\nBody.\n", stamp: left.laid.base.blob }));
    await writeFile(join(left.checkout, edited), renderStampedFile({ content: "# Cohort: one\n\nAn edit.\n", stamp: left.laid.base.blob }));
    const swept = await left.sweep(unreached);
    expect(await readStat(join(left.checkout, unedited))).toBeNull();
    expect(swept.left).toEqual([{ path: left.path, copy: edited, reason: "unrecorded" }]);
    expect(await readFile(join(left.checkout, edited), "utf8")).toContain("An edit.");
  });
});

describe("the sweep with no usable index", () => {
  it("takes nothing in: a copy holding an edit is withheld and reported, and every later sweep leaves it", async () => {
    const saved = "# Cohort: one\n\nSaved after the re-check.\n";
    const left = await leftBy(null, {}, ({ file, laid }) => ({
      afterRecheck: async () => writeFile(file, renderStampedFile({ content: saved, stamp: laid.base.blob })),
    }));
    const index = await indexOnDisk(left.location);
    const [copy] = (await entryOnDisk(left.location, left.path)).copies;
    if (copy === undefined) throw new Error("expected the kept copy's record");
    const unindexed = await left.sweep(unreached, { index: null });
    // The pass, for the index that is rebuilt to record.
    expect(unindexed.ignores.kind).toBe("passed");
    expect(unindexed.withheld).toEqual([copy.name]);
    expect(unindexed.left).toEqual([{ path: left.path, copy: copy.name, reason: "withheld" }]);
    expect(await readFile(join(left.checkout, copy.name), "utf8")).toContain("Saved after the re-check.");
    // The index materialization rebuilds records the copy as withheld; a later sweep neither sends nor reports it.
    const rebuilt = { ...index, withheldCopies: [copy.name] };
    const later = await left.sweep(unreached, { index: rebuilt });
    expect(later.swept).toEqual([]);
    expect(later.left).toEqual([]);
    expect(await readStat(join(left.checkout, copy.name))).not.toBeNull();
  });

  it("links back a copy whose path is absent, and deletes one equal to its base or a symbolic link, its target untouched", async () => {
    const absent = await leftBy("afterMove");
    const absentSwept = await absent.sweep(unreached, { index: null });
    expect(absentSwept.withheld).toEqual([]);
    expect(await readFile(absent.file, "utf8")).toContain("Body.");
    const [moved] = (await entryOnDisk(absent.location, absent.path)).copies;
    expect(await readStat(join(absent.checkout, moved?.name ?? "missing"))).toBeNull();

    const unedited = await leftBy(null);
    const [kept] = (await entryOnDisk(unedited.location, unedited.path)).copies;
    if (kept === undefined) throw new Error("expected the swap's unchecked copy record");
    expect((await unedited.sweep(unreached, { index: null })).withheld).toEqual([]);
    expect(await readStat(join(unedited.checkout, kept.name))).toBeNull();
    expect(await readFile(unedited.file, "utf8")).toContain("Body, refreshed.");

    let target = "";
    const linked = await leftBy("afterMove", { guarded: { takeIn: noEdit, before: async (file) => {
      target = join(file.slice(0, file.length - SWAP_PATH.length), "target.md");
      await writeFile(target, "A file elsewhere.\n");
      await rm(file);
      await symlink(target, file);
    } } });
    const [link] = (await entryOnDisk(linked.location, linked.path)).copies;
    if (link === undefined) throw new Error("expected the stopped swap's copy record");
    expect((await linked.sweep(unreached, { index: null })).withheld).toEqual([]);
    expect(await readStat(join(linked.checkout, link.name))).toBeNull();
    expect(await readStat(linked.file)).toBeNull();
    expect(await readFile(target, "utf8")).toBe("A file elsewhere.\n");
  });
});

describe("the sweep's ignore guard", () => {
  const exclude = (lines: readonly string[]) => lines.map((line) => `${line}\n`).join("");

  it("refuses a root whose ignore line was removed since the guard passed, linking nothing back there until it returns", async () => {
    const left = await leftBy("afterMove");
    const passed = await left.sweep(unreached, { writer: SWAP_WRITER });
    expect(passed.ignores.kind).toBe("passed");
    await writeFile(join(left.checkout, ".git/info/exclude"), exclude(EXCLUDE_LINES.filter((line) => line !== ".arc/backlog/")));
    const refused = await left.sweep(unreached);
    expect(refused.ignores).toMatchObject({
      kind: "refused", reason: "not-ignored", roots: [{ path: ".arc/backlog/", line: ".arc/backlog/" }], remedy: expect.any(String),
    });
    expect(refused.swept).toEqual([]);
    expect(await readStat(left.file)).toBeNull();
    await writeFile(join(left.checkout, ".git/info/exclude"), exclude(EXCLUDE_LINES));
    const restored = await left.sweep(unreached);
    expect(restored.ignores.kind).toBe("passed");
    expect(restored.swept.map((each) => each.outcome.kind)).toEqual(["linked-back"]);
    expect(await readFile(left.file, "utf8")).toContain("Body.");
  });

  it("makes no Git call once a pass is recorded and no ignore file has changed since", async () => {
    const left = await leftBy(null);
    expect((await left.sweep(unreached, { writer: SWAP_WRITER })).ignores.kind).toBe("passed");
    const refusing = async (): Promise<string> => { throw new Error("Git was called"); };
    const guard = { root: left.checkout, identity, exec: refusing, fs: gitFs };
    expect((await left.sweep(unreached, { writer: SWAP_WRITER, guard })).ignores.kind).toBe("unchanged");
  });

  it("writes nothing where the guard refuses every root: a left staged file stays and the reference stamp is not rewritten", async () => {
    const left = await leftBy("afterRecheck");
    const staged = join(left.checkout, left.staged.location);
    const reference = await readStat(join(left.checkout, PROJECTION_REFERENCE));
    const failing = async (): Promise<string> => { throw new Error("git is not available"); };
    const refused = await left.sweep(unreached, { guard: { root: left.checkout, identity, exec: failing, fs: gitFs } });
    expect(refused.ignores).toMatchObject({ kind: "refused", reason: "guard-failed" });
    expect(await readStat(staged)).not.toBeNull();
    expect(await readStat(join(left.checkout, PROJECTION_REFERENCE))).toEqual(reference);
  });
});
