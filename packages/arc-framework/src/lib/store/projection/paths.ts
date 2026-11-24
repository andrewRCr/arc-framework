/** Checkout-relative folders the projection keeps for its own machine-local files. */

/** Folder for the projection's machine-local files, which holds its aside folder. */
export const PROJECTION_LOCAL_ROOT = ".arc/system/.local";

/** The aside folder: the copies a replacement moves aside, the staged files, and the racy reference stamp. */
export const PROJECTION_ASIDE_ROOT = `${PROJECTION_LOCAL_ROOT}/projection`;

/** The archive's projected folder, the one root laid read-only. */
export const PROJECTION_ARCHIVE_PREFIX = ".arc/completed/";

/** Whether a repository-relative path lies in the archive. */
export function isArchivedPath(path: string): boolean {
  return path.startsWith(PROJECTION_ARCHIVE_PREFIX);
}

/** Whether an archived entry's accepted write still awaits its recording, so its file is read even when absent. */
export function hasUnfinishedArchiveRecording(path: string, entry: { readonly persisted?: { readonly recording?: boolean } | null }): boolean {
  return isArchivedPath(path) && entry.persisted?.recording === true;
}
