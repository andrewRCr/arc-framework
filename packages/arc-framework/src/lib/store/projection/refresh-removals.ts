/** Guard obsolete projected paths before laying any destination that replaces their owner. */
import { sameReference } from "../identity.js";
import { withProjectionEntry } from "./index-memory.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { RecordRenderer } from "./record-render.js";
import type { ProjectionRefreshPlan } from "./refresh-plan.js";
import { guardReplacement, reportGuardHold } from "./replace-guard.js";
import { swapBatch, type SwapFile } from "./swap.js";
import { readCopyDestinations } from "./discovery-links.js";
import { archiveChangeRefusals, hasPendingArchiveRecovery, refuseArchiveChange, selectArchivePath } from "./archive-selection.js";

/**
 * An obsolete path's changed or opened mark follows the same logical record to the new path a pass lays, keyed by that
 * path with the obsolete paths whose mark it takes.
 */
export function movedProjectionChanges(index: ProjectionIndex, plan: ProjectionRefreshPlan,
  laid: ReadonlyMap<string, unknown>): ReadonlyMap<string, readonly string[]> {
  const moved = new Map<string, string[]>();
  for (const path of plan.removals) {
    const entry = index.entries[path];
    if (entry?.kind !== "record" || (!entry.changed && entry.opened !== true)) continue;
    for (const [target, reference] of plan.paths) {
      if (laid.has(target) && sameReference(entry.reference, reference)) moved.set(target, [...moved.get(target) ?? [], path]);
    }
  }
  return moved;
}

/** Remove obsolete files through the ordinary take-in guard and record all surviving aside copies. */
export async function removeObsoleteProjectionPaths(input: {
  root: ProjectionRootState; index: ProjectionIndex; plan: ProjectionRefreshPlan; renderer: RecordRenderer; reference: bigint | null;
  /** Whether this is a refresh's removal, whose guard may take in a forced edit; a restoration takes nothing in. */
  admitsForcedEdit: boolean;
}): Promise<ProjectionIndex> {
  const { root } = input;
  const takeIn = root.takeIn;
  let index = input.index;
  const files: SwapFile[] = [];
  const selected = [...input.plan.removals].filter(path => selectObsoletePath(root, index, path));
  const { blockedByLink, archiveAccess } = await readCopyDestinations(root.checkout, selected, root.ports.linkFs);
  for (const [path, mark] of archiveAccess) refuseArchiveChange(root, path, mark);
  for (const path of selected) {
    const entry = index.entries[path];
    if (entry?.kind !== "record" || entry.handoff !== undefined || archiveAccess.has(path)) continue;
    if (!root.writable(path) || root.blockedByLink(path) !== null || blockedByLink(path) !== null || root.unsent.has(path)) {
      index = withProjectionEntry(index, path, { ...entry, pending: true });
      continue;
    }
    const guarded = await guardReplacement({ checkout: root.checkout, path, entry, staged: null, renderer: input.renderer,
      reference: input.reference, format: root.context.format, store: root.store, writer: root.context.writer,
      checkpoint: root.context.checkpoint, takeIn, admitsForcedEdit: input.admitsForcedEdit });
    if (guarded.kind === "unreplaced" && guarded.cause === "unreadable") refuseArchiveChange(root, path, guarded.mark);
    else reportGuardHold(root.context.report, path, null, guarded, root.context.refuseArchiveAccess);
    index = withProjectionEntry(index, path, guarded.entry);
    if (guarded.kind === "replace") files.push({ path, replace: guarded, relaid: input.plan.paths.has(path) });
  }
  if (files.length === 0) return index;
  const swapped = await swapBatch({ location: root.location, checkout: root.checkout, index, files, readBack: false,
    writer: root.context.writer, format: root.context.format, checkpoint: root.context.checkpoint, takeIn, hooks: root.context.hooks,
    refuseChange: archiveChangeRefusals(root) });
  root.context.recordBatch?.(swapped);
  return swapped.index;
}

function selectObsoletePath(root: ProjectionRootState, index: ProjectionIndex, path: string): boolean {
  if (selectArchivePath(root, path) !== null) return false;
  if (!hasPendingArchiveRecovery(index, path)) return true;
  refuseArchiveChange(root, path, { reason: "An archive copy is still waiting to return to this path.",
    remedy: { text: "Repair access to the archive path and run a command from its checkout to finish recovery." } });
  return false;
}
