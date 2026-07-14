/** Canonical local commit resolution for repository-only review launchers. */

import type { GitExec } from "../../../lib/git/exec.js";
import { digestAt, ReviewRecordValidationError } from "../core/validation.js";

/**
 * Resolve a local commit-ish to the canonical SHA consumed by exact-head guards.
 *
 * @param exec - Injected git process boundary.
 * @param commitish - Local revision expression such as `HEAD`, a branch, or an abbreviated SHA.
 * @returns The resolved 40-character commit SHA.
 */
export async function resolveLocalCommit(exec: GitExec, commitish: string): Promise<string> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["rev-parse", "--verify", "--end-of-options", `${commitish}^{commit}`]));
  } catch {
    throw new ReviewRecordValidationError("reviewContext.proposedHead", "expected a resolvable local commit-ish");
  }
  return digestAt(stdout.trim(), "reviewContext.proposedHead", 40);
}
