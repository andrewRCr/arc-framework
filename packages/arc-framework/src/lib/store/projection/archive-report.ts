/** Name archive edits from sync's existing observations without binding them into the index or store. */
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { inspectArchivedProjectionFile, type ArchiveObservation } from "./archive-inspection.js";
import { readReference } from "./change-detection.js";
import { refuseUnreadArchiveScope, selectArchivePath } from "./archive-selection.js";

/** Retain the inspection's native mark in the command's existing diagnostic channel. */
export async function reportArchivedProjectionFile(root: ProjectionRootState, index: ProjectionIndex, path: string,
  observation?: ArchiveObservation): Promise<void> {
  const inspected = await inspectArchivedProjectionFile(root, index, path, observation);
  if (inspected?.access) refuseUnreadArchiveScope(root, path, inspected.mark);
  else if (inspected !== null) root.context.report?.({ path, copy: null, mark: inspected.mark });
}

/** Report walked archive paths that the inventory-based restoration did not inspect. */
export async function reportRemainingArchivedFiles(root: ProjectionRootState, index: ProjectionIndex,
  files: readonly string[], inventoried: ReadonlyMap<string, unknown>): Promise<void> {
  const reference = await readReference(root.checkout);
  for (const path of files) {
    if (inventoried.has(path)) continue;
    // A path behind a folder link or inside a nested checkout is left unread; only an indexed one is named, since
    // an unindexed file there belongs to the other checkout.
    if (selectArchivePath(root, path, { report: index.entries[path] !== undefined, holdAccess: true }) !== null) continue;
    await reportArchivedProjectionFile(root, index, path, { reference });
  }
}
