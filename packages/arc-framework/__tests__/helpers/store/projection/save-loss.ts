/**
 * Saves timed into a projected file's replacement, rebuild, or removal: the three ways an editor saves, a take-in that
 * reads an edit only once its save has settled, a saver on its own thread that fires a save at a sampled moment, and a
 * run of commands over one projected file that finds where each save ended.
 */
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, readFile, realpath, rename, rm, writeFile, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { createReferenceFixture } from "../reference-fixture.js";
import type { SeededProjection } from "./seeded-projection.js";
import { SWAP_WRITER } from "./swap-fixture.js";
import { recordLandedCopy } from "./take-in-recording.js";
import { recordWriteBackSent } from "../../../../src/lib/store/projection/aside-copies.js";
import type { GitDirectoryFileAccess } from "../../../../src/lib/git/directories.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import type { RecordReference } from "../../../../src/lib/store/identity.js";
import { ASIDE_FILES_ROOT } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { readReference, readStat } from "../../../../src/lib/store/projection/change-detection.js";
import type { FileStat, ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import {
  gateRead, SYSTEM_READ_GATE, type ReadGateDependencies,
} from "../../../../src/lib/store/projection/read-gate.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { stageRecordFile, type StagedFile } from "../../../../src/lib/store/projection/staging.js";
import { swapBatch } from "../../../../src/lib/store/projection/swap.js";
import { sweepAsideFolder } from "../../../../src/lib/store/projection/sweep.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";

type FixtureStore = ReturnType<typeof createReferenceFixture>["store"];
const PROVENANCE = { verb: "save", lifecycleAction: "save" } as const;

/** The ways an editor saves: over the old bytes, by renaming a new file over the path, or truncating first. */
export const SAVE_MODES = ["in-place", "rename-over", "truncate-then-write"] as const;
export type SaveMode = (typeof SAVE_MODES)[number];
/** The modes that write through a handle the editor holds, which reaches the file wherever it has been moved. */
export const HANDLE_MODES = ["in-place", "truncate-then-write"] as const;
export type HandleMode = (typeof HANDLE_MODES)[number];

/**
 * Save text at a path as an editor saving that way does: over the old bytes then trimmed, by renaming a new file over
 * the path, or truncating to nothing first, as VS Code and Zed do. Each creates the path where nothing is there.
 * @param mode - How the editor saves.
 * @param path - The file's absolute path.
 * @param text - What it saves.
 */
export async function saveAs(mode: SaveMode, path: string, text: string): Promise<void> {
  if (mode === "rename-over") {
    const temp = `${path}.tmp.${process.pid}.${randomBytes(4).toString("hex")}`;
    await writeFile(temp, text);
    await rename(temp, path);
    return;
  }
  const handle = await open(path, mode === "in-place" ? constants.O_WRONLY | constants.O_CREAT : "w");
  try {
    await saveThrough(handle, mode, text);
  } finally {
    await handle.close();
  }
}

/**
 * Write a save through a handle the editor holds: over the old bytes then trimmed, or truncated to nothing first.
 * @param handle - The handle, opened before whatever the save is timed into.
 * @param mode - How the editor saves.
 * @param text - What it saves.
 */
export async function saveThrough(handle: FileHandle, mode: HandleMode, text: string): Promise<void> {
  const bytes = Buffer.from(text, "utf8");
  if (mode === "truncate-then-write") await handle.truncate(0);
  await handle.write(bytes, 0, bytes.length, 0);
  if (mode === "in-place") await handle.truncate(bytes.length);
}

/**
 * A take-in that lands an edit in the store whole, as a bound write-back would: it reads a file only once the read gate
 * finds its save settled, and only where the file still matches the stat the gate settled on, else leaves it pending.
 * @param store - The store the edit lands in.
 * @param landed - Told the content of each edit that lands.
 * @param gate - The read gate's clock, stat, and sleep.
 * @returns The take-in.
 */
export function gatedLanding(
  store: FixtureStore, landed: (content: string) => void = () => undefined, gate: ReadGateDependencies = SYSTEM_READ_GATE,
): TakeInPort {
  return async (request) => {
    const location = join(request.checkout, request.copy ?? request.path);
    const verdict = await gateRead({ path: location, markdown: request.path.endsWith(".md") }, gate);
    if (verdict.kind === "pending") return { answer: "pending", entry: request.entry };
    if (verdict.kind !== "read") return { answer: "no-edit", entry: request.entry };
    const text = await readFile(location, "utf8");
    if (!isSameStat(await readStat(location), verdict.stat)) return { answer: "pending", entry: request.entry };
    const { content } = parseStampedFile(text);
    const current = await store.read({ reference: request.entry.reference });
    if (current.status !== "ok") throw new Error("the fixture read was refused");
    const entry = recordWriteBackSent(request.entry, request.copy);
    const written = await store.write({
      action: "put", reference: request.entry.reference, content, expected: current.result.version, provenance: PROVENANCE,
    });
    if (written.status !== "ok") throw new Error("the landing write was refused");
    landed(content);
    const blob = gitBlobId(text, "sha1");
    return { answer: "taken-in", entry: recordLandedCopy(entry, request.copy, blob), read: { stat: verdict.stat, blob } };
  };
}

function isSameStat(left: FileStat | null, right: FileStat): boolean {
  return left !== null && left.type === right.type && left.size === right.size && left.mtimeNs === right.mtimeNs
    && left.ino === right.ino;
}

/** One save the saver fires: how, where, what, and when after the signal. */
export interface TimedSave {
  readonly mode: SaveMode;
  readonly path: string;
  readonly text: string;
  /** Microseconds after the signal before the save starts. */
  readonly delayUs: number;
  /** Microseconds a truncating save leaves the file empty before it writes. */
  readonly gapUs: number;
}

/**
 * How a fired save ended: written, or failed where the editor would see it fail, with when each of its steps finished
 * on the process's high-resolution clock.
 */
export type SaverResult = { readonly times: Record<string, string> } & (
  | { readonly kind: "saved" } | { readonly kind: "failed"; readonly code: string }
);

/** A saver on its own thread, so a save runs alongside the engine's file operations rather than between them. */
export interface Saver {
  /** Hand the saver a save and wait until it waits for the signal; calling the result fires it. */
  readonly arm: (save: TimedSave) => Promise<() => Promise<SaverResult>>;
  readonly close: () => Promise<void>;
}

// The saver's thread runs plain JavaScript, synchronous file calls timed by a spin over the high-resolution clock.
const SAVER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const signal = new Int32Array(workerData);
function spin(us) {
  const end = process.hrtime.bigint() + BigInt(Math.round(us * 1000));
  while (process.hrtime.bigint() < end);
}
function save(job, times) {
  const mark = (step) => { times[step] = String(process.hrtime.bigint()); };
  const bytes = Buffer.from(job.text, "utf8");
  if (job.mode === "rename-over") {
    const temp = job.path + ".tmp." + process.pid + "." + randomBytes(4).toString("hex");
    fs.writeFileSync(temp, bytes);
    mark("wrote");
    try { fs.renameSync(temp, job.path); } catch (error) { fs.rmSync(temp, { force: true }); throw error; }
    mark("renamed");
    return;
  }
  const fd = fs.openSync(job.path, job.mode === "in-place" ? fs.constants.O_WRONLY | fs.constants.O_CREAT : "w");
  mark("opened");
  try {
    if (job.mode === "truncate-then-write") spin(job.gapUs);
    fs.writeSync(fd, bytes, 0, bytes.length, 0);
    mark("wrote");
    if (job.mode === "in-place") fs.ftruncateSync(fd, bytes.length);
  } finally {
    fs.closeSync(fd);
    mark("closed");
  }
}
parentPort.on("message", (job) => {
  parentPort.postMessage({ kind: "ready" });
  Atomics.wait(signal, 0, 0);
  spin(job.delayUs);
  const times = { started: String(process.hrtime.bigint()) };
  try {
    save(job, times);
    parentPort.postMessage({ kind: "saved", times });
  } catch (error) {
    parentPort.postMessage({ kind: "failed", code: (error && error.code) || String(error), times });
  }
});
`;

type SaverMessage = { readonly kind: "ready" } | SaverResult;

/**
 * Start a saver on its own thread; the caller closes it.
 * @returns The saver.
 */
export function startSaver(): Saver {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(SAVER_SOURCE, { eval: true, workerData: signal.buffer });
  const waiting: { resolve: (message: SaverMessage) => void; reject: (error: unknown) => void }[] = [];
  worker.on("message", (message: SaverMessage) => waiting.shift()?.resolve(message));
  worker.on("error", (error) => { for (const each of waiting.splice(0)) each.reject(error); });
  const next = () => new Promise<SaverMessage>((resolve, reject) => waiting.push({ resolve, reject }));
  return {
    arm: async (save) => {
      Atomics.store(signal, 0, 0);
      const ready = next();
      const done = next();
      worker.postMessage(save);
      await ready;
      return async () => {
        Atomics.store(signal, 0, 1);
        Atomics.notify(signal, 0);
        const result = await done;
        if (result.kind === "ready") throw new Error("the saver answered out of turn");
        return result;
      };
    },
    close: async () => { await worker.terminate(); },
  };
}

/**
 * Where one save ended; every outcome but the last keeps it. A save that leaves the file empty past the read gate's
 * settle window ends kept aside, in a copy the second check leaves for the next command's sweep.
 */
export const SAVE_OUTCOMES = [
  "taken in at the re-check", "rescued at the first check", "rescued at the second check", "kept at its path",
  "kept aside", "failed visibly", "lost",
] as const;
export type SaveOutcome = (typeof SAVE_OUTCOMES)[number];

/** A run of commands over one projected file, each with a save fired into it. */
export interface SaveLossRun {
  readonly store: FixtureStore;
  readonly reference: RecordReference;
  readonly seeded: SeededProjection;
  /** The file's repository-relative path. */
  readonly path: string;
  readonly mode: SaveMode;
  readonly cycles: number;
  readonly saver: Saver;
  /** A uniform draw in [0, 1). */
  readonly random: () => number;
}

/** A lost save, with what the command did and when, against the saver's steps, in microseconds from the signal. */
export interface SaveLoss {
  readonly cycle: number;
  readonly operation: "replacement" | "removal" | "rebuild";
  readonly guard: string;
  readonly settled: readonly string[];
  readonly timeline: readonly string[];
  readonly aside: readonly string[];
}

/** What a run found: how many saves ended each way, each lost one, and the window its saves were spread over. */
export interface SaveLossCounts {
  readonly outcomes: Record<SaveOutcome, number>;
  readonly losses: readonly SaveLoss[];
  readonly spanUs: number;
}

/** Commands timed before any save fires, to measure the window the saves are spread over. */
const WARM_UP = 10;
/** The longest an editor's truncating save was seen to leave a file empty, in microseconds. */
const EDITOR_EMPTY_WINDOW_US = 19_000;
/** Where a command stood when its take-in landed an edit. */
type Stage = "sweep" | "re-check" | "first check" | "second check";

/**
 * Run commands over one projected file — each a sweep where an earlier command kept a copy, then a replacement, a
 * removal whose path the projection lays again, or a rebuild of the path it left, then the second check — with a save
 * fired at a sampled moment into each.
 * @param run - The projection, the file, the save mode, and how many commands.
 * @returns How many saves ended each way.
 */
export async function runSaveLoss(run: SaveLossRun): Promise<SaveLossCounts> {
  const { checkout, location } = run.seeded;
  const file = join(checkout, run.path);
  await ignoreProjectedRoots(checkout);
  const landed: { content: string; stage: Stage }[] = [];
  let stage: Stage = "sweep";
  // Commands run back to back here, so every file reads as young and each read settles first. Every save grows the file
  // in one write, or empties it first, which the gate holds back by itself, so two stats a millisecond apart tell an
  // unfinished save from a settled one by size alone.
  const gate = { ...SYSTEM_READ_GATE, sleep: async () => { await yieldFor(1); } };
  const takeIn = gatedLanding(run.store, (content) => landed.push({ content, stage }), gate);
  let index = run.seeded.index;
  let stamp = stampAt(index, run.path);
  const durations: number[] = [];
  const outcomes = Object.fromEntries(SAVE_OUTCOMES.map((outcome) => [outcome, 0])) as Record<SaveOutcome, number>;
  const losses: SaveLoss[] = [];
  let spanUs = 0;
  for (let cycle = 0; cycle < WARM_UP + run.cycles; cycle += 1) {
    // The command's sweep takes over a copy an earlier command kept; with none recorded it would find nothing to take.
    if (entryAt(index, run.path).copies.length > 0) {
      stage = "sweep";
      const swept = await sweepAsideFolder({
        ignoreRules: (await readProjectionConfiguration(createExecaGitExec(), checkout)).ignoreRules,
        readIgnoreRules: async () => (await readProjectionConfiguration(createExecaGitExec(), checkout)).ignoreRules,
        location, checkout, index, format: "sha1", takeIn, writer: SWEEPER,
        guard: { root: checkout, identity, exec, fs: gitFs }, gate,
      });
      index = swept.index ?? index;
    }
    const present = await readStat(file) !== null;
    const removing = present && cycle % 3 === 1;
    const entry = entryAt(index, run.path);
    const staged = removing ? null : await stageNext(run, entry, cycle);
    const content = `# Cohort: one\n\nSaved ${run.mode} ${cycle}.\n\n${"s".repeat(2 * cycle + 1)}\n`;
    if (present) stamp = parseStampedFile(await readFile(file, "utf8")).stamp ?? stamp;
    const saving = cycle >= WARM_UP;
    if (saving && spanUs === 0) spanUs = Math.max(1, median(durations));
    const fire = saving
      ? await run.saver.arm({
        mode: run.mode, path: file, text: renderStampedFile({ content, stamp }), delayUs: run.random() * spanUs,
        gapUs: run.random() * Math.min(spanUs, EDITOR_EMPTY_WINDOW_US),
      })
      : null;
    // A reader holding the file open, delete access shared, as an editor or indexer does, every other command.
    const reader = present && cycle % 2 === 0 ? await open(file, "r").catch(() => null) : null;
    let result: SaverResult | undefined;
    const events: [string, bigint][] = [];
    const at = (event: string) => { events.push([event, process.hrtime.bigint()]); };
    const hooks = Object.fromEntries(["afterRecheck", "afterMove", "afterFirstCheck", "beforeRebuildLink"]
      .map((hook) => [hook, async () => { at(hook); }]));
    let guard: string;
    let settled: string[] = [];
    const started = process.hrtime.bigint();
    try {
      const saved = fire?.();
      stage = "re-check";
      const guarded = await guardReplacement({
        checkout, path: run.path, entry, staged, reference: await readReference(checkout), format: "sha1", store: run.store,
        writer: SWAP_WRITER, takeIn,
      });
      guard = guarded.kind === "replace" ? "replace" : `unreplaced: ${guarded.cause}`;
      at("guarded");
      if (guarded.kind === "replace") {
        stage = "first check";
        const batch = await swapBatch({
          location, checkout, index, files: [{ path: run.path, replace: guarded, relaid: removing }], readBack: false,
          writer: SWAP_WRITER, format: "sha1", takeIn, gate, hooks,
        });
        at("batch done");
        stage = "second check";
        const checked = await runSecondCheck({
          location, checkout, index: batch.index, copies: batch.copies, removals: batch.removals, format: "sha1", takeIn,
          writer: SWAP_WRITER, gate,
        });
        at("second check done");
        ({ index } = checked);
        settled = checked.settled.map((each) => each.settlement.kind);
      } else {
        // A file left in place keeps nothing staged; one the guard restaged meanwhile is the next sweep's to delete.
        if (staged !== null) await rm(join(checkout, staged.location), { force: true });
        index = { ...index, entries: { ...index.entries, [run.path]: guarded.entry } };
      }
      durations.push(Number(process.hrtime.bigint() - started) / 1000);
      result = await saved;
    } finally {
      await reader?.close();
    }
    if (result === undefined) continue;
    const outcome = await whereSaveEnded({ checkout, file, content, result, landed: landed.splice(0) });
    outcomes[outcome] += 1;
    if (outcome !== "lost") continue;
    const saverSteps = Object.entries(result.times).map(([step, time]): [string, bigint] => [`saver ${step}`, BigInt(time)]);
    losses.push({
      cycle, operation: removing ? "removal" : present ? "replacement" : "rebuild", guard, settled,
      timeline: [...events, ...saverSteps].sort((left, right) => (left[1] < right[1] ? -1 : 1))
        .map(([event, time]) => `${(Number(time - started) / 1000).toFixed(1)} µs ${event}`),
      aside: (await filesUnder(join(checkout, ASIDE_FILES_ROOT))).map((each) => each.slice(checkout.length + 1)),
    });
  }
  return { outcomes, losses, spanUs };
}

