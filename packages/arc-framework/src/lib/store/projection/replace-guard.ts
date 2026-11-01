/**
 * The replace guard: before a file is replaced, it is re-checked by the racy rule, and an edit found there is taken in
 * first, then the record's current version restaged, for at most three passes.
 */
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../contract.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import type { AsideWriterInput } from "./aside.js";
import type { ObjectFormat } from "./blob-id.js";
import { checkChange } from "./change-detection.js";
import type { FileStat, RecordEntry } from "./index-schema.js";
import { parseStampedFile } from "./stamp.js";
import { stageRecordFile, type StagedFile } from "./staging.js";
import type { TakeInBase, TakeInHeld, TakeInPort, TakeInResult } from "./take-in-port.js";

/** How many times the guard re-checks a file, taking in an edit each finds, before leaving it to the next command. */
export const GUARD_PASSES = 3;

/** What a guarded replacement checks and stages. */
export interface ReplaceGuardInput {
  readonly checkout: string;
  /** The file's repository-relative path. */
  readonly path: string;
  readonly entry: RecordEntry;
  /** The record's version staged for the path. */
  readonly staged: StagedFile;
  /** What write-back read of a file it just sent or drew a clash into, re-checked in place of the entry. */
  readonly baseline?: { readonly stat: FileStat; readonly blob: string };
  readonly reference: bigint | null;
  readonly format: ObjectFormat;
  readonly store: Store;
  readonly writer: AsideWriterInput;
  readonly takeIn: TakeInPort;
}

/** What the guard decided. */
export type GuardResult =
  /** Replace the file with `staged`; `moving` is the blob id the swap moves aside, as its copy's record names it. */
  | { readonly kind: "replace"; readonly entry: RecordEntry; readonly staged: StagedFile; readonly moving: string }
  /** Leave the file in place, its entry marked pending, and refused where the take-in refused its edit. */
  | { readonly kind: "unreplaced"; readonly entry: RecordEntry; readonly cause: TakeInHeld | "unsettled" }
  /** The store refused the refresh's read: retryable, the file left in place and pending. */
  | {
    readonly kind: "unreplaced"; readonly entry: RecordEntry; readonly cause: "refresh-refused"; readonly refusal: StoreRefusal;
  };

/**
 * Guard one file's replacement.
 * @param input - The file, what it is checked against, and how to take an edit in and restage.
 * @returns Whether to replace it, and the entry to record.
 */
export async function guardReplacement(input: ReplaceGuardInput): Promise<GuardResult> {
  let { entry, staged } = input;
  let baseline: { readonly stat: FileStat | null; readonly blob: string } = input.baseline
    ?? { stat: entry.stat, blob: entry.written };
  const replace = (replaced: RecordEntry): GuardResult => ({ kind: "replace", entry: replaced, staged, moving: baseline.blob });
  for (let pass = 1; ; pass += 1) {
    let bytes: Uint8Array = new Uint8Array();
    const verdict = await checkChange({
      path: join(input.checkout, input.path), recorded: baseline.stat, written: baseline.blob, reference: input.reference,
      format: input.format,
    }, async (path) => (bytes = await readFile(path)));
    // A hash equal to what was written re-records the stat, so the next check matches it by stat alone.
    if (verdict.status === "hashed-clean") return replace({ ...entry, stat: verdict.stat });
    if (verdict.status !== "changed") return replace(entry);
    const base = baseOf(input.path, bytes, entry);
    const result = await input.takeIn({ checkout: input.checkout, path: input.path, copy: null, entry, base });
    // No edit: the stat seen becomes the file's baseline, so a later save to it still reads as one.
    if (result.answer === "no-edit") return replace({ ...result.entry, stat: verdict.stat });
    if (result.answer !== "taken-in") return held(result, result.answer);
    if (pass === GUARD_PASSES) return { kind: "unreplaced", entry: { ...result.entry, pending: true }, cause: "unsettled" };
    ({ entry } = result);
    baseline = result.read;
    const restaged = await restage(input, entry, staged);
    if (restaged.status === "refused") {
      // A refused refresh is retryable: the file stays as it is, pending for the next command.
      return { kind: "unreplaced", entry: { ...entry, pending: true }, cause: "refresh-refused", refusal: restaged.refusal };
    }
    staged = restaged.result;
  }
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

/** Re-read the record's current version and stage it in place of what was staged. */
async function restage(input: ReplaceGuardInput, entry: RecordEntry, staged: StagedFile): Promise<StoreResult<StagedFile>> {
  const read = await input.store.read({ reference: entry.reference });
  if (read.status !== "ok") return read;
  const restaged = await stageRecordFile({
    checkout: input.checkout, path: input.path, record: read.result, replacing: entry.base.blob, writer: input.writer,
    format: input.format, readOnly: entry.protected,
  });
  await rm(join(input.checkout, staged.location), { force: true });
  return { status: "ok", result: restaged };
}
