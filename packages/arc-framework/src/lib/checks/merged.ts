/** Merged-in parents carried by a request's first-parent commit range. */
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";

/**
 * Read all non-first parents from merges on one first-parent range, without a history cap.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param base - Exact start of the change
 * @param tip - Commit tip, distinct from the checked tree
 * @returns Merged-in parents in Git's range traversal order
 */
export async function readCheckMergedParents(git: GitExec, root: string, base: string, tip: string): Promise<string[]> {
  let output: string;
  try {
    output = (await git("git", ["rev-list", "--first-parent", "--merges", "--parents", `${base}..${tip}`], { cwd: root })).stdout;
  } catch (cause) {
    throw new Error("Could not read merge parents; retry the check request.", { cause });
  }
  return output.trim().split(/\r?\n/u).filter(Boolean).flatMap(line => {
    const ids = line.trim().split(/\s+/u);
    if (ids.length < 3 || ids.some(id => !isGitObjectId(id))) throw new Error("Could not read merge parents; retry the check request.");
    return ids.slice(2);
  });
}
