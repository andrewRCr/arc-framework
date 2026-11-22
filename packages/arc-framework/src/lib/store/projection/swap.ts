/**
 * The swap: a batch of replacements, each moving the old file into the aside folder and linking its staged file onto
 * the path, between two index writes, so a save timed into a replacement lands in the aside copy rather than being lost.
 */
import { removeProjectionAsideFile } from "./aside-cleanup.js";
import { withProjectionEntry } from "./index-memory.js";
import { join } from "node:path";
import { nameAsideFile, type AsideWriterInput } from "./aside.js";
import { checkAsideCopy, putBack } from "./aside-copies.js";
import { retriedMoves, type RetriedMoves, type SwapMoves } from "./aside-moves.js";
import type { ObjectFormat } from "./blob-id.js";
import { projectionFileReader, readStat } from "./change-detection.js";
import { commitProjectionIndex } from "./index-file.js";
import { commitReturnedCopies, type ReturnedCopy } from "./returned-copies.js";
import type { AsideCopyRecord, FileStat, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { ArchiveChangeRefusal } from "./archive-selection.js";
import type { ProjectionLocation } from "./location.js";
import type { ReadGateDependencies } from "./read-gate.js";
import type { GuardResult } from "./replace-guard.js";
import type { StagedFile } from "./staging.js";
import type { TakeInPort } from "./take-in-port.js";
import { ArchiveDestinationBlocked, archiveDestination } from "./archive-file.js";
import { installedArchiveInput, linkAcceptedArchiveInput, pendingObservedRefusal } from "./recording-state.js";
import { archiveInventoryLinkHold } from "./archive-discovery.js";
import { readAsideStat } from "./aside-discovery.js";

/** One file a batch replaces or, where the guard staged nothing, removes: the guard's decision to. */
export interface SwapFile {
  /** The file's repository-relative path. */
  readonly path: string;
  readonly replace: Extract<GuardResult, { readonly kind: "replace" }>;
  /** For a removal, whether the projection now lays another record at the path, which keeps its entry for that record. */
  readonly relaid?: boolean;
}

/**
 * The engine's hook points where a test or the harness can place a save: in each file's swap, and in `arc edit`'s
 * opening and `arc save`'s recovery and re-lock, which share this one set through the engine's ports.
 */
export interface SwapHooks {
  /** After opening intent is committed, before the file becomes writable. */
  readonly afterOpenIndexCommit?: (path: string) => Promise<void>;
  /** After unchanged accepted input is proved, before its resumed read-back guard. */
  readonly afterSaveRecoveryRead?: (path: string) => Promise<void>;
  /** After a landing guard, before the swap plans its paths. */
  readonly afterSaveGuard?: (path: string) => Promise<void>;
  /** After an unchanged opening is laid read-only, before its final check. */
  readonly afterSaveReadOnly?: (path: string) => Promise<void>;
  /** Before the final file check that authorizes clearing an opening. */
  readonly beforeSaveMarkClear?: (path: string) => Promise<void>;
  /** After the re-check, before the file is moved aside. */
  readonly afterRecheck?: (path: string) => Promise<void>;
  /** After the move, before the staged file is linked. */
  readonly afterMove?: (path: string) => Promise<void>;
  /** After the aside copy's first check. */
  readonly afterFirstCheck?: (path: string) => Promise<void>;
  /** Before an absent file's rebuild links its staged file. */
  readonly beforeRebuildLink?: (path: string) => Promise<void>;
  /** After an absent file was linked, before final settlement checks its rendering. */
  readonly afterRebuildLink?: (path: string) => Promise<void>;
}

/** What a batch swaps, and how; its moves are the system's unless a test injects its own. */
export interface SwapBatchInput extends SwapMoves {
  readonly location: ProjectionLocation;
  readonly checkout: string;
  readonly index: ProjectionIndex;
  readonly files: readonly SwapFile[];
  /** Whether the batch lays write-back's read-back, which keeps a pending mark a file carried into it. */
  readonly readBack: boolean;
  /** The enclosing refresh publishes settlement with its final state; returned aliases still publish before unlink. */
  readonly settlementPublication?: "caller";
  readonly writer: AsideWriterInput;
  readonly format: ObjectFormat;
  readonly takeIn: TakeInPort;
  /** The read gate every copy check runs on, the system's unless a test injects its own. */
  readonly gate?: ReadGateDependencies;
  readonly hooks?: SwapHooks;
  /**
   * Takes a path whose change was refused because its folder is not this checkout's, with the refusal's remedy; the
   * command keeps it as the path's answer and reports it once.
   */
  readonly refuseChange?: ArchiveChangeRefusal;
}

/** What a batch left: the index as its second write recorded it, and the aside copies the command keeps. */
export interface SwapBatchResult {
  readonly index: ProjectionIndex;
  readonly copies: readonly { readonly path: string; readonly copy: string }[];
  /** The paths the batch removed a file from whose entry goes once the file and its last aside copy are gone. */
  readonly removals: readonly string[];
  /** Staged replacements that did not remain installed at their paths when the batch settled. */
  readonly unreplaced: readonly string[];
  /** Installed paths rebuilt without moving an existing file aside. */
  readonly rebuilt: readonly string[];
  /** Paths whose change the batch refused and reported, which callers leave unreported. */
  readonly reported: readonly string[];
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
  readonly blocked?: SwapRefusal;
}

type SwapRefusal = { readonly mark: RefusedMark; readonly access?: boolean };

/**
 * Swap a batch of files.
 * @param input - The files and the index they are recorded in.
 * @returns The index the batch wrote last, and the copies it made.
 */
export async function swapBatch(input: SwapBatchInput): Promise<SwapBatchResult> {
  const plans = await Promise.all(input.files.map(async (file) => plan(input, file)));
  let index = await commitProjectionIndex({
    location: input.location, checkout: input.checkout, checkpoint: input.checkpoint,
    index: plans.reduce((built, each) => withEntry(built, each.path, each.entry), input.index),
  });
  const copies: { path: string; copy: string }[] = [];
  const returned: ReturnedCopy[] = [];
  const reported: string[] = [];
  const blocked = new Set<string>();
  const reportHold: ArchiveChangeRefusal = (refusal, access) => {
    blocked.add(refusal.path);
    if (input.refuseChange === undefined || reported.includes(refusal.path)) return;
    input.refuseChange(refusal, access);
    reported.push(refusal.path);
  };
  for (const each of plans) {
    const swapped = await swapOne(input, each, async (swap) => {
      const installing = beginAcceptedLay(swap);
      if (installing === swap) return swap;
      index = await commitProjectionIndex({ location: input.location, checkout: input.checkout, checkpoint: input.checkpoint,
        index: withEntry(index, swap.path, installing.entry) });
      return installing;
    });
    if (swapped.blocked !== undefined) reportHold({ path: each.path, copy: null, mark: swapped.blocked.mark }, swapped.blocked.access);
    index = withEntry(index, each.path, swapped.entry);
    returned.push(...(swapped.returned ?? []).map(copy => ({ path: each.path, copy })));
    copies.push(...madeCopies(each.original, swapped.entry).map((copy) => ({ path: each.path, copy })));
  }
  const installed = new Set<string>();
  for (const each of plans) {
    if (blocked.has(each.path)) continue;
    const settlement = await settled(input, each, entryAt(index, each.path), reportHold);
    index = withEntry(index, each.path, settlement.entry);
    if (settlement.installed) installed.add(each.path);
  }
  const unreplaced = input.files.filter(file => file.replace.staged !== null && !installed.has(file.path)).map(file => file.path);
  const removals = input.files.filter((file) => file.replace.staged === null && file.relaid !== true).map((file) => file.path);
  index = await dropRemovedEntries(index, input.checkout, removals.filter(path => !blocked.has(path)), reportHold);
  if (input.settlementPublication !== "caller" || returned.length > 0) {
    index = await commitReturnedCopies({ location: input.location, checkout: input.checkout, index, checkpoint: input.checkpoint,
      returned: returned.filter(copy => !blocked.has(copy.path)), refuseChange: reportHold });
  }
  return { index, copies: remainingCopies(index, copies), removals, unreplaced, reported,
    rebuilt: plans.filter(plan => plan.copy === null && plan.staged !== null && !unreplaced.includes(plan.path)).map(plan => plan.path) };
}

/** Publish that the path may now receive a new rendering before linking it into place. */
function beginAcceptedLay(swap: PlannedSwap): PlannedSwap {
  if (swap.staged === null) return swap;
  const entry = linkAcceptedArchiveInput(swap.entry, swap.copy);
  return entry === swap.entry ? swap : { ...swap, entry };
}

/**
 * Drop the entry of each removed file that is gone, with no aside copy of its path left, the removal complete. A path
 * the projection now lays another record at is never named here: its entry stays, pending, as a deleted file's.
 * @param index - The index.
 * @param checkout - The checkout root.
 * @param removals - The paths removed whose record has left them.
 * @returns The index without those entries.
 */
export async function dropRemovedEntries(index: ProjectionIndex, checkout: string, removals: readonly string[],
  refuseChange: ArchiveChangeRefusal): Promise<ProjectionIndex> {
  const gone = new Set<string>();
  for (const path of removals) {
    const entry = index.entries[path];
    // An entry is dropped only while its archive path is this checkout's, so a path refused mid-command keeps its entry.
    if (entry?.kind !== "record" || entry.copies.length > 0) continue;
    const refused = archiveDestination(checkout, path);
    if (refused !== null) {
      refuseChange({ path, copy: null, mark: refused.mark }, refused.cause === "access");
      continue;
    }
    const stat = await readSwapDestination(checkout, path);
    if (stat instanceof ArchiveDestinationBlocked) refuseChange({ path, copy: null, mark: stat.mark }, stat.access);
    else if (stat === null) gone.add(path);
  }
  if (gone.size === 0) return index;
  for (const path of gone) index = withProjectionEntry(index, path, undefined);
  return index;
}

/** The entry the second write records: what a file the batch put in place no longer needs. */
async function settled(input: SwapBatchInput, swap: PlannedSwap, entry: RecordEntry,
  refuseChange: ArchiveChangeRefusal): Promise<{ entry: RecordEntry; installed: boolean }> {
  // A removal links nothing, so its file stays pending until it and its copies are gone.
  if (swap.staged === null) return { entry, installed: false };
  const stat = await readSwapDestination(input.checkout, swap.path);
  if (stat instanceof ArchiveDestinationBlocked) {
    refuseChange({ path: swap.path, copy: null, mark: stat.mark }, stat.access);
    return { entry: pendingObservedRefusal(entry, stat.mark), installed: false };
  }
  if (stat?.type !== "file" || stat.ino !== swap.staged.stat.ino) return { entry, installed: false };
  // A read-back lays what write-back took in, so a file already pending before it waits for the next refresh.
  const placed = { ...entry, pending: swap.staged.file.rendering?.keepPending === true || input.readBack && swap.original.pending };
  return { entry: swap.copy === null ? { ...placed, inProgress: null } : placed, installed: true };
}

async function readSwapDestination(checkout: string, path: string, index?: ProjectionIndex): Promise<FileStat | ArchiveDestinationBlocked | null> {
  try {
    const stat = await projectionFileReader(checkout, path).stat(join(checkout, path));
    const opaque = stat?.type === "symlink" && index !== undefined ? archiveInventoryLinkHold(index, path) : null;
    return opaque === null ? stat : new ArchiveDestinationBlocked(opaque);
  }
  catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return error;
    throw error;
  }
}

