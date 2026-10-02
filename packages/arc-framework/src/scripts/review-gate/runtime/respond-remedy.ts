/**
 * Corrective guidance for a review response refused before it could record anything.
 *
 * A verified fix is recorded against the committed head that contains it, so a response carrying one refuses
 * while the fix is still uncommitted. Where the target is read from the checkout, the refusal is a dirty worktree;
 * where it is read from recorded coordinates, the exact target simply has not changed. Either is a recoverable
 * stop, not a terminal one: committing the fix and replaying the same request reaches the ordinary recording path.
 *
 * @module
 */

import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import { LocalTargetDerivationError } from "../hosts/local/repository-target.js";
import { UnchangedVerifiedFixTargetError } from "./respond-command.js";

const RESPOND_ARGV = ["arc", "review", "respond", "-"] as const;

function refusesUncommittedFix(error: unknown): boolean {
  return (error instanceof LocalTargetDerivationError && error.reason === "dirty-worktree")
    || error instanceof UnchangedVerifiedFixTargetError;
}

/**
 * Name the commit-then-replay continuation for a verified fix submitted before it was committed.
 *
 * @param error - The failure the response raised.
 * @param request - The caller's request exactly as submitted, carried as the replay's standard input.
 * @returns The remedy when a verified-fix response refused its uncommitted fix; otherwise `undefined`.
 */
export function uncommittedVerifiedFixRemedy(error: unknown, request: unknown): SpineRemedy | undefined {
  if (!refusesUncommittedFix(error)) return undefined;
  if (typeof request !== "object" || request === null || !("verifiedFix" in request)) return undefined;
  return spineRemedy(
    "A verified fix is recorded only against the clean committed head that contains it.",
    "Commit the fix through the commit interlock so the worktree is clean, then replay the response",
    RESPOND_ARGV,
    request,
  );
}
