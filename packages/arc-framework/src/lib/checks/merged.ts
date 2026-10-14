/** Merged-in parents carried by a request's first-parent commit range, and the checked files they brought in. */
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import { selectChangedInputs } from "./matching.js";

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

/**
 * Name the checked files a merge brought in unchanged: changed since the base, and identical to a merged-in parent.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param content - Base, checked tree, merged-in parents, the check's inputs, and the files it examined
 * @returns The examined files in their given order, or undefined when Git could not compare the trees
 */
export async function readMergedInPaths(git: GitExec, root: string, content: {
  base: string; tree: string; merged: readonly string[]; inputs: readonly string[]; paths: readonly string[];
}): Promise<string[] | undefined> {
  const changes = await Promise.all([content.base, ...content.merged]
    .map(start => selectChangedInputs(git, root, start, content.tree, content.inputs)));
  if (changes.some(change => change.status === "unresolved")) return undefined;
  const [sinceBase, ...sinceParents] = changes.map(change =>
    new Set(change.status === "selected" ? change.paths.map(path => path.path) : []));
  return content.paths.filter(path => sinceBase?.has(path) === true && sinceParents.some(changed => !changed.has(path)));
}
