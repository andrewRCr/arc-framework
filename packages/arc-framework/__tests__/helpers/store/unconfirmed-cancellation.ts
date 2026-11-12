/** Typed cancellation evidence from a Git executor that could not confirm descendant termination. */
import { GitProcessError } from "../../../src/lib/git/process-error.js";

export function unconfirmedCancellation(args: readonly string[], stderr: string): GitProcessError {
  return new GitProcessError({ kind: "canceled", command: "git", args, isCanceled: true, descendantsUnconfirmed: true, stderr });
}
