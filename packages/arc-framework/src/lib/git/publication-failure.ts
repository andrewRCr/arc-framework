/** Structured failure facts for Git publication adapters. */
import type { RemoteFailureReason } from "../kernel/index.js";
import { gitFailureText, normalizeGitRejection } from "./process-error.js";
import { isNonFastForwardError, isRemoteUnavailableError } from "./ref-tree.js";
import { classifyRemoteFailure } from "./remote-ref-reader.js";

/** Remote publication classifications shared by notes and identity refs. */
export type RemotePublicationFailure =
  | { code: "unreachable"; cause: RemoteFailureReason }
  | { code: "refused"; message: string }
  | { code: "retries-exhausted"; retryCount: number };

/** Classify a failed Git boundary, with contention classified only at exhaustion.
 * @param error - Original failed remote operation.
 * @param retryCount - Actual exhausted operation count, when bounded retries ended.
 * @returns Structured remote facts, or undefined when the failure is local or unclassified.
 */
export function classifyPublicationFailure(error: unknown, retryCount?: number): RemotePublicationFailure | undefined {
  const normalized = normalizeGitRejection(error, { command: "git", args: [] });
  if (normalized.kind === "timed-out") return { code: "unreachable", cause: "timeout" };
  if (normalized.kind !== "nonzero-exit" || normalized.exitCode === undefined || normalized.exitCode === 0) return undefined;
  const detail = gitFailureText(error);
  if (retryCount !== undefined && isNonFastForwardError(detail)) return { code: "retries-exhausted", retryCount };
  const cause = classifyRemoteFailure(error);
  if (isRemoteUnavailableError(detail) || cause !== "error") return { code: "unreachable", cause };
  return { code: "refused", message: error instanceof Error ? error.message : String(error) };
}
