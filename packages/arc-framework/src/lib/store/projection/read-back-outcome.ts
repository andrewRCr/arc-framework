/** Preserve pending guard and swap outcomes that leave a read-back uninstalled. */
import type { ReadBackContext } from "./read-back.js";
import type { SwapBatchResult } from "./swap.js";
import { reportGuardHold, type GuardResult } from "./replace-guard.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";

/** Keep an unreplaced path unsent even when an earlier version of its edit landed. */
export function holdReadBack(context: ReadBackContext, request: TakeInRequest, result: TakeInResult,
  guarded: Extract<GuardResult, { kind: "unreplaced" }>): TakeInResult {
  reportGuardHold(context.report, request.path, request.copy, guarded);
  return { ...result, answer: "pending", entry: guarded.entry };
}

/** Return actual swap settlement without confusing it with a pending mark carried into a successful read-back. */
export function readBackSwapResult(context: ReadBackContext, request: TakeInRequest, result: TakeInResult,
  batch: SwapBatchResult): { result: TakeInResult; rebuilt: boolean } {
  const entry = batch.index.entries[request.path];
  if (entry?.kind !== "record") throw new Error(`Read-back lost the projected entry for ${request.path}`);
  if (!batch.unreplaced.includes(request.path)) return { result: { ...result, entry }, rebuilt: batch.rebuilt.includes(request.path) };
  context.report?.({ path: request.path, copy: request.copy, mark: entry.refused ?? {
    reason: "Read-back replacement is pending: the staged file did not remain at its path.",
    remedy: { text: "Keep the edit at its path or recorded aside copy; the next command retries once saving finishes or the path can be replaced." },
  } });
  return { result: { ...result, answer: "pending", entry }, rebuilt: false };
}
