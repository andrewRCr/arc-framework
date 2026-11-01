/**
 * A file other than Markdown carries no stamp, so its index entry alone holds its base, and while a replacement is in
 * progress, the version it replaces and the aside copy its batch makes of the file.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { RecordVersion } from "../identity.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import { storedBlobId, type ObjectFormat } from "./blob-id.js";
import { lineDistance, type HistoryMemo } from "./base-recovery.js";
import { readStat } from "./change-detection.js";
import type { RecordEntry } from "./index-schema.js";
import { SETTLE_WINDOW_NS, wallClockNs } from "./read-gate.js";

/** What reading a file other than Markdown found. */
export type StamplessRead =
  /** Empty and younger than the settle time: the next command reads it. */
  | { readonly kind: "wait" }
  /** It holds what the projection wrote, or a version a replacement in progress names. */
  | { readonly kind: "unedited" }
  /** An edit, merging from this base. */
  | { readonly kind: "edit"; readonly base: RecordEntry["base"] }
  /**
   * Neither version of a replacement in progress could be read, so the file takes neither: it stays pending and is
   * reported with the refusal, written back nowhere, until a read succeeds.
   */
  | { readonly kind: "pending"; readonly refusal: StoreRefusal };

/** What the read compares. */
export interface StamplessReadInput {
  readonly entry: RecordEntry;
  /** The file's text. */
  readonly text: string;
  /** Its modification time in nanoseconds. */
  readonly mtimeNs: bigint;
  readonly format: ObjectFormat;
  readonly memo: HistoryMemo;
  /** The wall clock in nanoseconds. */
  readonly now?: () => bigint;
}

/**
 * Read a file other than Markdown against its entry.
 * @param input - The file's text and modification time, its entry, and how to reach `history`.
 * @returns What it holds, or the store's refusal of `history`.
 */
export async function readStamplessFile(input: StamplessReadInput): Promise<StoreResult<StamplessRead>> {
  const { entry } = input;
  // No stamp marks an empty file as projected, and an in-place save passes through one, so a young one waits.
  const now = input.now ?? wallClockNs;
  if (input.text === "" && now() - input.mtimeNs < SETTLE_WINDOW_NS) return read({ kind: "wait" });
  const blob = storedBlobId(input.text, { format: input.format, markdown: false });
  if (blob === entry.written) return read({ kind: "unedited" });
  const { inProgress } = entry;
  if (inProgress === null) return read({ kind: "edit", base: entry.base });
  // Old content a stopped replacement left reads as unedited, so it is refreshed and never written back over the newer.
  if (blob === inProgress.replaces.blob) return read({ kind: "unedited" });
  const history = await input.memo.read(entry.reference);
  if (history.status === "refused") {
    // Taking either version unread could write old content over the newer one.
    return history.refusal.code === "state-unresolvable" ? read({ kind: "pending", refusal: history.refusal }) : history;
  }
  const contentOf = (version: RecordVersion): string | null =>
    history.result.find((each) => each.version === version)?.content ?? null;
  const lines = input.text.replaceAll("\r\n", "\n").split("\n");
  const distance = (version: RecordVersion): number => {
    const content = contentOf(version);
    return content === null ? Number.POSITIVE_INFINITY : lineDistance(lines, content.split("\n")).changed;
  };
  // The entry's version is taken only where strictly closer, so a tie never merges from it over the replaced version.
  const closerToEntry = distance(entry.base.version) < distance(inProgress.replaces.version);
  return read({ kind: "edit", base: closerToEntry ? entry.base : inProgress.replaces });
}

function read(found: StamplessRead): StoreResult<StamplessRead> {
  return { status: "ok", result: found };
}

/** One aside copy to delete, and the file it was made of. */
export interface AsideCopyDeletion {
  readonly checkout: string;
  /** The file's repository-relative path. */
  readonly path: string;
  readonly entry: RecordEntry;
  /** The copy's repository-relative location, as its record names it. */
  readonly copy: string;
}

/**
 * Delete an aside copy: the one deletion every deleter calls. It clears the copy's own record, and the entry's
 * in-progress record where that names this copy and the file holds what the batch linked there, read by the file
 * identity the entry records.
 * @param input - The copy, the file it was made of, and the file's entry.
 * @returns The entry as it stands once the copy is gone.
 */
export async function deleteAsideCopy(input: AsideCopyDeletion): Promise<RecordEntry> {
  const { entry } = input;
  // A copy that is a symbolic link is removed as itself, never followed.
  await rm(join(input.checkout, input.copy), { force: true });
  const copies = entry.copies.filter((record) => record.name !== input.copy);
  if (entry.inProgress?.copy !== input.copy) return { ...entry, copies };
  const stat = await readStat(join(input.checkout, input.path));
  const holdsLinked = stat?.type === "file" && entry.stat !== null && stat.ino === entry.stat.ino;
  return { ...entry, copies, inProgress: holdsLinked ? null : entry.inProgress };
}
