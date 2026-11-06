/**
 * The second check: at a command's end, under each worktree's projection lock again, each aside copy the command made
 * is checked once more before it is deleted, since a save that opened the file just before its move can write after
 * the first check. A copy still empty is left for the next command's sweep.
 */
import type { AsideWriterInput } from "./aside.js";
import { settleAsideCopy, type CopySettlement } from "./aside-copies.js";
import type { SwapMoves } from "./aside-moves.js";
import type { ObjectFormat } from "./blob-id.js";
import { commitReturnedCopies } from "./returned-copies.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionLocation } from "./location.js";
import type { ReadGateDependencies } from "./read-gate.js";
import { dropRemovedEntries } from "./swap.js";
import { projectionLinkRemedy, type ProjectionLinkBoundary } from "./discovery-links.js";
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
  /** A linked original destination is left opaque while its saved copy remains recoverable. */
  readonly blockedByLink?: ProjectionLinkBoundary;
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
    const link = input.blockedByLink?.(path) ?? null;
    const settlement: CopySettlement = link === null ? await settleAsideCopy({
      checkout, path, entry, copy: record, format, takeIn, writer, keepEmpty: true,
      fs: input.fs, retrySleep: input.retrySleep, gate: input.gate, checkpoint: input.checkpoint,
    }) : { kind: "not-a-file", path, copy, entry, remedy: projectionLinkRemedy(link) };
    index = { ...index, entries: { ...index.entries, [path]: settlement.entry } };
    settled.push({ path, copy, settlement });
  }
  // A removal completes once its file and the last aside copy of its path are gone.
  index = await dropRemovedEntries(index, checkout,
    input.removals?.filter(path => (input.blockedByLink?.(path) ?? null) === null) ?? []);
  return { index: await commitReturnedCopies({ location: input.location, checkout, index, checkpoint: input.checkpoint,
    returned: settled.filter(each => each.settlement.kind === "returned" || each.settlement.kind === "linked-back")
      .map(({ path, copy }) => ({ path, copy })),
  }), settled };
}
