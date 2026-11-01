/**
 * The swap: a batch of replacements, each moving the old file into the aside folder and linking its staged file onto
 * the path, between two index writes, so a save timed into a replacement lands in the aside copy rather than being lost.
 */
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { nameAsideFile, type AsideWriterInput } from "./aside.js";
import { checkAsideCopy, putBack } from "./aside-copies.js";
import { retriedMoves, type RetriedMoves, type SwapMoves } from "./aside-moves.js";
import type { ObjectFormat } from "./blob-id.js";
import { readStat } from "./change-detection.js";
import { commitProjectionIndex } from "./index-file.js";
import type { AsideCopyRecord, FileStat, ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionLocation } from "./location.js";
import type { ReadGateDependencies } from "./read-gate.js";
import type { GuardResult } from "./replace-guard.js";
import type { StagedFile } from "./staging.js";
import type { TakeInPort } from "./take-in-port.js";

/** One file a batch replaces or, where the guard staged nothing, removes: the guard's decision to. */
export interface SwapFile {
  /** The file's repository-relative path. */
  readonly path: string;
  readonly replace: Extract<GuardResult, { readonly kind: "replace" }>;
  /** For a removal, whether the projection now lays another record at the path, which keeps its entry for that record. */
  readonly relaid?: boolean;
}

/** Points in each file's swap where a test or the harness can place a save. */
export interface SwapHooks {
  /** After the re-check, before the file is moved aside. */
  readonly afterRecheck?: (path: string) => Promise<void>;
  /** After the move, before the staged file is linked. */
  readonly afterMove?: (path: string) => Promise<void>;
  /** After the aside copy's first check. */
  readonly afterFirstCheck?: (path: string) => Promise<void>;
  /** Before an absent file's rebuild links its staged file. */
  readonly beforeRebuildLink?: (path: string) => Promise<void>;
}

/** What a batch swaps, and how; its moves are the system's unless a test injects its own. */
export interface SwapBatchInput extends SwapMoves {
  readonly location: ProjectionLocation;
  readonly checkout: string;
  readonly index: ProjectionIndex;
  readonly files: readonly SwapFile[];
  /** Whether the batch lays write-back's read-back, which keeps a pending mark a file carried into it. */
  readonly readBack: boolean;
  readonly writer: AsideWriterInput;
  readonly format: ObjectFormat;
  readonly takeIn: TakeInPort;
  /** The read gate every copy check runs on, the system's unless a test injects its own. */
  readonly gate?: ReadGateDependencies;
  readonly hooks?: SwapHooks;
}

/** What a batch left: the index as its second write recorded it, and the aside copies the command keeps. */
export interface SwapBatchResult {
  readonly index: ProjectionIndex;
  readonly copies: readonly { readonly path: string; readonly copy: string }[];
  /** The paths the batch removed a file from whose entry goes once the file and its last aside copy are gone. */
  readonly removals: readonly string[];
}

/** One file's swap as the first index write records it. */
interface PlannedSwap {
  readonly path: string;
  /** The entry before the batch. */
  readonly original: RecordEntry;
  /** The entry the first write records: the new base, the staged file's stat, pending, and the copy's record. */
  readonly entry: RecordEntry;
  /** The aside copy's record, null for a rebuild by the link alone or the removal of a file already gone. */
  readonly copy: AsideCopyRecord | null;
  /** The staged file and its identity, which the path holds once it is linked; null for a removal. */
  readonly staged: { readonly file: StagedFile; readonly stat: FileStat } | null;
}

/**
 * Swap a batch of files.
 * @param input - The files and the index they are recorded in.
 * @returns The index the batch wrote last, and the copies it made.
 */
export async function swapBatch(input: SwapBatchInput): Promise<SwapBatchResult> {
  const plans = await Promise.all(input.files.map(async (file) => plan(input, file)));
  const recorded = { entries: new Set(plans.map((each) => each.path)), ignoreFiles: false };
  let index = await commitProjectionIndex({
    location: input.location, checkout: input.checkout, recorded,
    index: plans.reduce((built, each) => withEntry(built, each.path, each.entry), input.index),
  });
  const copies: { path: string; copy: string }[] = [];
  for (const each of plans) {
    const swapped = await swapOne(input, each);
    index = withEntry(index, each.path, swapped.entry);
    copies.push(...madeCopies(each.original, swapped.entry).map((copy) => ({ path: each.path, copy })));
  }
  for (const each of plans) index = withEntry(index, each.path, await settled(input, each, entryAt(index, each.path)));
  const removals = input.files.filter((file) => file.replace.staged === null && file.relaid !== true).map((file) => file.path);
  index = await dropRemovedEntries(index, input.checkout, removals);
  index = await commitProjectionIndex({ location: input.location, checkout: input.checkout, index, recorded });
  return { index, copies, removals };
}

