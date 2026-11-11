/** Coordinate command-local fan-out deferral with the full lifetime of a native projection lease. */
import { withProjectionLock, type ProjectionLockDependencies, type ProjectionLockOptions,
  type ProjectionLockResult, type ProjectionLockSession } from "./lock.js";
import type { ProjectionLocation } from "./location.js";
import { projectionProcessState } from "./process-state.js";
import { flushProjectionFanOut } from "./fan-out-scheduler.js";

/** Command-end settlement drops its own fan-out; other lease owners release it after unlocking. */
export interface ProjectionFanOutLockOptions extends ProjectionLockOptions { readonly fanOut?: "run" | "drop" }

/** Take one projection lease and release any write or sync notification only after the lease ends. */
export async function withProjectionFanOutLock<T>(location: ProjectionLocation, operation: (session: ProjectionLockSession) => Promise<T>,
  options: ProjectionFanOutLockOptions = {}, overrides: Partial<ProjectionLockDependencies> = {}): Promise<ProjectionLockResult<T>> {
  const state = projectionProcessState();
  const { fanOut = "run", ...lockOptions } = options;
  const held = { entered: false, previous: false };
  try {
    return await withProjectionLock(location, session => {
      held.previous = state.lockHeld;
      held.entered = true;
      state.lockHeld = true;
      if (fanOut === "drop") state.fanOutSuppressed += 1;
      return operation(session);
    }, lockOptions, overrides);
  } finally {
    if (held.entered) {
      state.lockHeld = held.previous;
      if (fanOut === "drop") state.fanOutSuppressed -= 1;
    }
    if (fanOut === "run" && state.fanOutRounds.size > 0) {
      const root = state.command === null ? undefined : state.roots.get(state.command.checkout);
      await (root?.fanOut ?? flushProjectionFanOut)();
    }
  }
}
