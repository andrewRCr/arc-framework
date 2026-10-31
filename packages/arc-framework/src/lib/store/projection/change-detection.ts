/** Change detection by Git's racy rule: a stat match is clean only when older than the index's reference. */
import { lstat, mkdir, readFile as fsReadFile, stat as fsStat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import type { FileStat, ProjectionIndex } from "./index-schema.js";
import { PROJECTION_ASIDE_ROOT } from "./paths.js";

/** The racy reference: a stamp file at the aside folder's top, rewritten after each index write. */
export const PROJECTION_REFERENCE = `${PROJECTION_ASIDE_ROOT}/reference`;

/**
 * Read the racy reference's modification time.
 * @param checkout - The checkout root.
 * @returns Its modification time in nanoseconds, or null where it is missing, which makes every entry racy.
 */
export async function readReference(checkout: string): Promise<bigint | null> {
  return (await readStat(join(checkout, PROJECTION_REFERENCE)))?.mtimeNs ?? null;
}

/**
 * Rewrite the racy reference, which follows each index write.
 * @param checkout - The checkout root.
 */
export async function writeReference(checkout: string): Promise<void> {
  const reference = join(checkout, PROJECTION_REFERENCE);
  await mkdir(dirname(reference), { recursive: true });
  await writeFile(reference, "");
}

/** What an index write records afresh: these are racy against the reference it writes, never smudged against the old. */
export interface RecordedAfresh {
  /** The entry paths whose stats this write records. */
  readonly entries: ReadonlySet<string>;
  /** Whether it records a new snapshot of the ignore files. */
  readonly ignoreFiles: boolean;
}

/**
 * Smudge each entry and ignore-file record an index write carries over while it is racy against the reference the write
 * replaces: its cached size zeroed, so the next check hashes it and a save in its tick is still found.
 * @param index - The index about to be written.
 * @param reference - The reference it replaces, null where missing, which makes every one racy.
 * @param recorded - What the write records afresh.
 * @returns The index to write.
 */
export function smudgeRacyEntries(
  index: ProjectionIndex, reference: bigint | null, recorded: RecordedAfresh,
): ProjectionIndex {
  const entries = Object.fromEntries(Object.entries(index.entries).map(([path, entry]) => (
    [path, recorded.entries.has(path) ? entry : { ...entry, stat: smudged(entry.stat, reference) }]
  )));
  const ignoreFiles = recorded.ignoreFiles ? index.ignoreFiles : index.ignoreFiles?.map((record) => (
    record.stat === null ? record : { ...record, stat: smudged(record.stat, reference) }
  )) ?? null;
  return { ...index, entries, ignoreFiles };
}

function smudged<T extends FileStat | null>(stat: T, reference: bigint | null): T {
  if (stat === null || (reference !== null && stat.mtimeNs < reference)) return stat;
  return { ...stat, size: 0n };
}

/**
 * Re-record the stat of a file a check hashed clean as its entry's, so the next check matches it by stat.
 * @param index - The index.
 * @param path - The entry's repository-relative path.
 * @param stat - The stat the check read.
 * @returns The index with the entry's stat replaced; the write recording it lists the path among those it records.
 */
export function recordCleanStat(index: ProjectionIndex, path: string, stat: FileStat): ProjectionIndex {
  const entry = index.entries[path];
  if (entry?.kind !== "record") throw new Error(`No record entry at ${path}`);
  return { ...index, entries: { ...index.entries, [path]: { ...entry, stat } } };
}

/** What a check compares a file against: its recorded stat, the blob id last written there, and the reference. */
export interface ChangeCheck {
  readonly path: string;
  readonly recorded: FileStat | null;
  readonly written: string;
  readonly reference: bigint | null;
  readonly format: ObjectFormat;
  /** Follow a symbolic link to what it names, as Git reads an ignore file, rather than read it as absent. */
  readonly followLinks?: boolean;
}

/** What a check found: nothing there, a stat match older than the reference, a hash equal to the write, or a change. */
export type ChangeVerdict =
  | { readonly status: "absent" }
  | { readonly status: "clean"; readonly stat: FileStat }
  | { readonly status: "hashed-clean"; readonly stat: FileStat }
  | { readonly status: "changed"; readonly stat: FileStat; readonly blob: string };

/**
 * Check one file against its entry.
 * @param check - The file's absolute path and what it is compared against.
 * @param readFile - Reads the bytes a hash takes.
 * @returns What the check found.
 */
export async function checkChange(
  check: ChangeCheck, readFile: (path: string) => Promise<Uint8Array> = fsReadFile,
): Promise<ChangeVerdict> {
  const stat = await readStat(check.path, check.followLinks);
  // Unless links are followed, a symbolic link, or anything else not a file, is never followed or read: it reads as a
  // deleted file.
  if (stat?.type !== "file") return { status: "absent" };
  if (isStatClean(stat, check)) return { status: "clean", stat };
  const blob = gitBlobId(await readFile(check.path), check.format);
  return blob === check.written ? { status: "hashed-clean", stat } : { status: "changed", stat, blob };
}

/**
 * Read a path's `lstat` as bigints, or its `stat` where links are followed.
 * @param path - The absolute path.
 * @param followLinks - Whether a symbolic link is followed to what it names.
 * @returns Its stat, or null where nothing is there, a dangling link included.
 */
export async function readStat(path: string, followLinks = false): Promise<FileStat | null> {
  let stat;
  try {
    stat = await (followLinks ? fsStat : lstat)(path, { bigint: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return null;
    throw error;
  }
  const type = stat.isFile() ? "file" : stat.isSymbolicLink() ? "symlink" : "other";
  return { type, size: stat.size, mtimeNs: stat.mtimeNs, ino: stat.ino };
}

/**
 * Clean by stat alone: every field matches, and the modification time is older than the reference. A recorded size of
 * zero for content that is not empty is a smudge, which always hashes, so a save that empties the file is still found.
 */
function isStatClean(stat: FileStat, check: ChangeCheck): boolean {
  const { recorded, reference } = check;
  if (recorded === null || reference === null) return false;
  if (recorded.size === 0n && check.written !== gitBlobId("", check.format)) return false;
  return stat.type === recorded.type && stat.size === recorded.size && stat.mtimeNs === recorded.mtimeNs
    && stat.ino === recorded.ino && stat.mtimeNs < reference;
}
