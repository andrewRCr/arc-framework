/** Complete merged record values with placement derived from captured archive folders. */

import type { RefBackendContext } from "./context.js";
import type { SyncTreeSide } from "./sync-tree.js";
import { archivedFolders } from "./archive-read.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";

/** Fill caller-owned merge snapshots without changing their version-bearing stored metadata. */
export async function completeSyncPlacements(context: RefBackendContext, ref: string, sides: readonly SyncTreeSide[],
  tipSets: readonly ReadonlyMap<string, string>[]): Promise<boolean> {
  const completed = sides.filter((side) => (side.metadata.primary?.placement ?? side.metadata.placement)?.kind === "completed"
    && side.metadata.primary?.role !== "work-item/record");
  if (!completed.length) return true;
  const quarters = new Set(completed.map((side) => {
    const placement = side.metadata.primary?.placement ?? side.metadata.placement;
    return placement?.kind === "completed" ? `refs/arc/archive/${placement.quarter}` : "";
  }));
  const captured = tipSets.flatMap((tips, index) => [...tips].filter(([name]) => quarters.has(name))
    .map(([name, tip]) => ({ label: `${index}:${name}`, ref: name, tip })));
  if (!captured.length) return false;
  const trees = await readRefTrees(context, new Map(captured.map(({ label, tip }) => [label, tip])));
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  const family = ref.includes("/cohort/") ? "cohort" : "work-item";
  const live = ref.replace("refs/arc/history/", "refs/arc/");
  const folders = captured.flatMap(({ label, ref: quarter }) => archivedFolders(family, quarter, trees.get(label) ?? [], objects).folders);
  for (const side of completed) {
    const placement = side.metadata.primary?.placement ?? side.metadata.placement;
    const folder = folders.find((candidate) => candidate.liveRef === live && candidate.metadata.endBatch === side.metadata.endBatch
      && candidate.placement.kind === "completed" && placement?.kind === "completed" && candidate.placement.quarter === placement.quarter);
    if (!folder) return false;
    side.placement = folder.placement;
  }
  return true;
}
