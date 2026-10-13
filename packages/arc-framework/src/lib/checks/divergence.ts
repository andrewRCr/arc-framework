/** Compare checked content with the worktree over a check's declared inputs. */
import type { GitExec } from "../git/exec.js";
import { selectChangedInputs } from "./matching.js";

/**
 * Resolve paths a check could read outside its checked content.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param tree - Checked tree
 * @param worktree - Snapshot of staged-worktree content
 * @param inputs - Declared Git glob inputs
 * @param globalInputs - Independently matched shared Git glob inputs
 * @returns Differing input paths, refusing an unavailable comparison
 */
export async function readCheckDivergence(git: GitExec, root: string, tree: string, worktree: string, inputs: readonly string[], globalInputs: readonly string[] = []): Promise<string[]> {
  if (tree === worktree) return [];
  try {
    const changes = await Promise.all([inputs, globalInputs].filter(group => group.length > 0)
      .map(group => selectChangedInputs(git, root, tree, worktree, group)));
    if (changes.some(change => change.status === "unresolved")) throw new Error("Unavailable tree comparison");
    return [...new Set(changes.flatMap(change => change.status === "selected" ? change.paths.map(path => path.path) : []))];
  } catch (cause) {
    throw new Error("Could not compare checked content with the worktree; retry the check request.", { cause });
  }
}
