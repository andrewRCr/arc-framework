/** Schedule advisory fan-out at command boundaries while projection leases protect writes. */
import { sameReference, type RecordReference } from "../identity.js";
import { projectionProcessState, type ProjectionSkip } from "./process-state.js";
import { projectionTimingNow } from "./timings.js";

/** Record a landed operation or sync attempt for the command's fan-out. */
export async function requestProjectionFanOut(checkout: string, references: readonly RecordReference[] = []): Promise<void> {
  const state = projectionProcessState();
  if (state.fanOut === undefined || state.fanOutSuppressed > 0 || disabled(state.skip)) return;
  state.fanOutRounds.add(checkout);
  if (!state.lockHeld) for (const reference of references) retainOwnWrite(state.fanOutOwnWrites, reference);
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
  // Own writes a round could not mark wait for this command's next round rather than being dropped.
  if (state.fanOutRounds.size === 0) return;
  const checkout = state.command?.checkout ?? [...state.fanOutRounds][0] ?? ".";
  const writer = state.roots.get(checkout);
  const startedAt = writer === undefined ? undefined : projectionTimingNow(writer.ports);
  state.fanOutRunning = true;
  let round = 0;
  try {
    while (state.fanOutRounds.size > 0) {
      state.fanOutRounds.clear();
      const writes = [...state.fanOutOwnWrites];
      state.fanOutOwnWrites = [];
      const unmarked = await state.fanOut(writes, round++) ?? [];
      for (const reference of unmarked) retainOwnWrite(state.fanOutOwnWrites, reference);
    }
  } catch (cause) {
    state.fanOutRounds.clear();
    reportProjectionFanOutFailure(checkout, cause);
  } finally {
    state.fanOutRunning = false;
    finishFanOutTiming(checkout, startedAt);
  }
}

/** Own writes a round could not mark get one visit to the writer's checkout alone before the command ends. */
export async function settleUnmarkedOwnWrites(checkout: string): Promise<void> {
  const state = projectionProcessState();
  const writes = [...state.fanOutOwnWrites];
  if (writes.length === 0 || state.fanOut === undefined || disabled(state.skip) || state.lockHeld || state.fanOutRunning) return;
  state.fanOutOwnWrites = [];
  state.fanOutRunning = true;
  let unmarked: readonly RecordReference[] = writes;
  try {
    unmarked = await state.fanOut(writes, 0, "own") ?? [];
  } catch (cause) {
    reportProjectionFanOutFailure(checkout, cause);
  } finally {
    state.fanOutRunning = false;
  }
  if (unmarked.length > 0) state.diagnostics.push({ path: checkout, copy: null, mark: {
    reason: "Changed marks not recorded: this command's fan-out could not mark its writes in this checkout.",
    remedy: { text: "`arc selection --changed` may omit the files this command wrote here; run `arc selection` without "
      + "`--changed` to include them." } } });
}

function retainOwnWrite(writes: RecordReference[], reference: RecordReference): void {
  if (!writes.some(previous => sameReference(previous, reference))) writes.push(reference);
}

function finishFanOutTiming(checkout: string, startedAt: number | undefined): void {
  const root = projectionProcessState().roots.get(checkout);
  if (root === undefined || startedAt === undefined) return;
  (root.fanOutTimes ??= []).push(Math.max(0, projectionTimingNow(root.ports) - startedAt));
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
