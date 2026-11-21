/**
 * The replace guard: before a file is replaced or removed, it is re-checked by the racy rule, and an edit found there is
 * taken in first, then, for a replacement, the record's current version restaged, for at most three passes.
 */
import { projectionLayMode } from "./lay-mode.js";
import { removeProjectionAsideFile } from "./aside-cleanup.js";
import { join } from "node:path";
import type { Store } from "../contract.js";
import type { Remedy, StoreRefusal } from "../refusal.js";
import type { AsideWriterInput } from "./aside.js";
import type { ObjectFormat } from "./blob-id.js";
import { checkChange, projectionFileReader, type ChangeVerdict, type ProjectionFileReader } from "./change-detection.js";
import { notAFileRemedy } from "./read-gate.js";
import type { FileStat, RecordEntry, RefusedMark } from "./index-schema.js";
import { parseStampedFile } from "./stamp.js";
import { stageRecordFile, type StagedFile } from "./staging.js";
import { unshownConflicts } from "./held-conflicts.js";
import type { RecordRenderer } from "./record-render.js";
import type { TakeInBase, TakeInHeld, TakeInPort, TakeInRequest, TakeInResult } from "./take-in-port.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { adoptionResolutionHold, pendingObservedRefusal } from "./recording-state.js";
import type { WriteBackDiagnostic } from "./write-back.js";

/** How many times the guard re-checks a file, taking in an edit each finds, before leaving it to the next command. */
export const GUARD_PASSES = 3;

/** What a guarded replacement checks and stages. */
export interface ReplaceGuardInput {
  readonly checkpoint?: () => Promise<void>;
  /** A take-in restaged by this guard is landing in the saving checkout. */
  readonly saveLanding?: boolean;
  readonly checkout: string;
  /** The file's repository-relative path. */
  readonly path: string;
  readonly entry: RecordEntry;
  /** The record's version staged for the path, null for a removal, which stages nothing. */
  readonly staged: StagedFile | null;
  /** What write-back read of a file it just sent or drew a clash into, re-checked in place of the entry. */
  readonly baseline?: { readonly stat: FileStat | null; readonly blob: string };
  readonly reference: bigint | null;
  readonly format: ObjectFormat;
  readonly store: Store;
  readonly writer: AsideWriterInput;
  readonly takeIn: TakeInPort;
  readonly renderer: RecordRenderer;
  /** A refresh's guard, where an archived file's forced edit over a settled entry may land. */
  readonly admitsForcedEdit?: boolean;
}

/** What the guard decided. */
export type GuardResult =
  /**
   * Replace the file with `staged`, or, null, remove it; `moving` is the blob id the swap moves aside, as its copy's
   * record names it.
   */
  | { readonly kind: "replace"; readonly entry: RecordEntry; readonly staged: StagedFile | null; readonly moving: string }
  /** Leave the file in place, its entry marked pending, and refused where the take-in refused its edit. */
  | { readonly kind: "unreplaced"; readonly entry: RecordEntry; readonly cause: TakeInHeld | "unsettled" }
  /** Leave a withheld file as it is, its entry unchanged: the guard never writes over it or sends it. */
  | { readonly kind: "unreplaced"; readonly entry: RecordEntry; readonly cause: "withheld" }
  /** A directory or other nonregular object stays in place, with its contents and a repair route. */
  | { readonly kind: "unreplaced"; readonly entry: RecordEntry; readonly cause: "not-a-file"; readonly remedy: Remedy }
  /** A read of the file failed for its permissions or saw it change, the file left in place and pending. */
  | { readonly kind: "unreplaced"; readonly entry: RecordEntry; readonly cause: "unreadable"; readonly mark: RefusedMark; readonly access: boolean }
  | { readonly kind: "unreplaced"; readonly entry: RecordEntry; readonly cause: "adoption-hold"; readonly mark: RefusedMark }
  /** The store refused the refresh's read: retryable, the file left in place and pending. */
  | {
    readonly kind: "unreplaced"; readonly entry: RecordEntry; readonly cause: "refresh-refused"; readonly refusal: StoreRefusal;
  };

/**
 * Guard one file's replacement or removal.
 * @param input - The file, what it is checked against, and how to take an edit in and restage.
 * @returns Whether to replace it, and the entry to record.
 */
