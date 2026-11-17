/** Retain the command's reasons to reacquire a projection lease for end settlement. */
import { PROJECTION_ASIDE_ROOT } from "./paths.js";
import type { ProjectionRootState } from "./process-state.js";
import type { SweepResult } from "./sweep.js";

/** Only a completed authorized sweep can prove the aside folder empty, and a later sweep cannot erase earlier work. */
export function recordProjectionSweep(root: ProjectionRootState, swept: Pick<SweepResult, "swept" | "left">): void {
  root.sweepEmpty = root.sweepEmpty !== false && root.writable(`${PROJECTION_ASIDE_ROOT}/`)
    && swept.swept.length === 0 && swept.left.length === 0;
}

/** A send counts even when the store refused it; pending copies and measurements also need the end's lease. */
export function hasProjectionEndWork(root: ProjectionRootState): boolean {
  return root.sweepEmpty !== true || root.sent === true || root.copies.length > 0 || root.removals.length > 0
    || (root.fanOutTimes?.length ?? 0) > 0;
}
