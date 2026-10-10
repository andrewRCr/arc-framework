/** Staged input paths whose worktree bytes differ from the commit. */
import { matchTreeInputs, selectChangedInputs, type TreeMatchIO } from "./matching.js";
import { readCheckDivergence } from "./divergence.js";

/** A selected check's affected staged inputs. */
export interface PartiallyStagedCheck { id: string; paths: string[] }

/**
 * Find overlap between staged changes and differing worktree inputs.
 * @param io - Repository matching boundaries
 * @param root - Repository root
 * @param content - Exact checked, worktree, and optional first-parent coordinates
 * @param checks - Checks selected for this commit
 * @returns Only checks containing partially staged paths
 */
export async function findPartiallyStagedChecks(
  io: TreeMatchIO, root: string, content: { base?: string; tree: string; worktree: string },
  checks: Array<{ id: string; inputs: string[] }>,
): Promise<PartiallyStagedCheck[]> {
  if (content.tree === content.worktree) return [];
  const affected: PartiallyStagedCheck[] = [];
  for (const { id, inputs } of checks) {
    const staged = content.base === undefined ? await matchTreeInputs(io, root, content.tree, inputs)
      : await selectChangedInputs(io.git, root, content.base, content.tree, inputs);
    if (staged.status === "unresolved") throw new Error(`Could not resolve staged inputs for ${id}; retry git commit.`);
    if (staged.status === "not selected") continue;
    const unstaged = new Set(await readCheckDivergence(io.git, root, content.tree, content.worktree, inputs));
    const paths = staged.paths.map(path => path.path).filter(path => unstaged.has(path));
    if (paths.length > 0) affected.push({ id, paths });
  }
  return affected;
}