export async function guardReplacement(input: ReplaceGuardInput): Promise<GuardResult> {
  // The guard never writes over a withheld file or sends it.
  if (input.entry.withheld) return { kind: "unreplaced", entry: input.entry, cause: "withheld" };
  const hold = adoptionResolutionHold(input.entry);
  if (hold !== null) {
    await discardStaged(input);
    return { kind: "unreplaced", entry: input.entry, cause: "adoption-hold", mark: hold };
  }
  const absolute = join(input.checkout, input.path);
  const reader = projectionFileReader(input.checkout, input.path);
  let observed: FileStat | null;
  try {
    observed = await reader.stat(absolute);
    if (observed?.type === "other") {
      const remedy = notAFileRemedy(absolute);
      return { kind: "unreplaced", cause: "not-a-file", remedy,
        entry: { ...input.entry, pending: true, refused: { reason: "not-a-file", remedy } } };
    }
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return refuseBlockedReplacement(input, error);
    throw error;
  }
  // A not-a-file hold settles once its path holds a regular file again, or nothing.
  const next = input.entry.refused?.reason === "not-a-file" ? { ...input, entry: { ...input.entry, refused: null } } : input;
  return recheck(next, reader, absolute, input.path.startsWith(".arc/completed/") ? observed : undefined);
}

async function refuseBlockedReplacement(input: Pick<ReplaceGuardInput, "checkout" | "entry" | "staged" | "checkpoint">,
  { mark, access }: Pick<ArchiveDestinationBlocked, "mark" | "access">): Promise<GuardResult> {
  await discardStaged(input);
  return { kind: "unreplaced", entry: pendingObservedRefusal(input.entry, mark), cause: "unreadable", mark, access };
}

async function discardStaged({ checkout, staged, checkpoint }: Pick<ReplaceGuardInput, "checkout" | "staged" | "checkpoint">): Promise<void> {
  if (staged !== null) await removeProjectionAsideFile(checkout, staged.location, checkpoint);
}

/** The edit the guard found at its path, marked a forced edit where a refresh's guard may admit one. */
function guardTakeInRequest(input: ReplaceGuardInput, entry: RecordEntry, base: TakeInBase): TakeInRequest {
  return { checkout: input.checkout, path: input.path, copy: null, entry, base, observedEdit: true,
    ...(input.admitsForcedEdit === true ? { forcedEdit: true as const } : {}) };
}

/** Re-check the file, taking in an edit found there and restaging, for at most three passes. */
async function recheck(input: ReplaceGuardInput, reader: ProjectionFileReader, absolute: string, observed?: FileStat | null): Promise<GuardResult> {
  let { entry, staged } = input;
  let baseline: { readonly stat: FileStat | null; readonly blob: string } = input.baseline
    ?? { stat: entry.stat, blob: entry.written };
  const replace = (replaced: RecordEntry): GuardResult => ({ kind: "replace", entry: replaced, staged, moving: baseline.blob });
  for (let pass = 1; ; pass += 1) {
    const observation = await readReplacement(input, reader, absolute, baseline, observed);
    observed = undefined;
    if (observation instanceof ArchiveDestinationBlocked) return refuseBlockedReplacement({ ...input, entry, staged }, observation);
    const { bytes, verdict } = observation;
    if (verdict.status !== "changed") return replace(recordReplacementStat(entry, verdict));
    const result = await input.takeIn(guardTakeInRequest(input, entry, baseOf(input.path, bytes, entry)));
    if (result.answer !== "taken-in") return guardHeldEdit(input, result, staged, verdict.stat, baseline.blob);
    if (pass === GUARD_PASSES) return { kind: "unreplaced", entry: { ...result.entry, pending: true }, cause: "unsettled" };
    ({ entry } = result);
    baseline = result.read;
    // A removal stages nothing, so its next pass re-checks what the take-in read.
    if (staged === null) continue;
    const restaged = await restage(input, entry, staged);
    if (restaged.status === "refused") {
      // A refused refresh is retryable: the file stays as it is, pending for the next command.
      return { kind: "unreplaced", entry: { ...restaged.entry, pending: true }, cause: "refresh-refused", refusal: restaged.refusal };
    }
    staged = restaged.result;
  }
}

async function guardHeldEdit(input: ReplaceGuardInput, result: Exclude<TakeInResult, { answer: "taken-in" }>,
  staged: StagedFile | null, stat: FileStat, moving: string): Promise<GuardResult> {
  if (result.archiveAccess !== undefined) return refuseBlockedReplacement({ ...input, entry: result.entry, staged },
    { mark: result.archiveAccess, access: true });
  // No edit: the stat seen becomes the file's baseline, so a later save to it still reads as one.
  return result.answer === "no-edit" ? unchangedReplacement(result, staged, stat, moving) : held(result, result.answer);
}

