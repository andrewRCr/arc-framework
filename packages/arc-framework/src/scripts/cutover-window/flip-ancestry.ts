/** Require the importing main revision to be a proper ancestor of the recorded flip tip. */
import type { WindowGitReadIO } from "./git.js";
import type { WindowRecord } from "./hold.js";
import type { WindowFinding } from "./result.js";
import { isCompletedGitFailure, isGitProcessError } from "../../lib/git/process-error.js";

/** Compare immutable captured tips without replacement objects or changes to repository state. */
export async function readWindowFlipAncestryFindings(io: WindowGitReadIO, record: WindowRecord): Promise<WindowFinding[]> {
  const main = record.branches.local.main, { branch, head } = record.flip;
  const refusal = { subject: branch, condition: `Main (${main ?? "unavailable"}) is not a proper ancestor of the flip (${head}).`,
    remedy: "Merge main into the flip branch and advance it beyond main, then fix its head again as the window requires and retry check." };
  if (main === undefined || main === head) return [refusal];
  try {
    await io.exec("git", ["--no-replace-objects", "merge-base", "--is-ancestor", main, head],
      { cwd: io.repo, objectAccess: "local-only" });
    return [];
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return [refusal];
    return [{ subject: branch, condition: `Cannot read main-to-flip ancestry: ${String(error)}`,
      remedy: "Restore Git access and readable main and flip commits, then retry check." }];
  }
}