function entryAt(index: ProjectionIndex, path: string): RecordEntry {
  const entry = index.entries[path];
  if (entry?.kind !== "record") throw new Error(`No record entry at ${path}`);
  return entry;
}

async function plan(input: SwapBatchInput, file: SwapFile): Promise<PlannedSwap> {
  const { entry: original, staged, moving } = file.replace;
  // An absent file is rebuilt by the link alone, which makes no copy; a removal moves the file aside and links nothing.
  const observed = await readSwapDestination(input.checkout, file.path, input.index);
  if (observed instanceof ArchiveDestinationBlocked) {
    if (staged !== null) await removeProjectionAsideFile(input.checkout, staged.location, input.checkpoint);
    return { path: file.path, original, entry: pendingObservedRefusal(original, observed.mark),
      copy: null, staged: null, blocked: observed };
  }
  const present = observed !== null;
  const copy: AsideCopyRecord | null = present ? {
    name: nameAsideFile({ path: file.path, base: original.base.blob, writer: input.writer, role: "aside" }),
    moving, linked: staged?.written ?? null, writeBackSent: false, landed: null,
    rendering: { markers: original.markers, notices: original.notices },
  } : null;
  const copies = copy === null ? original.copies : [...original.copies, copy];
  // The removed file's entry stays its record's, recorded absent and pending, until the file and its copies are gone.
  if (staged === null) return { path: file.path, original, entry: { ...original, stat: null, pending: true, copies },
    copy, staged: null };
  const stagedStat = await readStat(join(input.checkout, staged.location));
  if (stagedStat === null) throw new Error(`The staged file for ${file.path} is gone: ${staged.location}`);
  // A file other than Markdown carries no stamp, so its entry names what is being replaced until the swap settles.
  const inProgress = file.path.endsWith(".md") ? original.inProgress : { replaces: original.base, copy: copy?.name ?? null };
  const entry: RecordEntry = {
    ...renderedEntry(original, staged), base: staged.base, written: staged.written, stat: stagedStat, pending: true, inProgress, copies,
  };
  return { path: file.path, original, entry, copy, staged: { file: staged, stat: stagedStat } };
}

