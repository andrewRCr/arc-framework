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
    side.placement = folder?.placement ?? await historicalPlacement(context, live, side, captured);
    if (!side.placement) return false;
  }
  return true;
}

async function historicalPlacement(context: RefBackendContext, live: string, side: SyncTreeSide,
  captured: readonly { ref: string; tip: string }[]): Promise<SyncTreeSide["placement"]> {
  const placement = side.metadata.primary?.placement ?? side.metadata.placement;
  if (placement?.kind !== "completed" || !side.metadata.endBatch) return undefined;
  const quarter = `refs/arc/archive/${placement.quarter}`;
  const tips = [...new Set(captured.filter(({ ref }) => ref === quarter).map(({ tip }) => tip))];
  if (!tips.length) return undefined;
  const { stdout } = await context.exec("git", ["rev-list", ...tips], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const commits = stdout.split(/\r?\n/u).filter(Boolean);
  if (!commits.length) return undefined;
  const trees = await readRefTrees(context, new Map(commits.map((commit) => [commit, commit])));
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  const family = live.includes("/cohort/") ? "cohort" : "work-item";
  for (const entries of trees.values()) {
    const folder = archivedFolders(family, quarter, entries, objects).folders
      .find((folder) => folder.liveRef === live && folder.metadata.endBatch === side.metadata.endBatch);
    if (folder) return folder.placement;
  }
  return undefined;
}
