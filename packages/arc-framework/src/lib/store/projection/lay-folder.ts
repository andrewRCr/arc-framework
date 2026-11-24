/** Create the folder a laid path needs, naming the regular file that occupies it where one does. */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readStat } from "./change-detection.js";
import type { RefusedMark } from "./index-schema.js";

/**
 * Create a laid path's folder.
 * @param checkout - The checkout root.
 * @param path - The repository-relative path to be laid.
 * @returns Null once the folder exists, or the repository-relative path of the regular file occupying one of its folders.
 */
export async function ensureLayFolder(checkout: string, path: string): Promise<string | null> {
  try {
    await mkdir(join(checkout, dirname(path)), { recursive: true });
    return null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const occupying = code === "ENOTDIR" || code === "EEXIST" ? await occupyingFile(checkout, path) : null;
    if (occupying === null) throw error;
    return occupying;
  }
}

async function occupyingFile(checkout: string, path: string): Promise<string | null> {
  const folders = path.split("/").slice(0, -1);
  for (let length = 1; length <= folders.length; length += 1) {
    const folder = folders.slice(0, length).join("/");
    const stat = await readStat(join(checkout, folder));
    if (stat === null) return null;
    if (stat.type === "file") return folder;
  }
  return null;
}

/** The report for a path left unlaid while a regular file occupies one of its folders. */
export function occupiedFolderMark(checkout: string, path: string, occupying: string): RefusedMark {
  return { reason: `A regular file at ${occupying} occupies a folder ${path} needs, so it was not laid.`,
    remedy: { text: `Move or delete ${join(checkout, occupying)}, then run any arc command from ${checkout}; it lays ${path}.` } };
}