/**
 * Drop the entry of each removed file that is gone, with no aside copy of its path left, the removal complete. A path
 * the projection now lays another record at is never named here: its entry stays, pending, as a deleted file's.
 * @param index - The index.
 * @param checkout - The checkout root.
 * @param removals - The paths removed whose record has left them.
 * @returns The index without those entries.
 */
export async function dropRemovedEntries(index: ProjectionIndex, checkout: string, removals: readonly string[]): Promise<ProjectionIndex> {
  const gone = new Set<string>();
  for (const path of removals) {
    const entry = index.entries[path];
    if (entry?.kind === "record" && entry.copies.length === 0 && await readStat(join(checkout, path)) === null) gone.add(path);
  }
  if (gone.size === 0) return index;
  return { ...index, entries: Object.fromEntries(Object.entries(index.entries).filter(([path]) => !gone.has(path))) };
}

/** The entry the second write records: what a file the batch put in place no longer needs. */
async function settled(input: SwapBatchInput, swap: PlannedSwap, entry: RecordEntry): Promise<RecordEntry> {
  // A removal links nothing, so its file stays pending until it and its copies are gone.
  if (swap.staged === null) return entry;
  const stat = await readStat(join(input.checkout, swap.path));
  const holdsStaged = stat?.type === "file" && stat.ino === swap.staged.stat.ino;
  if (!holdsStaged) return entry;
  // A read-back lays what write-back took in, so a file already pending before it waits for the next refresh.
  const placed = { ...entry, pending: input.readBack && swap.original.pending };
  return swap.copy === null ? { ...placed, inProgress: null } : placed;
}

function entryAt(index: ProjectionIndex, path: string): RecordEntry {
  const entry = index.entries[path];
  if (entry?.kind !== "record") throw new Error(`No record entry at ${path}`);
  return entry;
}

async function plan(input: SwapBatchInput, file: SwapFile): Promise<PlannedSwap> {
  const { entry: original, staged, moving } = file.replace;
  // An absent file is rebuilt by the link alone, which makes no copy; a removal moves the file aside and links nothing.
  const present = await readStat(join(input.checkout, file.path)) !== null;
  const copy: AsideCopyRecord | null = present ? {
    name: nameAsideFile({ path: file.path, base: original.base.blob, writer: input.writer, role: "aside" }),
    moving, linked: staged?.written ?? null, writeBackSent: false, landed: null,
  } : null;
  const copies = copy === null ? original.copies : [...original.copies, copy];
  // The removed file's entry stays its record's, recorded absent and pending, until the file and its copies are gone.
  if (staged === null) return { path: file.path, original, entry: { ...original, stat: null, pending: true, copies }, copy, staged: null };
  const stagedStat = await readStat(join(input.checkout, staged.location));
  if (stagedStat === null) throw new Error(`The staged file for ${file.path} is gone: ${staged.location}`);
  // A file other than Markdown carries no stamp, so its entry names what is being replaced until the swap settles.
  const inProgress = file.path.endsWith(".md") ? original.inProgress : { replaces: original.base, copy: copy?.name ?? null };
  const entry: RecordEntry = {
    ...original, base: staged.base, written: staged.written, stat: stagedStat, pending: true, inProgress, copies,
  };
  return { path: file.path, original, entry, copy, staged: { file: staged, stat: stagedStat } };
}

/** One file's swap as it ended. */
interface SwapDone {
  readonly entry: RecordEntry;
}

/** The aside copies a batch made of a file and still keeps: the records its entry holds that it did not before. */
function madeCopies(original: RecordEntry, entry: RecordEntry): string[] {
  const before = new Set(original.copies.map((record) => record.name));
  return entry.copies.filter((record) => !before.has(record.name)).map((record) => record.name);
}

