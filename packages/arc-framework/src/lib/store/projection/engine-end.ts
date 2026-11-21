/** Command-end settlement reads fresh index authority under each newly acquired worktree lock. */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import { SIBLING_LOCK_WAIT_MS } from "./lock.js";
import { withProjectionFanOutLock } from "./fan-out-lock.js";
import { readProjectionIndex } from "./index-file.js";
import { runSecondCheck } from "./second-check.js";
import { removeTakenInCopies, TAKEN_IN_FOLDER } from "./taken-in.js";
import { reportProjectionCopy } from "./report.js";
import { readCopyDestinations } from "./discovery-links.js";
import { loadProjectionGroups } from "./index-memory.js";
import { reconcileProjectionHandoffs } from "./ownership-handoff.js";
import { hasProjectionEndWork } from "./end-work.js";
import { recordProjectionTiming, reportProjectionTripwires } from "./timings.js";
import { heldArchivePath, refuseArchiveChange } from "./archive-selection.js";

/** Settle only this command's copies and collect unreferenced kept content under the same lease. */
export async function finishProjectionRoot(root: ProjectionRootState): Promise<void> {
  if (!root.ready || !hasProjectionEndWork(root)) return;
  const state = projectionProcessState();
  const ended = await withProjectionFanOutLock(root.location, async session => {
    root.checkpoint = session.step;
    try {
      await session.step();
      const fresh = await readProjectionIndex(root.location, true);
      if (fresh.kind !== "index") return;
      loadProjectionGroups(fresh.index, "walked");
      const timings = [...root.fanOutTimes ?? []];
      const index = timings.reduce((recorded, elapsed) => recordProjectionTiming(recorded, "fan-out", elapsed), fresh.index);
      const accessible = (path: string): boolean => heldArchivePath(root, path) === null;
      const copies = root.copies.filter(copy => accessible(copy.path));
      const removals = root.removals.filter(accessible);
      const destinations = await readCopyDestinations(root.checkout,
        [...copies.map(copy => copy.path), ...removals], root.ports.linkFs);
      const checked = await runSecondCheck({ location: root.location, checkout: root.checkout, index,
        onPublished: published => { root.fanOutTimes?.splice(0, timings.length); reportProjectionTripwires(root, published); },
        ...destinations, copies, removals, format: root.context.format, takeIn: root.takeIn,
        writer: root.context.writer, checkpoint: root.context.checkpoint });
      for (const [path, mark] of checked.blockedDestinations) refuseArchiveChange(root, path, mark);
      for (const copy of checked.settled) {
        if (!checked.blockedDestinations.has(copy.path)) reportProjectionCopy(copy.path, copy.copy, copy.settlement);
      }
      await reconcileProjectionHandoffs(root, checked.index);
      const settled = await readProjectionIndex(root.location, true, { groups: "walked" });
      if (settled.kind !== "index") return;
      const named = new Set(Object.values(settled.index.entries).flatMap(entry => [
        ...(entry.kind === "record" && entry.persisted?.takenIn.kind === "copy" ? [entry.persisted.takenIn.name] : []),
        ...(entry.archiveSubmission ? [entry.archiveSubmission.name] : []),
      ]));
      const files = await keptCopies(root);
      await removeTakenInCopies(root.location, files.filter(file => !named.has(file)), root.context.checkpoint);
    } finally {
      root.checkpoint = null;
    }
  }, { fanOut: "drop", maxWaitMs: root.ports.maxWaitMs ?? SIBLING_LOCK_WAIT_MS,
    invalidatePartition: state.command?.checkout === root.checkout }, root.ports.lock);
  if (ended.status !== "done") state.diagnostics.push({ path: root.checkout, copy: null, mark: {
    reason: `Projection end skipped: ${ended.status}${ended.status === "lost" || ended.status === "mismatch" ? `: ${ended.report}` : ""}`,
    remedy: { text: "Run the next command to sweep and settle the copies left behind." },
  } });
}

async function keptCopies(root: ProjectionRootState): Promise<string[]> {
  try { return await readdir(join(root.location.stateDir, TAKEN_IN_FOLDER)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
