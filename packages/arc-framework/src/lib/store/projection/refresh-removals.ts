/** Guard obsolete projected paths before laying any destination that replaces their owner. */
import { sameReference } from "../identity.js";
import { withProjectionEntry } from "./index-memory.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { RecordRenderer } from "./record-render.js";
import type { ProjectionRefreshPlan } from "./refresh-plan.js";
import { guardReplacement } from "./replace-guard.js";
import { swapBatch, type SwapFile } from "./swap.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";

/** An obsolete path's changed mark follows the same logical record to its new path. */
export function movedProjectionChanges(index: ProjectionIndex, plan: ProjectionRefreshPlan): ReadonlySet<string> {
  const changed = new Set<string>();
  for (const path of plan.removals) {
    const entry = index.entries[path];
    if (entry?.kind !== "record" || !entry.changed) continue;
    for (const [target, reference] of plan.paths) if (sameReference(entry.reference, reference)) changed.add(target);
  }
  return changed;
}

/** Remove obsolete files through the ordinary take-in guard and record all surviving aside copies. */
export async function removeObsoleteProjectionPaths(input: {
  root: ProjectionRootState; index: ProjectionIndex; plan: ProjectionRefreshPlan; renderer: RecordRenderer; reference: bigint | null;
}): Promise<ProjectionIndex> {
  const { root } = input;
  let index = input.index;
  const files: SwapFile[] = [];
  const boundary = await readProjectionLinkBoundary(root.checkout, [...input.plan.removals]);
  for (const path of input.plan.removals) {
    const entry = index.entries[path];
    if (entry?.kind !== "record") continue;
    if (entry.handoff !== undefined) continue;
    if (!root.writable(path) || root.blockedByLink(path) !== null || boundary(path) !== null || root.unsent.has(path)) {
      index = withProjectionEntry(index, path, { ...entry, pending: true });
      continue;
    }
    const guarded = await guardReplacement({ checkout: root.checkout, path, entry, staged: null, renderer: input.renderer,
      reference: input.reference, format: root.context.format, store: root.store, writer: root.context.writer,
      checkpoint: root.context.checkpoint, takeIn: root.takeIn });
    index = withProjectionEntry(index, path, guarded.entry);
    if (guarded.kind === "replace") files.push({ path, replace: guarded, relaid: input.plan.paths.has(path) });
  }
  if (files.length === 0) return index;
  const swapped = await swapBatch({ location: root.location, checkout: root.checkout, index, files, readBack: false,
    writer: root.context.writer, format: root.context.format, checkpoint: root.context.checkpoint, takeIn: root.takeIn, hooks: root.context.hooks });
  root.context.recordBatch?.(swapped);
  return swapped.index;
}
