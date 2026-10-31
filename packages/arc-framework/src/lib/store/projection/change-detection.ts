/** Change detection by Git's racy rule: a stat match is clean only when older than the index's reference. */
import { lstat, readFile as fsReadFile } from "node:fs/promises";
import { join } from "node:path";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import type { FileStat } from "./index-schema.js";
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

/** What a check compares a file against: its recorded stat, the blob id last written there, and the reference. */
export interface ChangeCheck {
  readonly path: string;
  readonly recorded: FileStat | null;
  readonly written: string;
  readonly reference: bigint | null;
  readonly format: ObjectFormat;
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
  const stat = await readStat(check.path);
  // A symbolic link, or anything else not a file, is never followed or read: it reads as a deleted file.
  if (stat?.type !== "file") return { status: "absent" };
  if (isStatClean(stat, check)) return { status: "clean", stat };
  const blob = gitBlobId(await readFile(check.path), check.format);
  return blob === check.written ? { status: "hashed-clean", stat } : { status: "changed", stat, blob };
}

/**
 * Read a path's `lstat` as bigints.
 * @param path - The absolute path.
 * @returns Its stat, or null where nothing is there.
 */
export async function readStat(path: string): Promise<FileStat | null> {
  let stat;
  try {
    stat = await lstat(path, { bigint: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
  const type = stat.isFile() ? "file" : stat.isSymbolicLink() ? "symlink" : "other";
  return { type, size: stat.size, mtimeNs: stat.mtimeNs, ino: stat.ino };
}

/** Clean by stat alone: every field matches, and the modification time is older than the reference. */
function isStatClean(stat: FileStat, check: ChangeCheck): boolean {
  const { recorded, reference } = check;
  if (recorded === null || reference === null) return false;
  return stat.type === recorded.type && stat.size === recorded.size && stat.mtimeNs === recorded.mtimeNs
    && stat.ino === recorded.ino && stat.mtimeNs < reference;
}
