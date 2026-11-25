/** Verify a request's logical HEAD without mistaking unavailable Git evidence for an unborn branch. */
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import { isCompletedGitFailure, normalizeGitRejection } from "../git/process-error.js";

/** Evidence for the logical HEAD selected by the request. */
export type CheckHeadEvidence = { status: "known"; commit: string } | { status: "unborn" } | { status: "unavailable" };

/** Resolve one commit, verifying an absent branch before declaring HEAD unborn. */
export async function readCheckHead(git: GitExec, root: string, ref = "HEAD"): Promise<CheckHeadEvidence> {
  try {
    const commit = (await git("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], { cwd: root })).stdout.trim();
    return isGitObjectId(commit) ? { status: "known", commit } : { status: "unavailable" };
  } catch (error) {
    if (ref === "HEAD" && isCompletedGitFailure(error) && await isUnborn(git, root)) return { status: "unborn" };
    return { status: "unavailable" };
  }
}

async function isUnborn(git: GitExec, root: string): Promise<boolean> {
  let branch: string;
  try {
    branch = (await git("git", ["symbolic-ref", "--quiet", "HEAD"], { cwd: root })).stdout.trim();
    if (!branch.startsWith("refs/heads/")) return false;
    await git("git", ["check-ref-format", branch], { cwd: root });
  } catch { return false; }
  const args = ["show-ref", "--verify", "--quiet", branch];
  try {
    await git("git", args, { cwd: root });
    return false;
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    return failure.kind === "nonzero-exit" && failure.exitCode === 1 && failure.signal === undefined;
  }
}
