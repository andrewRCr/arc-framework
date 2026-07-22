/** Directed-command advisory and checkout-pinned execution. */

import type { GitExec } from "../git/exec.js";
import { createLocusMutationResult } from "./mutation.js";
import type { LocusMutationResultV1 } from "./schema/index.js";

const DIRECTED_COMMAND_ADVISORY = "Confirm this session can direct commands to the active checkout before "
  + "continuing; if it cannot, start a cold session there.";

/**
 * Add operator-confirmed direction guidance when an operation allocates away from session home.
 *
 * @param result - The validated mutation result to narrate.
 * @param options - Force confirmation when the operation re-roots session home to its target.
 * @returns The unchanged result when co-located, otherwise a validated success with advisory narration.
 */
export function appendDirectedCommandAdvisory(
  result: LocusMutationResultV1,
  options: { readonly confirmationRequired?: boolean } = {},
): LocusMutationResultV1 {
  if (result.outcome === "refused" || result.outcome === "error"
    || result.activeLocusPath === null || result.sessionHomePath === null
    || (options.confirmationRequired !== true && result.activeLocusPath === result.sessionHomePath)) return result;
  return createLocusMutationResult({
    ...result,
    recommendedPromptText: `${result.recommendedPromptText} ${DIRECTED_COMMAND_ADVISORY}`,
  });
}

/**
 * Pin every Git invocation to one resolved locus, ignoring ambient or caller-supplied cwd.
 *
 * @param exec - Underlying Git execution boundary.
 * @param checkoutPath - Absolute active-locus or session-home path.
 * @returns A Git executor with the target cwd fixed.
 */
export function pinLocusGitExec(exec: GitExec, checkoutPath: string): GitExec {
  return (command, args, options) => exec(command, args, { ...options, cwd: checkoutPath });
}
