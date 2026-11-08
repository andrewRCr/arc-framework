/** Preserve pending guard and swap outcomes that leave a read-back uninstalled. */
import type { ReadBackContext } from "./read-back.js";
import type { SwapBatchResult } from "./swap.js";
import type { GuardResult } from "./replace-guard.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";

/** Keep an unreplaced path unsent even when an earlier version of its edit landed. */
export function holdReadBack(context: ReadBackContext, request: TakeInRequest, result: TakeInResult,
  guarded: Extract<GuardResult, { kind: "unreplaced" }>): TakeInResult {
  if (guarded.cause === "unsettled") context.report?.({ path: request.path, copy: request.copy, mark: {
    reason: "Read-back is pending: the file is unsettled after repeated saves.",
    remedy: { text: "Let the editor finish saving; the next command will retry the file." },
  } });
  if (guarded.cause === "refresh-refused") context.report?.({ path: request.path, copy: request.copy, mark: {
    reason: `The edit landed, but restaging failed: ${guarded.refusal.condition}`, remedy: guarded.refusal.remedy,
  } });
  if (guarded.cause === "not-a-file") context.report?.({ path: request.path, copy: request.copy, mark: {
    reason: "Read-back is pending: the path is not a regular file.", remedy: guarded.remedy,
  } });
  return { ...result, answer: "pending", entry: guarded.entry };
}

/** Return actual swap settlement without confusing it with a pending mark carried into a successful read-back. */
export function readBackSwapResult(context: ReadBackContext, request: TakeInRequest, result: TakeInResult,
  batch: SwapBatchResult): TakeInResult {
  const entry = batch.index.entries[request.path];
  if (entry?.kind !== "record") throw new Error(`Read-back lost the projected entry for ${request.path}`);
  if (!batch.unreplaced.includes(request.path)) return { ...result, entry };
  context.report?.({ path: request.path, copy: request.copy, mark: {
    reason: "Read-back replacement is pending: the staged file did not remain at its path.",
    remedy: { text: "Keep the edit at its path or recorded aside copy; the next command retries once saving finishes or the path can be replaced." },
  } });
  return { ...result, answer: "pending", entry };
}