/** A hash equal to what was written lets the next check match by stat alone. */
function recordReplacementStat(entry: RecordEntry, verdict: Exclude<ChangeVerdict, { status: "changed" }>): RecordEntry {
  return verdict.status === "hashed-clean" ? { ...entry, stat: verdict.stat } : entry;
}

async function readReplacement(input: ReplaceGuardInput, reader: ProjectionFileReader, path: string,
  baseline: { readonly stat: FileStat | null; readonly blob: string }, observed?: FileStat | null) {
  let bytes: Uint8Array = new Uint8Array();
  try {
    const verdict = await checkChange({ path, recorded: baseline.stat, written: baseline.blob, reference: input.reference, format: input.format, observed },
      async absolute => (bytes = await reader.read(absolute)), reader.stat);
    return { bytes, verdict };
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return error;
    throw error;
  }
}

/** A path holding something other than a regular file waits, with the repair its remedy names. */
export function notAFileHoldMark(remedy: Remedy): RefusedMark {
  return { reason: "The file is pending: its path is not a regular file.", remedy };
}

/**
 * Report a guard hold once, from whichever step receives it, with the guard's or the store refusal's remedy. A withheld
 * file and a take-in's answer are reported where they arise.
 */
export function reportGuardHold(report: ((diagnostic: WriteBackDiagnostic) => void) | undefined,
  path: string, copy: string | null, guarded: GuardResult, holdAccess?: (diagnostic: WriteBackDiagnostic) => void): void {
  if (guarded.kind !== "unreplaced") return;
  const mark = guardHoldMark(guarded);
  const send = guarded.cause === "unreadable" && guarded.access ? holdAccess ?? report : report;
  if (mark !== null) send?.({ path, copy, mark });
}

function guardHoldMark(guarded: Extract<GuardResult, { kind: "unreplaced" }>): RefusedMark | null {
  if (guarded.cause === "unreadable" || guarded.cause === "adoption-hold") return guarded.mark;
  if (guarded.cause === "not-a-file") return notAFileHoldMark(guarded.remedy);
  if (guarded.cause === "refresh-refused") {
    return { reason: `The edit landed, but restaging failed: ${guarded.refusal.condition}`, remedy: guarded.refusal.remedy };
  }
  if (guarded.cause === "unsettled") return { reason: "The file is pending: it stayed unsettled across repeated saves.",
    remedy: { text: "Let the editor finish saving; the next command will retry the file." } };
  return null;
}

function unchangedReplacement(result: Extract<TakeInResult, { answer: "no-edit" }>, staged: StagedFile | null,
  stat: FileStat, moving: string): GuardResult {
  return { kind: "replace", entry: { ...result.entry, stat: result.read?.stat ?? stat }, staged,
    moving: result.read?.blob ?? moving };
}

/** An answer that leaves the file in place, its edit there: pending, and refused where the take-in refused it. */
function held(result: TakeInResult, answer: TakeInHeld): GuardResult {
  const refused = "mark" in result ? result.mark : result.entry.refused;
  return { kind: "unreplaced", entry: { ...result.entry, pending: true, refused }, cause: answer };
}

/** The base a path's edit is taken in against: the stamp a Markdown file carries, else its entry's version. */
function baseOf(path: string, bytes: Uint8Array, entry: RecordEntry): TakeInBase {
  if (!path.endsWith(".md")) return { kind: "blob", blob: entry.base.blob };
  return { kind: "stamp", stamp: parseStampedFile(new TextDecoder().decode(bytes)).stamp };
}

type RestageResult = { readonly status: "ok"; readonly result: StagedFile }
  | { readonly status: "refused"; readonly refusal: StoreRefusal; readonly entry: RecordEntry };

/** Re-read the record's current version and stage it in place of what was staged. */
async function restage(input: ReplaceGuardInput, entry: RecordEntry, staged: StagedFile): Promise<RestageResult> {
  const read = await input.store.read({ reference: entry.reference });
  if (read.status !== "ok") return { ...read, entry };
  const restaged = await stageRecordFile({
    checkout: input.checkout, path: input.path, record: read.result, replacing: entry.base.blob, writer: input.writer,
    format: input.format, layMode: projectionLayMode(input.path, entry, input.saveLanding),
    readOnly: entry.protected, renderer: input.renderer, checkpoint: input.checkpoint,
  });
  if (restaged.status === "refused") return { ...restaged, entry: { ...entry, unshown: unshownConflicts(entry, read.result.conflicts) } };
  await input.checkpoint?.();
  await removeProjectionAsideFile(input.checkout, staged.location, input.checkpoint, false);
  return restaged;
}