const identity = SlugSchema.parse("andrew");
const exec = createExecaGitExecInput();
const gitFs: GitDirectoryFileAccess = { lstat, readFile: (path) => readFile(path, "utf8"), realpath };
/** Each command's sweep runs as a later instance of this process, so a copy an earlier command kept reads as left. */
const SWEEPER = { ...SWAP_WRITER, processInstance: "save-loss-sweep" };

/** Ignore the projected roots, as the sweep's ignore check requires before it writes. */
export async function ignoreProjectedRoots(checkout: string): Promise<void> {
  const lines = [".arc/active/", ".arc/backlog/", ".arc/completed/", ".arc/system/.local/"];
  await writeFile(join(checkout, ".git/info/exclude"), lines.map((line) => `${line}\n`).join(""));
  await writeFile(join(checkout, ".gitignore"), ".arc/user/*/\n");
}

/** Store the record's next version, longer than any save before it, and stage it for the path. */
async function stageNext(run: SaveLossRun, entry: RecordEntry, cycle: number): Promise<StagedFile> {
  const current = await run.store.read({ reference: run.reference });
  if (current.status !== "ok") throw new Error("the fixture read was refused");
  const content = `# Cohort: one\n\nRefreshed ${cycle}.\n\n${"r".repeat(2 * cycle)}\n`;
  const written = await run.store.write({
    action: "put", reference: run.reference, content, expected: current.result.version, provenance: PROVENANCE,
  });
  if (written.status !== "ok") throw new Error("the fixture write was refused");
  const record = await run.store.read({ reference: run.reference });
  if (record.status !== "ok") throw new Error("the fixture read was refused");
  return stageRecordFile({
    checkout: run.seeded.checkout, path: run.path, record: record.result, replacing: entry.base.blob, writer: SWAP_WRITER,
    format: "sha1",
  });
}

