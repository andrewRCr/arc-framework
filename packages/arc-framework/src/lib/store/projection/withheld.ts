/** Release withheld paths only after their bytes are absent, without following a link to inspect them. */
import { join } from "node:path";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { loadProjectionGroups, withProjectionEntry } from "./index-memory.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { readStat } from "./change-detection.js";

/** Whether a withheld entry whose file is gone is released: only where its root accepts writes and no arrival holds it. */
export function releasesAbsentWithheld(writable: (path: string) => boolean, path: string, entry: ProjectionIndex["entries"][string]): boolean {
  return entry.withheld === true && writable(path) && !(entry.kind === "record" && entry.handoff !== undefined);
}

/** Keep unknown files held; an absent bound record becomes pending for the next replacement. */
export async function releaseAbsentWithheldPaths(root: Pick<ProjectionRootState, "checkout" | "writable">, initial: ProjectionIndex, selection?: readonly string[]): Promise<ProjectionIndex> {
  if (selection === undefined) loadProjectionGroups(initial, "walked");
  const paths = (selection ?? Object.keys(initial.entries)).filter(path => initial.entries[path]?.withheld && root.writable(path));
  const boundary = await readProjectionLinkBoundary(root.checkout, paths);
  let index = initial;
  for (const path of paths) {
    if (boundary(path) !== null || await readStat(join(root.checkout, path)) !== null) continue;
    const entry = index.entries[path];
    if (entry === undefined || !releasesAbsentWithheld(root.writable, path, entry)) continue;
    index = withProjectionEntry(index, path, entry.kind === "ownerless" ? undefined
      : { ...entry, stat: null, withheld: false, pending: true, refused: null });
  }
  return index;
}
