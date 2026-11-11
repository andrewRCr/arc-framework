/** Schedule advisory fan-out at command boundaries while projection leases protect writes. */
import { sameReference, type RecordReference } from "../identity.js";
import { projectionProcessState, type ProjectionSkip } from "./process-state.js";

/** Record a landed operation or sync attempt for the command's fan-out. */
export async function requestProjectionFanOut(checkout: string, references: readonly RecordReference[] = []): Promise<void> {
  const state = projectionProcessState();
  if (state.fanOut === undefined || state.fanOutSuppressed > 0 || disabled(state.skip)) return;
  state.fanOutRounds.add(checkout);
  if (!state.lockHeld) for (const reference of references) {
    if (!state.fanOutOwnWrites.some(previous => sameReference(previous, reference))) state.fanOutOwnWrites.push(reference);
  }
  await flushProjectionFanOut();
}

/** Run a deferred fan-out once projection locks and explicit creation holds have been released. */
export async function flushProjectionFanOut(): Promise<void> {
  const state = projectionProcessState();
  if (state.fanOut === undefined || disabled(state.skip)) {
    state.fanOutRounds.clear();
    state.fanOutOwnWrites = [];
    return;
  }
  if (state.lockHeld || state.fanOutHolds > 0 || state.fanOutRunning) return;
  const checkout = state.command?.checkout ?? [...state.fanOutRounds][0] ?? ".";
  state.fanOutRunning = true;
  let round = 0;
  try {
    while (state.fanOutRounds.size > 0) {
      state.fanOutRounds.clear();
      await state.fanOut([...state.fanOutOwnWrites], round++);
    }
  } catch (cause) {
    state.fanOutRounds.clear();
    reportProjectionFanOutFailure(checkout, cause);
  } finally {
    state.fanOutRunning = false;
    state.fanOutOwnWrites = [];
  }
}

/** Retain an advisory diagnostic while the landed store operation keeps its original result. */
export function reportProjectionFanOutFailure(checkout: string, cause: unknown): void {
  projectionProcessState().diagnostics.push({ path: checkout, copy: null, mark: {
    reason: `Fan-out failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    remedy: { text: "Other worktrees refresh at their next command; repair the reported destination and retry." } } });
}

function disabled(skip: ProjectionSkip | null): boolean {
  return skip?.reason === "switch" || skip?.reason === "no-identity";
}

/** Hold scaffold publication until its marker stamp settles without changing write provenance. */
export async function withProjectionFanOutHold<T>(operation: () => Promise<T>): Promise<T> {
  const state = projectionProcessState();
  state.fanOutHolds += 1;
  try { return await operation(); }
  finally {
    state.fanOutHolds -= 1;
    await flushProjectionFanOut();
  }
}