function renderedEntry(original: RecordEntry, staged: StagedFile): RecordEntry {
  const state = staged.rendering;
  if (state === undefined) return original;
  return { ...original, markers: state.markers, notices: state.notices, unshown: state.unshown,
    ...(state.protected === undefined ? {} : { protected: state.protected }),
    ...(state.refused === undefined ? {} : { refused: state.refused }) };
}

/** One file's swap as it ended. */
interface SwapDone {
  readonly entry: RecordEntry;
  readonly returned?: readonly string[];
  /** The refusal a change at the path met, its folder not this checkout's. */
  readonly blocked?: SwapRefusal;
}

/** The aside copies a batch made of a file and still keeps: the records its entry holds that it did not before. */
function madeCopies(original: RecordEntry, entry: RecordEntry): string[] {
  const before = new Set(original.copies.map((record) => record.name));
  return entry.copies.filter((record) => !before.has(record.name)).map((record) => record.name);
}

/** Move the file aside, link its staged file in — none for a removal — and check the aside copy. */
async function swapOne(input: SwapBatchInput, swap: PlannedSwap,
  beginLay: (swap: PlannedSwap) => Promise<PlannedSwap>): Promise<SwapDone> {
  if (swap.blocked !== undefined) return { entry: swap.entry, blocked: swap.blocked };
  const { checkout, hooks } = input;
  const path = join(checkout, swap.path);
  const staged = swap.staged === null ? null : join(checkout, swap.staged.file.location);
  await hooks?.afterRecheck?.(swap.path);
  const copy = swap.copy;
  if (copy === null) return staged === null ? { entry: swap.entry } : rebuild(input, swap, { staged, path }, beginLay);
  const aside = join(checkout, copy.name);
  const moveRefusal = await moveAside(input, swap, path, aside);
  if (moveRefusal !== null) return moveRefusal;
  await hooks?.afterMove?.(swap.path);
  const installing = await beginLay(swap);
  const linked = staged === null ? { entry: installing.entry } : await linkStagedIn(input, installing, { staged, aside, path });
  if (linked.done) return linked;
  const settling = {
    checkout, path: swap.path, entry: linked.entry, copy, format: input.format, takeIn: input.takeIn,
    writer: input.writer, fs: input.fs, retrySleep: input.retrySleep, gate: input.gate, checkpoint: input.checkpoint,
  };
  const checked = await checkAsideCopy(settling);
  if (checked.kind === "blocked-destination") return { entry: pendingObservedRefusal(checked.entry, checked.mark), blocked: checked };
  // An edit refused or clashed at the first check goes back to its path, where the person can see it.
  const { answer } = checked.kind === "sent" ? checked : { answer: null };
  const held = checked.kind === "sent" && (answer === "refused" || answer === "unparseable" || answer === "clashed")
    ? await putBack(settling, { ...checked, answer })
    : checked;
  await hooks?.afterFirstCheck?.(swap.path);
  if (held.kind === "blocked-destination") return { entry: pendingObservedRefusal(held.entry, held.mark), blocked: held };
  return { entry: held.entry, returned: held.kind === "returned" ? [copy.name] : [] };
}

