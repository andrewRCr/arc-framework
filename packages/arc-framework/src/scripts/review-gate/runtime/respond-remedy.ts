/**
 * Corrective guidance for a review response refused before it could record anything.
 * Report-input mismatches name the exact finding identities and preserve the caller's request for correction.
 *
 * A verified fix is recorded against the committed head that contains it, so a response carrying one refuses
 * until that head exists. Where the target is read from the checkout, an uncommitted fix refuses as a dirty
 * worktree. Where the exact target simply has not changed, the fix is either uncommitted or not yet applied. Each
 * is a recoverable stop, not a terminal one: putting the committed fix in place and replaying the same request
 * reaches the ordinary recording path. The replay leaves out a disposition supersession: the approval call that
 * published the successor set spent it, and it requires the unchanged reviewed head that the fix commit moves.
 *
 * @module
 */

import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import { LocalTargetDerivationError } from "../hosts/local/repository-target.js";
import { ReviewReportInputError } from "../core/review-report-inputs.js";
import { UnchangedVerifiedFixTargetError } from "./respond-command.js";

const RESPOND_ARGV = ["arc", "review", "respond", "-"] as const;

const INVARIANT = "A verified fix is recorded only against the clean committed head that contains it.";

function correctionFor(error: unknown): string | undefined {
  if (error instanceof LocalTargetDerivationError && error.reason === "dirty-worktree") {
    return "Commit the fix through the commit interlock so the worktree is clean, then replay the response";
  }
  if (error instanceof UnchangedVerifiedFixTargetError) {
    return "Apply the approved fix if it is not in place, commit it through the commit interlock, then replay the "
      + "response";
  }
  return undefined;
}

function replayRequest(request: object): object {
  return Object.fromEntries(Object.entries(request).filter(([key]) => key !== "supersedes"));
}

/**
 * Name the correction and retry for refused report inputs or an uncommitted verified fix.
 *
 * @param error - The failure the response raised.
 * @param request - The caller's request as submitted; only verified-fix retries omit its supersession.
 * @returns The recoverable input or committed-fix remedy, otherwise `undefined`.
 */
export function reviewRespondRemedy(error: unknown, request: unknown): SpineRemedy | undefined {
  if (typeof request !== "object" || request === null) return undefined;
  if (error instanceof ReviewReportInputError) {
    return spineRemedy("Advisory report notes must match the canonical finding identities.",
      error.correction, RESPOND_ARGV, request);
  }
  const correction = correctionFor(error);
  if (correction === undefined || !("verifiedFix" in request)) return undefined;
  return spineRemedy(INVARIANT, correction, RESPOND_ARGV, replayRequest(request));
}
