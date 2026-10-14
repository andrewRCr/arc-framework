/** Merges carried by a request's first-parent commit range, and the checked files a base merge brought in. */
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import { normalizeGitRejection } from "../git/process-error.js";
import { selectChangedInputs } from "./matching.js";
import type { CheckScope } from "./request.js";
import type { TreePathChange } from "./tree.js";

/** One merge on a first-parent range: the merge commit, its first parent, and the parents it merged in. */
export interface CheckMerge { commit: string; firstParent: string; merged: string[] }

type ReadChanges = (from: string, to: string) => Promise<Map<string, TreePathChange> | undefined>;

/**
 * Read every merge on one first-parent range, without a history cap.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param base - Exact start of the change
 * @param tip - Commit tip, distinct from the checked tree
 * @returns Merges in Git's range traversal order
 */
export async function readCheckMerges(git: GitExec, root: string, base: string, tip: string): Promise<CheckMerge[]> {
  let output: string;
  try {
    output = (await git("git", ["rev-list", "--first-parent", "--merges", "--parents", `${base}..${tip}`], { cwd: root })).stdout;
  } catch (cause) {
    throw new Error("Could not read merge parents; retry the check request.", { cause });
  }
  return output.trim().split(/\r?\n/u).filter(Boolean).map(line => {
    const [commit = "", firstParent = "", ...merged] = line.trim().split(/\s+/u);
    if (merged.length === 0 || [commit, firstParent, ...merged].some(id => !isGitObjectId(id))) {
      throw new Error("Could not read merge parents; retry the check request.");
    }
    return { commit, firstParent, merged };
  });
}

/**
 * Name the checked files a base merge brought in unchanged: a merge on the range changed each from its first parent
 * to the content of a merged-in parent already on the base branch, and the checked tree still carries that content.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param content - Base, checked tree, the range's merges, the base branch's remote tip, the check's inputs, and the
 *   files it examined
 * @returns The examined files in their given order, or undefined when Git could not answer a comparison
 */
export async function readMergedInPaths(git: GitExec, root: string, content: {
  base: string; tree: string; merges: readonly CheckMerge[]; remoteBase: string; inputs: readonly string[];
  paths: readonly string[];
}): Promise<string[] | undefined> {
  const changes: ReadChanges = async (from, to) => {
    const selection = await selectChangedInputs(git, root, from, to, content.inputs);
    if (selection.status === "unresolved") return undefined;
    return new Map(selection.status === "selected" ? selection.paths.map(path => [path.path, path]) : []);
  };
  const sinceBase = await changes(content.base, content.tree);
  if (sinceBase === undefined) return undefined;
  const pending = new Set(content.paths.filter(path => sinceBase.has(path)));
  const mergedIn = new Set<string>();
  // One comparison at a time, since a long range carries any number of merges; stop once every file is settled.
  for (const merge of content.merges) {
    if (pending.size === 0) break;
    const introduced = await changes(merge.firstParent, merge.commit);
    if (introduced === undefined) return undefined;
    const carried = [...pending].filter(path => sameContent(introduced.get(path), sinceBase.get(path)));
    const settled = carried.length === 0 ? []
      : await readBaseParentPaths(git, root, { merge, remoteBase: content.remoteBase, carried, changes });
    if (settled === undefined) return undefined;
    for (const path of settled) {
      mergedIn.add(path);
      pending.delete(path);
    }
  }
  return content.paths.filter(path => mergedIn.has(path));
}

/** Whether a merge left a file with the content the checked tree still carries. */
function sameContent(merge: TreePathChange | undefined, tree: TreePathChange | undefined): boolean {
  return merge !== undefined && tree !== undefined && merge.newBlob === tree.newBlob && merge.newMode === tree.newMode;
}

/** Name the carried files whose merge result equals a merged-in parent already on the base branch. */
async function readBaseParentPaths(git: GitExec, root: string, content: {
  merge: CheckMerge; remoteBase: string; carried: readonly string[]; changes: ReadChanges;
}): Promise<string[] | undefined> {
  const settled = new Set<string>();
  for (const parent of content.merge.merged) {
    const open = content.carried.filter(path => !settled.has(path));
    if (open.length === 0) break;
    const onBase = await isAncestor(git, root, parent, content.remoteBase);
    if (onBase === undefined) return undefined;
    if (!onBase) continue;
    const sinceParent = await content.changes(parent, content.merge.commit);
    if (sinceParent === undefined) return undefined;
    for (const path of open.filter(path => !sinceParent.has(path))) settled.add(path);
  }
  return content.carried.filter(path => settled.has(path));
}

/** Answer one containment question. `--is-ancestor` exits one for no, so any other failure leaves it unanswered. */
async function isAncestor(git: GitExec, root: string, ancestor: string, descendant: string): Promise<boolean | undefined> {
  const args = ["merge-base", "--is-ancestor", ancestor, descendant];
  try {
    await git("git", args, { cwd: root });
    return true;
  } catch (error) {
    const rejected = normalizeGitRejection(error, { command: "git", args });
    return rejected.kind === "nonzero-exit" && rejected.exitCode === 1 ? false : undefined;
  }
}

/**
 * Name the files a file check on a range leaves unchecked: a merge on the range brought each in from a parent already
 * on the base branch, and the range changed it no further, so its content is the base's rather than the range's own.
 * Staged requests keep their own merge selection. Leaving a file out narrows what the check certifies, so a base
 * branch with no remote tip, or a comparison Git cannot answer, leaves every file in.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param content - Request scope, base, merges, the base branch's remote tip, checked tree, the check's inputs, and
 *   its selected files
 * @returns The selected files to leave unchecked, in their given order
 */
export async function readRangeMergedInPaths(git: GitExec, root: string, content: {
  scope: CheckScope; base?: string; merges?: readonly CheckMerge[]; remoteBase?: string; tree: string;
  inputs: readonly string[]; paths: readonly string[];
}): Promise<string[]> {
  const { scope, base, merges, remoteBase, tree, inputs, paths } = content;
  if (scope.kind !== "range" || base === undefined || remoteBase === undefined || merges === undefined
    || merges.length === 0) return [];
  try {
    return await readMergedInPaths(git, root, { base, tree, merges, remoteBase, inputs, paths }) ?? [];
  } catch {
    return [];
  }
}
