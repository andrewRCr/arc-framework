/** Release withheld paths only after their bytes are absent, without following a link to inspect them. */
import { join } from "node:path";
import type { ProjectionIndex } from "./index-schema.js";
import { loadProjectionGroups, withProjectionEntry } from "./index-memory.js";
import { readWritableArchiveLinkBoundary } from "./discovery-links.js";
import { projectionFileReader } from "./change-detection.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { heldArchivePath, refuseUnreadArchiveScope, type ArchiveSelectionRoot } from "./archive-selection.js";
import type { ProjectionRootState } from "./process-state.js";

type WithheldRoot = ArchiveSelectionRoot & Pick<ProjectionRootState, "writable"> & {
  readonly ports?: Pick<ProjectionRootState["ports"], "linkFs">;
};

/** Whether a withheld entry whose file is gone is released: only where its root accepts writes and no arrival holds it. */
export function releasesAbsentWithheld(writable: (path: string) => boolean, path: string, entry: ProjectionIndex["entries"][string]): boolean {
  return entry.withheld === true && writable(path) && !(entry.kind === "record" && entry.handoff !== undefined);
}

/** Keep unknown files held; an absent bound record becomes pending for the next replacement. */
export async function releaseAbsentWithheldPaths(root: WithheldRoot, initial: ProjectionIndex, selection?: readonly string[],
  writable = root.writable): Promise<ProjectionIndex> {
  if (selection === undefined) loadProjectionGroups(initial, "walked");
  const paths = (selection ?? Object.keys(initial.entries)).filter(path => initial.entries[path]?.withheld && writable(path));
  const boundary = await readWritableArchiveLinkBoundary(root, paths, root.ports?.linkFs);
  let index = initial;
  for (const path of paths) {
    if (heldArchivePath(root, path) !== null || boundary(path) !== null || !await absent(root, path)) continue;
    const entry = index.entries[path];
    if (entry === undefined || !releasesAbsentWithheld(writable, path, entry)) continue;
    index = withProjectionEntry(index, path, entry.kind === "ownerless" ? undefined
      : { ...entry, stat: null, withheld: false, pending: true, refused: null });
  }
  return index;
}

async function absent(root: WithheldRoot, path: string): Promise<boolean> {
  try { return await projectionFileReader(root.checkout, path).stat(join(root.checkout, path)) === null; }
  catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked) || !error.access) throw error;
    refuseUnreadArchiveScope(root, path, error.mark);
    return false;
  }
}
