/**
 * File list resolution for the update command.
 *
 * Compares the old manifest's file list against the new recipe's resolved
 * file list to determine which files to keep (merge candidates), which
 * are newly added, and which have been removed from the framework.
 *
 * @module
 */

/** Result of diffing old manifest files against a new recipe's file list. */
export interface FileListDiff {
  /** Files present in both lists — merge candidates. */
  keep: string[];
  /** Files in the new list but not the old — new framework content. */
  added: string[];
  /** Files in the old list but not the new — framework dropped them. */
  removed: string[];
}

/**
 * Diffs two file path lists to determine keep/added/removed sets.
 *
 * @param manifestFiles - File paths from the existing manifest
 * @param updatedFiles - File paths resolved from the new recipe
 * @returns Categorized file lists
 */
export function diffFileLists(
  manifestFiles: string[],
  updatedFiles: string[],
): FileListDiff {
  const oldSet = new Set(manifestFiles);
  const newSet = new Set(updatedFiles);

  const keep: string[] = [];
  const added: string[] = [];

  for (const file of updatedFiles) {
    if (oldSet.has(file)) {
      keep.push(file);
    } else {
      added.push(file);
    }
  }

  const removed = manifestFiles.filter((file) => !newSet.has(file));

  return { keep, added, removed };
}