/** Move the file aside, link its staged file in — none for a removal — and check the aside copy. */
async function swapOne(input: SwapBatchInput, swap: PlannedSwap): Promise<SwapDone> {
  const { checkout, hooks } = input;
  const moves = retriedMoves(input);
  const path = join(checkout, swap.path);
  const staged = swap.staged === null ? null : join(checkout, swap.staged.file.location);
  await hooks?.afterRecheck?.(swap.path);
  if (swap.copy === null) return staged === null ? { entry: swap.entry } : rebuild(input, swap, { staged, path });
  const aside = join(checkout, swap.copy.name);
  await mkdir(dirname(aside), { recursive: true });
  try {
    await moves.rename(path, aside);
  } catch {
    // Still refused past the bound: the file stays as it was, its entry restored and pending.
    if (staged !== null) await rm(staged, { force: true });
    return { entry: { ...swap.original, pending: true } };
  }
  await hooks?.afterMove?.(swap.path);
  const linked = staged === null ? { entry: swap.entry } : await linkStagedIn(moves, swap, { staged, aside, path });
  if (linked.done) return linked;
  const settling = {
    checkout, path: swap.path, entry: linked.entry, copy: swap.copy, format: input.format, takeIn: input.takeIn,
    writer: input.writer, fs: input.fs, retrySleep: input.retrySleep, gate: input.gate,
  };
  const checked = await checkAsideCopy(settling);
  // An edit refused or clashed at the first check goes back to its path, where the person can see it.
  const { answer } = checked.kind === "sent" ? checked : { answer: null };
  const held = checked.kind === "sent" && (answer === "refused" || answer === "unparseable" || answer === "clashed")
    ? await putBack(settling, { ...checked, answer })
    : checked;
  await hooks?.afterFirstCheck?.(swap.path);
  return { entry: held.entry };
}

/** Rebuild an absent file by the link alone, yielding to a save that recreated it first. */
async function rebuild(input: SwapBatchInput, swap: PlannedSwap, at: { readonly staged: string; readonly path: string }): Promise<SwapDone> {
  await input.hooks?.beforeRebuildLink?.(swap.path);
  const linked = await retriedMoves(input).linkOnto(at.staged, at.path);
  await rm(at.staged, { force: true });
  return { entry: linked ? swap.entry : yielded(swap) };
}

/**
 * Link the staged file onto the path the file was moved from. A save that recreated the path wins, the entry keeping
 * the version it was saved against, pending; a link failing otherwise puts the old file back, done.
 */
async function linkStagedIn(
  moves: RetriedMoves, swap: PlannedSwap, at: { readonly staged: string; readonly aside: string; readonly path: string },
): Promise<SwapDone & { readonly done?: true }> {
  let linked: boolean;
  try {
    linked = await moves.linkOnto(at.staged, at.path);
  } catch {
    await rm(at.staged, { force: true });
    return { ...await linkBack(moves, swap, at), done: true };
  }
  await rm(at.staged, { force: true });
  return { entry: linked ? swap.entry : yielded(swap) };
}

/**
 * Put the old file back where the staged file failed to link for a reason other than a save recreating the path. A
 * copy that is a symbolic link is never linked back: its path stays absent, pending, and the copy is deleted later.
 */
async function linkBack(
  moves: RetriedMoves, swap: PlannedSwap, at: { readonly aside: string; readonly path: string },
): Promise<SwapDone> {
  const restored: RecordEntry = { ...swap.original, pending: true, copies: swap.entry.copies };
  if ((await readStat(at.aside))?.type !== "file" || !await moves.linkOnto(at.aside, at.path)) return { entry: restored };
  await rm(at.aside, { force: true });
  return { entry: { ...restored, copies: swap.original.copies } };
}

/** The entry of a file whose replacement yielded to a save: the replaced version still recorded, pending. */
function yielded(swap: PlannedSwap): RecordEntry {
  const { base, written, stat } = swap.original;
  return { ...swap.entry, base, written, stat, pending: true };
}

function withEntry(index: ProjectionIndex, path: string, entry: RecordEntry): ProjectionIndex {
  return { ...index, entries: { ...index.entries, [path]: entry } };
}
