/** Restage only fixer rewrites already carried by the forming commit. */
import { matchTreeInputs, type TreeMatchIO } from "./matching.js";
import { readTreeChange } from "./tree.js";
import { resolve, join } from "node:path";
import { resolveCheckoutGitDir, type GitExec } from "../git/exec.js";

/**
 * Admit the repository index and its all-tracked commit lock, excluding temporary indexes.
 * @param git - Repository Git boundary
 * @param root - Checkout root
 * @param indexFile - Exact index supplied to the hook
 * @returns Whether restaging keeps the checkout index coherent with the commit
 */
export async function commitRestageAllowed(git: GitExec, root: string, indexFile: string): Promise<boolean> {
  const ownIndex = join(await resolveCheckoutGitDir(git, root), "index");
  const supplied = resolve(root, indexFile);
  return supplied === ownIndex || supplied === `${ownIndex}.lock`;
}

/**
 * Stage admitted rewrites into the exact index supplied to the hook.
 * @param io - Repository Git boundaries
 * @param root - Repository root
 * @param content - Original commit coordinates and current rewritten paths
 * @param indexFile - Exact index Git will commit
 * @returns Tree carrying the restaged output
 */
export async function restageCommitFixes(io: TreeMatchIO, root: string,
  content: { base?: string; tree: string; rewritten: string[] }, indexFile: string): Promise<string> {
  const change = content.base === undefined ? await matchTreeInputs(io, root, content.tree)
    : await readTreeChange(io.git, root, content.base, content.tree);
  if (change.status === "unresolved") throw new Error("Could not resolve the commit's paths; retry git commit.");
  const carried = new Set(change.paths.map(path => path.path));
  const paths = content.rewritten.filter(path => carried.has(path));
  if (paths.length > 0) await io.git("git", ["add", "-A", "--", ...paths.map(path => `:(literal)${path}`)], {
    cwd: root, indexFile, clearPathspecEnvironment: true,
  });
  return (await io.git("git", ["write-tree"], { cwd: root, indexFile })).stdout;
}
