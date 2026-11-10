/** Move the save anchor only for entries whose observed edits are fully accepted. */
import type { Store } from "../contract.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionSaveResult } from "./save.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import { withProjectionLock } from "./lock.js";
import { commitProjectionIndex, readProjectionIndex } from "./index-file.js";
import { observeAsideCopy } from "./aside-copies.js";
import { recordProjectionLockSkip } from "./engine.js";
import { loadProjectionGroups, replaceLoadedProjectionEntries } from "./index-memory.js";

/** Clear accepted changed marks under a fresh lease, preserving unsent and uncertain saved copies. */
export async function saveProjectionChanges(store: Store): Promise<ProjectionSaveResult> {
  const state = projectionProcessState(), binding = state.command;
  const root = binding === null ? undefined : state.roots.get(binding.checkout);
  if (root === undefined || !root.ready) return versionResult(store);
  const saved = await withProjectionLock(root.location, async session => {
    state.lockHeld = true; root.checkpoint = session.step;
    try {
      await session.step();
      const disk = await readProjectionIndex(root.location, true);
      if (disk.kind !== "index") return { status: "refused" as const, refusal: { code: "projection-refused" as const,
        condition: disk.kind === "unusable" ? `Projection index is ${disk.cause}.` : "The projection index disappeared after command start.",
        remedy: { text: "Restore a readable projection index, then retry arc save; changed marks have been preserved." } } };
      const index = await clearAcceptedMarks(root, disk.index);
      const version = await versionResult(store);
      if (version.status === "refused") return version;
      await session.step();
      if (index !== disk.index) await commitProjectionIndex({ location: root.location, checkout: root.checkout, index, checkpoint: session.step });
      return version;
    } finally { root.checkpoint = null; state.lockHeld = false; }
  }, { invalidatePartition: true, ...(root.ports.maxWaitMs === undefined ? {} : { maxWaitMs: root.ports.maxWaitMs }) }, root.ports.lock);
  if (saved.status === "done") return saved.value;
  const skipped = recordProjectionLockSkip(root.checkout, saved, root.unsent);
  return { status: "refused", refusal: { code: "projection-skipped", condition: skipped.skip.mark.reason, remedy: skipped.skip.mark.remedy } };
}

async function versionResult(store: Store): Promise<ProjectionSaveResult> {
  const version = await store.version();
  return version.status === "refused" ? version : { status: "ok", result: { version: version.result } };
}

async function clearAcceptedMarks(root: ProjectionRootState, index: ProjectionIndex): Promise<ProjectionIndex> {
  loadProjectionGroups(index, "all");
  const entries = new Map(Object.entries(index.entries));
  let changed = false;
  for (const [path, entry] of entries) {
    if (entry.kind !== "record" || !entry.changed) continue;
    await root.checkpoint?.();
    if (!await accepted(root, index, path, entry)) continue;
    entries.set(path, { ...entry, changed: false }); changed = true;
  }
  return changed ? replaceLoadedProjectionEntries(index, Object.fromEntries(entries)) : index;
}

async function accepted(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry): Promise<boolean> {
  if (entry.pending || entry.withheld || entry.refused !== null || entry.adoption !== undefined || entry.inProgress !== null) return false;
  for (const copy of entry.copies) {
    if (index.withheldCopies.includes(copy.name)) return false;
    await root.checkpoint?.();
    const observed = await observeAsideCopy({ checkout: root.checkout, path, entry, copy, format: root.context.format });
    if (observed.kind !== "no-edit" && observed.kind !== "gone") return false;
  }
  return true;
}
