/** Command-end settlement reads fresh index authority under each newly acquired worktree lock. */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import { withProjectionLock, SIBLING_LOCK_WAIT_MS } from "./lock.js";
import { readProjectionIndex } from "./index-file.js";
import { runSecondCheck } from "./second-check.js";
import { removeTakenInCopies, TAKEN_IN_FOLDER } from "./taken-in.js";

/** Settle only this command's copies and collect unreferenced kept content under the same lease. */
export async function finishProjectionRoot(root: ProjectionRootState): Promise<void> {
  if (!root.ready) return;
  const state = projectionProcessState();
  const ended = await withProjectionLock(root.location, async session => {
    state.lockHeld = true;
    root.checkpoint = session.step;
    try {
      await session.step();
      const fresh = await readProjectionIndex(root.location, true);
      if (fresh.kind !== "index") return;
      await runSecondCheck({ location: root.location, checkout: root.checkout, index: fresh.index,
        copies: root.copies, removals: root.removals, format: root.context.format, takeIn: root.takeIn,
        writer: root.context.writer, checkpoint: root.context.checkpoint });
      const settled = await readProjectionIndex(root.location, true);
      if (settled.kind !== "index") return;
      const named = new Set(Object.values(settled.index.entries).flatMap(entry => (
        entry.kind === "record" && entry.persisted?.takenIn.kind === "copy" ? [entry.persisted.takenIn.name] : []
      )));
      const files = await keptCopies(root);
      await removeTakenInCopies(root.location, files.filter(file => !named.has(file)), root.context.checkpoint);
    } finally {
      root.checkpoint = null;
      state.lockHeld = false;
    }
  }, { maxWaitMs: root.ports.maxWaitMs ?? SIBLING_LOCK_WAIT_MS }, root.ports.lock);
  if (ended.status !== "done") state.diagnostics.push({ path: root.checkout, copy: null, mark: {
    reason: `Projection end skipped: ${ended.status}${ended.status === "lost" ? `: ${ended.report}` : ""}`,
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
