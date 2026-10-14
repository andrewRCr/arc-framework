/** Merged-in parents carried by a request's first-parent commit range, and the checked files they brought in. */
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import { selectChangedInputs } from "./matching.js";
import type { CheckScope } from "./request.js";

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
  const changed = async (start: string): Promise<Set<string> | undefined> => {
    const selection = await selectChangedInputs(git, root, start, content.tree, content.inputs);
    if (selection.status === "unresolved") return undefined;
    return new Set(selection.status === "selected" ? selection.paths.map(path => path.path) : []);
  };
  const sinceBase = await changed(content.base);
  if (sinceBase === undefined) return undefined;
  const pending = new Set(content.paths.filter(path => sinceBase.has(path)));
  const mergedIn = new Set<string>();
  // One comparison at a time, since a long range carries any number of merges; stop once every file is settled.
  for (const parent of content.merged) {
    if (pending.size === 0) break;
    const sinceParent = await changed(parent);
    if (sinceParent === undefined) return undefined;
    for (const path of [...pending].filter(path => !sinceParent.has(path))) {
      mergedIn.add(path);
      pending.delete(path);
    }
  }
  return content.paths.filter(path => mergedIn.has(path));
}

/**
 * Name the files a file check on a range leaves unchecked: changed on the range, and identical to a merged-in parent,
 * so their content is that parent's rather than the range's own. Staged requests keep their own merge selection.
 * Leaving a file out narrows what the check certifies, so a comparison Git cannot complete leaves every file in.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param content - Request scope, base, merged-in parents, checked tree, the check's inputs, and its selected files
 * @returns The selected files to leave unchecked, in their given order
 */
export async function readRangeMergedInPaths(git: GitExec, root: string, content: {
  scope: CheckScope; base?: string; merged?: readonly string[]; tree: string; inputs: readonly string[];
  paths: readonly string[];
}): Promise<string[]> {
  const { scope, base, merged, tree, inputs, paths } = content;
  if (scope.kind !== "range" || base === undefined || merged === undefined || merged.length === 0) return [];
  try {
    return await readMergedInPaths(git, root, { base, tree, merged, inputs, paths }) ?? [];
  } catch {
    return [];
  }
}
