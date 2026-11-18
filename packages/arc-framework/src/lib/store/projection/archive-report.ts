/** Name new archive files from sync's existing walk without binding them into the index or store. */
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { inspectArchivedProjectionFile, type ArchiveObservation } from "./archive-inspection.js";

/** Retain the inspection's native mark in the command's existing diagnostic channel. */
export async function reportArchivedProjectionFile(root: ProjectionRootState, index: ProjectionIndex, path: string,
  observation?: ArchiveObservation): Promise<void> {
  const inspected = await inspectArchivedProjectionFile(root, index, path, observation);
  if (inspected !== null) root.context.report?.({ path, copy: null, mark: inspected.mark });
}

/** Report only files without entries; opened or unsettled files keep their ordinary command handling. */
export async function reportUnknownArchivedFiles(root: ProjectionRootState, index: ProjectionIndex,
  files: readonly string[]): Promise<void> {
  for (const path of files) {
    if (index.entries[path] !== undefined) continue;
    await reportArchivedProjectionFile(root, index, path);
  }
}
