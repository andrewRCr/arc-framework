/** The sweep over a seeded projection: the copies and staged files a stopped or exited writer left, taken over. */
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { chmod, copyFile, link, lstat, mkdir, readFile, realpath, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { landingCopies, prepareSwap, SWAP_PATH, SWAP_WRITER, type PrepareSwapOptions } from "../../../helpers/store/projection/swap-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import type { GitDirectoryFileAccess } from "../../../../src/lib/git/directories.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { PROJECTION_REFERENCE, readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { commitProjectionIndex, readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { ASIDE_FILES_ROOT, nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { recordWriteBackSent } from "../../../../src/lib/store/projection/aside-copies.js";
import { readStamplessFile } from "../../../../src/lib/store/projection/stampless.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import type { SwapHooks } from "../../../../src/lib/store/projection/swap.js";
import { sweepAsideFolder, type SweepInput } from "../../../../src/lib/store/projection/sweep.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { createProjectionLinkBoundary } from "../../../../src/lib/store/projection/discovery-links.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { commitReturnedCopies } from "../../../../src/lib/store/projection/returned-copies.js";

const lateAccess = vi.hoisted(() => ({ destinations: new Map<string, string>(), denied: "" }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  const lstat = (async (...args: Parameters<typeof actual.lstat>) => {
    // Begin denial at the first copy's stat, after the sweep has preflighted both destinations.
    lateAccess.denied ||= lateAccess.destinations.get(String(args[0])) ?? "";
    if (args[0] === lateAccess.denied) {
      throw Object.assign(new Error("Archive search access revoked after selection"), { code: "EACCES" });
    }
    return actual.lstat(...args);
  }) as typeof actual.lstat;
  return { ...actual, lstat, default: { ...actual, lstat } };
});
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  const lstatSync = ((...args: Parameters<typeof actual.lstatSync>) => {
    if (args[0] === lateAccess.denied) {
      throw Object.assign(new Error("Archive search access revoked after selection"), { code: "EACCES" });
    }
    return actual.lstatSync(...args);
  }) as typeof actual.lstatSync;
  return { ...actual, lstatSync, default: { ...actual, lstatSync } };
});

const directories: string[] = [];
afterEach(async () => {
  lateAccess.destinations.clear();
  lateAccess.denied = "";
  await removeGitBackedDirs(directories.splice(0));
});

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
  const { checkout, location } = prepared.seeded;
  const sweep = await prepareSweep(checkout, location);
  const stopping: SwapHooks = stop === null ? hooks : { ...hooks, [stop]: async (path: string) => {
    await hooks[stop]?.(path);
    throw new Stop(`stopped ${stop}`);
  } };
  try {
    await prepared.swap({ hooks: stopping });
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
  }
  return { ...prepared, checkout, location, sweep };
}

async function prepareSweep(checkout: string, location: SweepInput["location"]) {
  await writeFile(join(checkout, ".git/info/exclude"), EXCLUDE_LINES.map(line => `${line}\n`).join(""));
  await writeFile(join(checkout, ".gitignore"), ".arc/user/*/\n");
  await mkdir(join(checkout, ".arc/user"), { recursive: true });
  await writeFile(join(checkout, ".arc/user/.npmignore"), "*\n");
  /** Sweep with the index on disk, as the next command's start reads it. */
  return async (takeIn: TakeInPort, overrides: Partial<SweepInput> = {}) => sweepAsideFolder({
    ignoreRules: (await readProjectionConfiguration(createExecaGitExec(), checkout)).ignoreRules,
    readIgnoreRules: async () => (await readProjectionConfiguration(createExecaGitExec(), checkout)).ignoreRules,
    location, checkout, index: await indexOnDisk(location), format: "sha1", takeIn, writer: SWEEPER,
    guard: { root: checkout, identity, exec: execInput, fs: gitFs }, ...overrides,
  });
}

async function indexOnDisk(location: Parameters<typeof readProjectionIndex>[0]): Promise<ProjectionIndex> {
  const read = await readProjectionIndex(location, true, { groups: "all" });
  if (read.kind !== "index") throw new Error(`expected an index on disk, found ${read.kind}`);
  return read.index;
}

it.each([true, false])("retains returned archive bytes when a replacement wins before cleanup (indexed=%s)", async indexed => {
  const left = await leftBy("afterMove", { path: ".arc/completed/one/cohort-one.md" });
  const index = await indexOnDisk(left.location);
  const [copy] = (await entryOnDisk(left.location, left.path)).copies;
  if (copy === undefined) throw new Error("Expected a displaced archive copy");
  const aside = join(left.checkout, copy.name);
  await chmod(aside, 0o644);
  await writeFile(aside, "Displaced archive edit.\n");
  let returned = false, replaced = false;
  const checkpoint = async () => {
    if (!returned || replaced) return;
    replaced = true;
    await rm(left.file);
    await writeFile(left.file, "A newer edit.\n");
  };
  if (indexed) {
    await link(aside, left.file);
    const committed = await commitReturnedCopies({ checkout: left.checkout, location: left.location, index,
      returned: [{ path: left.path, copy: copy.name }], onPublished: () => { returned = true; }, checkpoint });
    expect(committed.entries[left.path]).toMatchObject({ copies: [copy] });
  } else {
    const swept = await left.sweep(unreached, { index: null, fs: { link: async (from, to) => {
      await link(from, to);
      returned = true;
    } }, checkpoint });
    expect(swept.withheld).toEqual([copy.name]);
  }
  expect(replaced).toBe(true);
  expect(await readFile(aside, "utf8")).toBe("Displaced archive edit.\n");
  expect(await readFile(left.file, "utf8")).toBe("A newer edit.\n");
});

it.each([false, true])("preserves a displaced opened archive file across nested-checkout settlement (edited=%s)", async edited => {
  const path = ".arc/completed/one/cohort-one.md";
  const basis = await prepareSwap({ path });
  directories.push(basis.seeded.checkout);
  const { checkout, location } = basis.seeded;
  const folder = dirname(basis.file), bytes = await readFile(basis.file, "utf8");
  await chmod(basis.file, 0o644);
  const expected = edited ? `${bytes}\nAn edit after the move.\n` : bytes;
  const swapped = await basis.swap({ files: [{ path, replace: { ...basis.replace, entry: { ...basis.laid, opened: true } } }], hooks: {
    afterMove: async () => {
      if (edited) {
        const entry = await entryOnDisk(location, path);
        const [copy] = entry.copies;
        if (copy === undefined) throw new Error("Expected displaced copy");
        await writeFile(join(checkout, copy.name), expected);
      }
      await createExecaGitExec()("git", ["init", "--quiet", folder], { cwd: checkout });
    },
  } });
  const [copy] = swapped.copies;
  if (copy === undefined) throw new Error("Expected displaced copy");
  // The command selected the path before the nested checkout arrived, so its own second check may still read the copy; the
  // copy's deletion asks again and is refused, and an edit the take-in defers stays in the copy.
  const deferred: TakeInPort = async request => ({ answer: "deferred", entry: request.entry });
  const checked = await runSecondCheck({ checkout, location, index: swapped.index, copies: swapped.copies,
    format: "sha1", takeIn: edited ? deferred : unreached, writer: SWAP_WRITER });
  expect(checked.settled).toMatchObject([{ settlement: edited ? { kind: "kept", answer: "deferred" }
    : { kind: "blocked-destination", mark: { reason: expect.stringContaining("another checkout") } } }]);
  const sweep = await prepareSweep(checkout, location);
  expect((await sweep(unreached, { index: checked.index })).swept).toMatchObject([{ outcome: { kind: "blocked-destination" } }]);
  expect((await sweep(unreached, { index: null })).left).toMatchObject([{ reason: "destination-blocked" }]);
  expect(await readFile(join(checkout, copy.copy), "utf8")).toBe(expected);
  expect(await readStat(basis.file)).toBeNull();
  await rm(join(folder, ".git"), { recursive: true });
  expect((await sweep(unreached, { index: checked.index })).swept).toMatchObject([{ outcome: { kind: "linked-back" } }]);
  expect(await readFile(basis.file, "utf8")).toBe(expected);
  expect(await readStat(join(checkout, copy.copy))).toBeNull();
});

async function entryOnDisk(location: Parameters<typeof readProjectionIndex>[0], path: string): Promise<RecordEntry> {
  const entry = (await indexOnDisk(location)).entries[path];
  if (entry?.kind !== "record") throw new Error(`expected a record entry at ${path}`);
  return entry;
}

it("prunes empty scaffolding while preserving recovery names, foreign bytes, and linked directories", async () => {
  const h = await leftBy(null);
  await h.sweep(unreached);
  const empty = join(h.checkout, ASIDE_FILES_ROOT, "backlog/planned/empty/notes-empty.md");
  const opaque = nameAsideFile({ path: h.path, base: h.staged.base.blob, writer: SWEEPER, role: "aside" });
  const foreign = join(h.checkout, ASIDE_FILES_ROOT, "foreign/saved.txt");
  const external = join(h.checkout, "external-aside-directory");
  await mkdir(empty, { recursive: true });
  await mkdir(join(h.checkout, opaque), { recursive: true });
  await mkdir(dirname(foreign), { recursive: true });
  await writeFile(foreign, "Foreign bytes.\n");
  await mkdir(external);
  await symlink(external, join(h.checkout, ASIDE_FILES_ROOT, "linked"), "dir");
  await h.sweep(unreached);
  expect(await readStat(empty)).toBeNull();
  expect((await lstat(join(h.checkout, opaque))).isDirectory()).toBe(true);
  expect(await readFile(foreign, "utf8")).toBe("Foreign bytes.\n");
  expect((await lstat(external)).isDirectory()).toBe(true);
  const copy = nameAsideFile({ path: ".arc/backlog/planned/empty/notes-empty.md", base: h.staged.base.blob, writer: SWAP_WRITER, role: "aside" });
  await mkdir(dirname(join(h.checkout, copy)), { recursive: true });
  await writeFile(join(h.checkout, copy), "Unrecorded save.\n");
  expect(await h.sweep(unreached)).toMatchObject({ left: expect.arrayContaining([expect.objectContaining({ copy, reason: "unrecorded" })]) });
  expect(await readFile(join(h.checkout, copy), "utf8")).toBe("Unrecorded save.\n");
});

describe("the sweep", () => {
  it.each(["destination stat", "recovery link"])("keeps a no-index copy refused at %s while restoring a sibling", async operation => {
    const h = await leftBy("afterMove", { path: ".arc/completed/one/first.md" });
    const entry = await entryOnDisk(h.location, h.path);
    const [first] = entry.copies;
    if (first === undefined) throw new Error("Missing stopped archive copy");
    const sibling = ".arc/completed/two/second.md";
    const second = nameAsideFile({ path: sibling, base: entry.base.blob, writer: SWAP_WRITER, role: "aside" });
    await mkdir(dirname(join(h.checkout, second)), { recursive: true });
    await mkdir(dirname(join(h.checkout, sibling)), { recursive: true });
    const bytes = await readFile(join(h.checkout, first.name));
    await writeFile(join(h.checkout, second), bytes);
    const copies = [{ path: h.path, name: first.name }, { path: sibling, name: second }];
    if (operation === "destination stat") {
      lateAccess.destinations = new Map(copies.map(({ name, path }) => [join(h.checkout, name), join(h.checkout, path)]));
    }
    let deniedLink = "";
    const blocked = await h.sweep(unreached, { index: null, retrySleep: async () => {}, fs: { link: async (from, to) => {
      if (operation === "recovery link") {
        deniedLink ||= to;
        if (to === deniedLink) throw Object.assign(new Error("Recovery link refused"), { code: "EACCES" });
      }
      await link(from, to);
    } } });
    const denied = operation === "destination stat" ? lateAccess.denied : deniedLink;
    const held = copies.find(({ path }) => join(h.checkout, path) === denied);
    const restored = copies.find(({ path }) => join(h.checkout, path) !== denied);
    if (held === undefined || restored === undefined) throw new Error("Expected one denied and one accessible destination");
    expect(blocked.left).toMatchObject([{ path: held.path, copy: held.name, reason: "destination-blocked",
      refusal: { reason: expect.stringContaining("EACCES") } }]);
    expect(await readFile(join(h.checkout, held.name))).toEqual(bytes);
    expect(await readFile(join(h.checkout, restored.path))).toEqual(bytes);
    expect(await readStat(join(h.checkout, restored.name))).toBeNull();

    lateAccess.destinations.clear();
    lateAccess.denied = "";
    expect((await h.sweep(unreached, { index: null })).left).toEqual([]);
    expect(await readFile(join(h.checkout, held.path))).toEqual(bytes);
    expect(await readStat(join(h.checkout, held.name))).toBeNull();
  });

  it("keeps a missing recorded replacement on a denied stat and restores a sibling", async () => {
    const h = await leftBy("afterRecheck", { path: ".arc/completed/one/first.txt", contents: ["Original.\n", "New version.\n"] });
    const index = await indexOnDisk(h.location), entry = await entryOnDisk(h.location, h.path), [copy] = entry.copies;
    if (copy === undefined || entry.inProgress === null) throw new Error("Missing planned text replacement");
    const sibling = ".arc/completed/two/sibling.txt";
    const siblingCopy = nameAsideFile({ path: sibling, base: entry.base.blob, writer: SWAP_WRITER, role: "aside" });
    await mkdir(dirname(join(h.checkout, siblingCopy)), { recursive: true });
    await mkdir(dirname(join(h.checkout, sibling)), { recursive: true });
    await copyFile(h.file, join(h.checkout, siblingCopy));
    const both = { ...index, entries: { ...index.entries, [sibling]: { ...entry, inProgress: null, copies: [{ ...copy, name: siblingCopy }] } } };
    await writeProjectionIndex(h.location, both);
    lateAccess.destinations.set(join(h.checkout, copy.name), h.file);

    const held = await h.sweep(unreached);
    expect(held.swept).toMatchObject([
      { path: h.path, copy: copy.name, outcome: { kind: "blocked-destination", access: true, entry } },
      { path: sibling, outcome: { kind: "linked-back" } },
    ]);
    expect(await readFile(join(h.checkout, sibling), "utf8")).toBe("Original.\n");
    lateAccess.destinations.clear();
    lateAccess.denied = "";
    const retry = await h.sweep(unreached);
    expect(retry.swept).toMatchObject([{ path: h.path, outcome: { kind: "dropped", entry: { copies: [],
      inProgress: entry.inProgress } } }]);
    expect(await readFile(h.file, "utf8")).toBe("Original.\n");
  });

  it("holds both no-index copies of a denied destination and restores an accessible sibling", async () => {
    const h = await leftBy("afterMove", { path: ".arc/completed/one/first.md" });
    const entry = await entryOnDisk(h.location, h.path), [first] = entry.copies;
    if (first === undefined) throw new Error("Missing stopped archive copy");
    const second = nameAsideFile({ path: h.path, base: entry.base.blob, writer: SWAP_WRITER, role: "aside" });
    const sibling = ".arc/completed/two/sibling.md";
    const third = nameAsideFile({ path: sibling, base: entry.base.blob, writer: SWAP_WRITER, role: "aside" });
    await mkdir(dirname(join(h.checkout, third)), { recursive: true });
    await mkdir(dirname(join(h.checkout, sibling)), { recursive: true });
    await copyFile(join(h.checkout, first.name), join(h.checkout, second));
    await copyFile(join(h.checkout, first.name), join(h.checkout, third));
    let deniedCopy = "";
    const result = await h.sweep(unreached, { index: null, retrySleep: async () => {}, fs: { link: async (from, to) => {
      if (to === h.file) {
        deniedCopy ||= from;
        if (from === deniedCopy) throw Object.assign(new Error("One link was denied"), { code: "EACCES" });
      }
      await link(from, to);
    } } });
    expect(result.left.map(copy => [copy.copy, copy.reason]).sort()).toEqual([
      [first.name, "destination-blocked"], [second, "destination-blocked"],
    ].sort());
    expect(await readStat(h.file)).toBeNull();
    expect(await readStat(join(h.checkout, first.name))).toMatchObject({ type: "file" });
    expect(await readStat(join(h.checkout, second))).toMatchObject({ type: "file" });
    expect(await readStat(join(h.checkout, sibling))).toMatchObject({ type: "file" });
    expect(await readStat(join(h.checkout, third))).toBeNull();
  });

  it.each(["recorded", "unrecorded", "no-index"])("keeps a %s copy outside a linked destination and permits recovery after repair", async mode => {
    const h = await leftBy("afterMove"), index = await indexOnDisk(h.location);
    const entry = index.entries[h.path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No stopped swap copy");
    const copy = entry.copies[0].name, bytes = `${await readFile(join(h.checkout, copy), "utf8")}\nLate saved prose.\n`;
    await writeFile(join(h.checkout, copy), bytes);
    const folder = dirname(h.path), backup = join(h.checkout, "authored-folder"), external = join(h.checkout, "external-destination");
    await rename(join(h.checkout, folder), backup);
    await mkdir(external);
    await symlink(external, join(h.checkout, folder), "dir");
    const target = join(external, h.path.slice(h.path.lastIndexOf("/") + 1));
    const overrides: Partial<SweepInput> = mode === "no-index" ? { index: null } : mode === "unrecorded"
      ? { index: { ...index, entries: { ...index.entries, [h.path]: { ...entry, copies: [] } } } } : {};
    const blocked = await h.sweep(unreached, { ...overrides, blockedByLink: createProjectionLinkBoundary([folder]) });
    expect(blocked.left).toMatchObject([{ path: h.path, copy, reason: "not-a-file",
      remedy: { text: expect.stringContaining("regular file") } }]);
    expect(await readStat(target)).toBeNull();
    expect(await readFile(join(h.checkout, copy), "utf8")).toBe(bytes);
    if (mode === "no-index") expect(blocked.withheld).toContain(copy);
    if (mode === "recorded") expect(blocked.index?.entries[h.path]).toMatchObject({ reference: entry.reference, copies: entry.copies });
    await rm(join(h.checkout, folder));
    await rename(backup, join(h.checkout, folder));
    if (mode === "unrecorded") await rename(join(h.checkout, copy), h.file);
    const recovered = await h.sweep(unreached, { ...overrides, index: blocked.index, blockedByLink: createProjectionLinkBoundary([]) });
    expect(recovered.left).toEqual([]);
    expect(await readFile(h.file, "utf8")).toBe(bytes);
    expect(await readStat(target)).toBeNull();
  });

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

  it.each([
    ["recorded", "fresh"], ["recorded", "cached"], ["recorded", "partial-refusal"],
    ["unrecorded", "fresh"], ["unrecorded", "cached"], ["unrecorded", "partial-refusal"],
    ["no-index", "fresh"], ["no-index", "partial-refusal"],
  ] as const)("keeps %s personal copies outside a %s guard's roots, then permits authorized recovery", async (mode, verdict) => {
    const path = ".arc/user/andrew/USER-INBOX.md";
    const reference = RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } });
    const left = await leftBy("afterMove", { path, reference, contents: [
      "# User Inbox\n\n## Errand\n", "# User Inbox\n\n## Errand\n\n## Work Unit\n",
    ] });
    const original = await indexOnDisk(left.location);
    const entry = original.entries[path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("expected personal copy");
    const copy = entry.copies[0].name;
    const saved = renderStampedFile({ content: "# User Inbox\n\n## Errand\n\nPrivate saved edit.\n", stamp: entry.base.blob });
    await writeFile(join(left.checkout, copy), saved);
    await writeFile(join(left.checkout, ".gitignore"), verdict === "partial-refusal" ? "" : ".arc/user/alice/\n");
    const oldTime = new Date("2000-01-01T00:00:00Z");
    await utimes(join(left.checkout, ".gitignore"), oldTime, oldTime);
    await utimes(join(left.checkout, ".git/info/exclude"), oldTime, oldTime);
    const guard = { root: left.checkout, identity: SlugSchema.parse("alice"), exec: execInput, fs: gitFs };
    let index: ProjectionIndex | null = mode === "no-index" ? null : mode === "unrecorded"
      ? { ...original, entries: { ...original.entries, [path]: { ...entry, copies: [] } } } : original;
    if (verdict === "cached") {
      const primed = await left.sweep(unreached, { guard, index, writer: SWAP_WRITER });
      expect(primed.ignores.kind).toBe("passed");
      index = primed.index;
    }

    const refused = await left.sweep(unreached, { guard, index });
    expect(refused.ignores.kind).toBe(verdict === "partial-refusal" ? "refused" : verdict === "cached" ? "unchanged" : "passed");
    expect(await readStat(left.file)).toBeNull();
    expect(await readFile(join(left.checkout, copy), "utf8")).toBe(saved);
    expect(refused.left).toMatchObject([{ path, copy, reason: "root-not-authorized", remedy: { text: expect.stringContaining(path) } }]);

    await writeFile(join(left.checkout, ".gitignore"), ".arc/user/*/\n");
    const retried = await left.sweep(unreached, { index: refused.index });
    expect(retried.ignores.kind).toBe("passed");
    if (mode === "unrecorded") {
      expect(retried.left).toEqual([{ path, copy, reason: "unrecorded" }]);
      expect(await readFile(join(left.checkout, copy), "utf8")).toBe(saved);
    } else {
      expect(await readFile(left.file, "utf8")).toBe(saved);
      expect(await readStat(join(left.checkout, copy))).toBeNull();
      await createExecaGitExec()("git", ["check-ignore", "--no-index", path], { cwd: left.checkout });
    }
  });

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
    const first = await left.sweep(unreached, { writer: SWAP_WRITER });
    expect(first.ignores.kind).toBe("passed");
    if (first.index === null) throw new Error("Missing swept index");
    await commitProjectionIndex({ location: left.location, checkout: left.checkout, index: first.index });
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


it("finishes an installed stampless replacement after copy unlink and detects a later old-text restore", async () => {
  const left = await leftBy(null, { path: ".arc/user/andrew/scratch/two.txt", contents: ["plain: text\n", "plain: refreshed\n"] });
  const before = await entryOnDisk(left.location, left.path);
  const [copy] = before.copies;
  if (copy === undefined) throw new Error("expected the swap's copy");
  await rm(join(left.checkout, copy.name));
  expect((await left.sweep(unreached)).swept).toMatchObject([{ outcome: { kind: "dropped" } }]);
  const entry = await entryOnDisk(left.location, left.path);
  expect(entry).toMatchObject({ copies: [], inProgress: null });
  await writeFile(left.file, "plain: text\n");
  const memo = { read: async () => { throw new Error("unexpected history read"); }, drop: () => {} };
  expect(await readStamplessFile({ entry, text: await readFile(left.file, "utf8"), mtimeNs: 0n, format: "sha1", memo }))
    .toEqual({ status: "ok", result: { kind: "edit", base: entry.base, replaces: null } });
});

it.each(["afterRecheck", "afterMove"] as const)("keeps stampless progress when the original inode remains after %s", async (stop) => {
  const left = await leftBy(stop, { path: ".arc/user/andrew/scratch/two.txt", contents: ["plain: text\n", "plain: refreshed\n"] });
  const before = await entryOnDisk(left.location, left.path);
  const [copy] = before.copies;
  if (copy === undefined) throw new Error("expected the first index write's copy record");
  if (stop === "afterMove") await rename(join(left.checkout, copy.name), left.file);
  await left.sweep(unreached);
  expect(await entryOnDisk(left.location, left.path)).toMatchObject({ copies: [], inProgress: before.inProgress });
  expect(await readFile(left.file, "utf8")).toBe("plain: text\n");
});

it("retains recovery copies from a Git-only cached proof while npm policy is missing, then resumes after repair", async () => {
  const left = await leftBy("afterMove");
  const original = await indexOnDisk(left.location);
  const entry = original.entries[left.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("expected recovery copy");
  const copy = entry.copies[0].name;
  const bytes = await readFile(join(left.checkout, copy));
  const primed = await left.sweep(unreached, { index: original, writer: SWAP_WRITER });
  if (primed.ignores.kind !== "passed" || primed.index === null || primed.index.ignoreGuard === null) throw new Error("expected current proof");
  const old = { ...primed.index, ignoreGuard: { ...primed.index.ignoreGuard, personalRules: "worktree" } };
  await writeProjectionIndex(left.location, old);
  const reloaded = await indexOnDisk(left.location);
  expect(reloaded.entries[left.path]).toEqual(old.entries[left.path]);
  const policy = join(left.checkout, ".arc/user/.npmignore");
  await rm(policy);
  const refused = await left.sweep(unreached, { index: reloaded });
  expect(refused.ignores.kind).toBe("refused");
  expect(await readFile(join(left.checkout, copy))).toEqual(bytes);
  if (refused.index === null) throw new Error("expected retained recovery index");
  expect(refused.index.entries[left.path]?.kind).toBe("record");
  await writeFile(policy, "*\n");
  const retried = await left.sweep(noEdit, { index: refused.index });
  expect(retried.ignores.kind).toBe("passed");
});