/** Move the original path under the lease, preserving its basis when the move is refused. */
async function moveAside(input: SwapBatchInput, swap: PlannedSwap, path: string, aside: string): Promise<SwapDone | null> {
  const moves = retriedMoves(input, { checkout: input.checkout, path: swap.path });
  try { await moves.prepareAside(aside); }
  catch (error) {
    if (error instanceof ArchiveDestinationBlocked) {
      // A subsequent sweep discards the staged file once its directory is accessible again.
      if (error.access) return { entry: pendingObservedRefusal(swap.original, error.mark), blocked: error };
      return holdSwap(input, swap, swap.original, error);
    }
    throw error;
  }
  const leafHold = archiveInventoryLinkHold(input.index, swap.path);
  try { await moves.rename(path, aside, { kind: "capture", leafHold }); }
  catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return holdSwap(input, swap, swap.original, error);
    await input.checkpoint?.();
    if (swap.staged !== null) await removeProjectionAsideFile(input.checkout, swap.staged.file.location, input.checkpoint);
    return { entry: { ...swap.original, pending: true } };
  }
  return null;
}

/** Rebuild an absent file by the link alone, yielding to a save that recreated it first. */
async function rebuild(input: SwapBatchInput, swap: PlannedSwap, at: { readonly staged: string; readonly path: string },
  beginLay: (swap: PlannedSwap) => Promise<PlannedSwap>): Promise<SwapDone> {
  await input.hooks?.beforeRebuildLink?.(swap.path);
  swap = await beginLay(swap);
  let linked: boolean;
  try { linked = await retriedMoves(input, { checkout: input.checkout, path: swap.path }).linkOnto(at.staged, at.path); }
  catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return holdSwap(input, swap, swap.original, error);
    throw error;
  }
  if (linked) await input.hooks?.afterRebuildLink?.(swap.path);
  await input.checkpoint?.();
  await removeProjectionAsideFile(input.checkout, at.staged, input.checkpoint);
  return { entry: linked ? installedArchiveInput(swap.entry) : yielded(swap) };
}

