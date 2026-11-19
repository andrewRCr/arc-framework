/** Name archive edits from sync's existing observations without binding them into the index or store. */
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { archiveProtection, inspectArchivedProjectionFile, type ArchiveObservation } from "./archive-inspection.js";
import { archiveDestinationRefusal } from "./archive-file.js";
import { readReference } from "./change-detection.js";

/** Retain the inspection's native mark in the command's existing diagnostic channel. */
export async function reportArchivedProjectionFile(root: ProjectionRootState, index: ProjectionIndex, path: string,
  observation?: ArchiveObservation): Promise<void> {
  const inspected = await inspectArchivedProjectionFile(root, index, path, observation);
  if (inspected !== null) root.context.report?.({ path, copy: null, mark: inspected.mark });
}

/** Report the current remedy for a yielded restoration while keeping its opening hold in the index. */
export async function reportArchiveRestorationHold(root: ProjectionRootState, path: string, entry: RecordEntry,
  hold: RefusedMark): Promise<void> {
  const mark = archiveDestinationRefusal(root.checkout, path) ?? (await archiveProtection(root, entry.reference))?.mark ?? hold;
  root.context.report?.({ path, copy: null, mark });
}

/** Report walked archive paths that the inventory-based restoration did not inspect. */
export async function reportRemainingArchivedFiles(root: ProjectionRootState, index: ProjectionIndex,
  files: readonly string[], inventoried: ReadonlyMap<string, unknown>): Promise<void> {
  const reference = await readReference(root.checkout);
  for (const path of files) {
    if (inventoried.has(path)) continue;
    await reportArchivedProjectionFile(root, index, path, { reference });
  }
}
