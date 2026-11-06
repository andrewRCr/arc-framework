/** Preserve pending replacement outcomes and report guard conditions that the take-in port does not report. */
import type { ReadBackContext } from "./read-back.js";
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