async function holdSwap(input: SwapBatchInput, swap: PlannedSwap, entry: RecordEntry, blocked: SwapRefusal): Promise<SwapDone> {
  if (swap.staged !== null) await removeProjectionAsideFile(input.checkout, swap.staged.file.location, input.checkpoint);
  return { entry: pendingObservedRefusal(entry, blocked.mark), blocked };
}


/**
 * Link the staged file onto the path the file was moved from. A save that recreated the path wins, the entry keeping
 * the version it was saved against, pending; a link failing otherwise puts the old file back, done.
 */
async function linkStagedIn(
  input: SwapBatchInput, swap: PlannedSwap, at: { readonly staged: string; readonly aside: string; readonly path: string },
): Promise<SwapDone & { readonly done?: true }> {
  const moves = retriedMoves(input, { checkout: input.checkout, path: swap.path });
  let linked: boolean;
  try {
    linked = await moves.linkOnto(at.staged, at.path);
  } catch (error) {
    await input.checkpoint?.();
    await removeProjectionAsideFile(input.checkout, at.staged, input.checkpoint, false);
    return { ...await recoverFailedLink(moves, swap, at, error), done: true };
  }
  await input.checkpoint?.();
  await removeProjectionAsideFile(input.checkout, at.staged, input.checkpoint, false);
  return { entry: linked ? installedArchiveInput(swap.entry) : yielded(swap) };
}

async function recoverFailedLink(moves: RetriedMoves, swap: PlannedSwap, at: { readonly aside: string; readonly path: string },
  error: unknown): Promise<SwapDone> {
  if (error instanceof ArchiveDestinationBlocked) return { entry: pendingObservedRefusal(yielded(swap), error.mark), blocked: error };
  try { return await linkBack(moves, swap, at); }
  catch (failure) {
    if (failure instanceof ArchiveDestinationBlocked) return { entry: pendingObservedRefusal(yielded(swap), failure.mark), blocked: failure };
    throw failure;
  }
}

/**
 * Put the old file back where the staged file failed to link for a reason other than a save recreating the path. A
 * copy that is a symbolic link is never linked back: its path stays absent, pending, and the copy is deleted later.
 */
async function linkBack(
  moves: RetriedMoves, swap: PlannedSwap, at: { readonly aside: string; readonly path: string },
): Promise<SwapDone> {
  const restored: RecordEntry = { ...swap.original, pending: true, copies: swap.entry.copies };
  if ((await readAsideStat(at.aside, swap.path))?.type !== "file" || await moves.returnOnto(at.aside, at.path) !== "linked") return { entry: restored };
  return { entry: restored, returned: swap.copy === null ? [] : [swap.copy.name] };
}

/** The entry of a file whose replacement yielded to a save: the replaced version still recorded, pending. */
function yielded(swap: PlannedSwap): RecordEntry {
  const { base, written, stat, markers, notices, unshown, refused, protected: protectedFile, acceptedInputStat } = swap.original;
  return { ...swap.entry, base, written, stat, markers, notices, unshown, refused, protected: protectedFile, acceptedInputStat, pending: true };
}

function withEntry(index: ProjectionIndex, path: string, entry: RecordEntry): ProjectionIndex {
  return withProjectionEntry(index, path, entry);
}

function remainingCopies(index: ProjectionIndex, copies: readonly ReturnedCopy[]): ReturnedCopy[] {
  return copies.filter(({ path, copy }) => {
    const entry = index.entries[path];
    return entry?.kind === "record" && entry.copies.some(record => record.name === copy);
  });
}
