/**
 * The second check: at a command's end, under each worktree's projection lock again, each aside copy the command made
 * is checked once more before it is deleted, since a save that opened the file just before its move can write after
 * the first check. A copy still empty is left for the next command's sweep.
 */
import { join } from "node:path";
import type { AsideWriterInput } from "./aside.js";
import { settleAsideCopy, type CopySettlement } from "./aside-copies.js";
import type { SwapMoves } from "./aside-moves.js";
import type { ObjectFormat } from "./blob-id.js";
import { readStat } from "./change-detection.js";
import { commitProjectionIndex } from "./index-file.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionLocation } from "./location.js";
import type { ReadGateDependencies } from "./read-gate.js";
import { dropRemovedEntries } from "./swap.js";
import type { TakeInPort } from "./take-in-port.js";

/** What the second check settles, run under the worktree's projection lock; its moves are the system's unless a test injects its own. */
export interface SecondCheckInput extends SwapMoves {
  readonly location: ProjectionLocation;
  readonly checkout: string;
  readonly index: ProjectionIndex;
  /** The aside copies the command's batches made, by path. */
  readonly copies: readonly { readonly path: string; readonly copy: string }[];
  /** The paths the command's batches removed a file from whose entry goes once the file and its last copy are gone. */
  readonly removals?: readonly string[];
  readonly format: ObjectFormat;
  readonly takeIn: TakeInPort;
  readonly writer: AsideWriterInput;
  /** The read gate every copy check runs on, the system's unless a test injects its own. */
  readonly gate?: ReadGateDependencies;
}

/** What the second check left: the index it wrote, and what became of each copy. */
export interface SecondCheckResult {
  readonly index: ProjectionIndex;
  readonly settled: readonly { readonly path: string; readonly copy: string; readonly settlement: CopySettlement }[];
}

/**
 * Check and settle each copy a command made, then write the index.
 * @param input - The copies, and the index recording them.
 * @returns The index as written, and each copy's settlement.
 */
export async function runSecondCheck(input: SecondCheckInput): Promise<SecondCheckResult> {
  const { checkout, format, takeIn, writer } = input;
  let { index } = input;
  const settled: { path: string; copy: string; settlement: CopySettlement }[] = [];
  for (const { path, copy } of input.copies) {
    const entry = index.entries[path];
    const record = entry?.kind === "record" ? entry.copies.find((each) => each.name === copy) : undefined;
    // Only a copy the index still records is checked: one whose record a later step of the command cleared is settled.
    if (entry?.kind !== "record" || record === undefined) continue;
    const settlement: CopySettlement = await isEmptyFile(join(checkout, copy))
      ? { kind: "kept", entry, answer: "empty" }
      : await settleAsideCopy({
        checkout, path, entry, copy: record, format, takeIn, writer, fs: input.fs, retrySleep: input.retrySleep, gate: input.gate,
      });
    index = { ...index, entries: { ...index.entries, [path]: settlement.entry } };
    settled.push({ path, copy, settlement });
  }
  // A removal completes once its file and the last aside copy of its path are gone.
  index = await dropRemovedEntries(index, checkout, input.removals ?? []);
  const recorded = { entries: new Set<string>(), ignoreFiles: false };
  return { index: await commitProjectionIndex({ location: input.location, checkout, index, recorded }), settled };
}

/**
 * Whether a copy is an empty file. A save that truncates the file before writing it can leave its copy empty for longer
 * than the settle window, and its write still lands there, so the second check neither sends nor deletes such a copy.
 */
async function isEmptyFile(path: string): Promise<boolean> {
  const stat = await readStat(path);
  return stat?.type === "file" && stat.size === 0n;
}