/** Find a save: landed in the store, at its path, or in an aside copy, else lost; a save that failed was seen to. */
async function whereSaveEnded(found: {
  checkout: string; file: string; content: string; result: SaverResult; landed: readonly { content: string; stage: Stage }[];
}): Promise<SaveOutcome> {
  if (found.result.kind === "failed") return "failed visibly";
  const landing = found.landed.find((each) => each.content === found.content);
  if (landing !== undefined) return LANDED_AS[landing.stage];
  if (await holds(found.file, found.content)) return "kept at its path";
  for (const copy of await filesUnder(join(found.checkout, ASIDE_FILES_ROOT))) {
    if (await holds(copy, found.content)) return "kept aside";
  }
  return "lost";
}

const LANDED_AS: Record<Stage, SaveOutcome> = {
  "sweep": "kept aside",
  "re-check": "taken in at the re-check",
  "first check": "rescued at the first check",
  "second check": "rescued at the second check",
};

async function holds(path: string, content: string): Promise<boolean> {
  const text = await readFile(path, "utf8").catch(() => null);
  return text !== null && parseStampedFile(text).content === content;
}

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((each) => each.isFile()).map((each) => join(each.parentPath, each.name));
}

function entryAt(index: ProjectionIndex, path: string): RecordEntry {
  const entry = index.entries[path];
  if (entry?.kind !== "record") throw new Error(`No record entry at ${path}`);
  return entry;
}

function stampAt(index: ProjectionIndex, path: string): string {
  return entryAt(index, path).base.blob;
}

/** Wait the milliseconds given, yielding to other work, below the resolution a timer has on Windows. */
async function yieldFor(milliseconds: number): Promise<void> {
  const end = process.hrtime.bigint() + BigInt(milliseconds) * 1_000_000n;
  while (process.hrtime.bigint() < end) await new Promise((resolve) => setImmediate(resolve));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
