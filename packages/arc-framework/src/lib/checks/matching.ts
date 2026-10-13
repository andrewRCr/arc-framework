/** Repository-relative input matching through Git's own pathspec grammar. */
import type { GitExec, GitExecInput } from "../git/exec.js";
import { readTreeChange, type TreeChange, type TreePathChange } from "./tree.js";

/** Git boundaries for tree matching and empty-tree construction. */
export interface TreeMatchIO { git: GitExec; gitInput: GitExecInput }

/** Selection established by the check's own input change. */
export type InputSelection = { status: "selected"; paths: TreePathChange[] }
  | { status: "not selected"; reason: "inputs unchanged" }
  | { status: "unresolved" };

/**
 * Select a check from the change that reaches its declared inputs.
 * @param git - Injectable Git process boundary
 * @param cwd - Repository root
 * @param base - Change's starting coordinate
 * @param tree - Checked tree
 * @param inputs - Declared repository-relative glob inputs
 * @returns Selection with changed paths, no selection, or an unavailable change
 */
export async function selectChangedInputs(git: GitExec, cwd: string, base: string, tree: string, inputs: readonly string[]): Promise<InputSelection> {
  const change = inputs.length === 0 ? { status: "known" as const, paths: [] }
    : await readTreeChange(git, cwd, base, tree, inputPathspecs(inputs));
  if (change.status === "unresolved") return change;
  return change.paths.length === 0 ? { status: "not selected", reason: "inputs unchanged" }
    : { status: "selected", paths: change.paths };
}

/**
 * Read existing matching paths with full object identities.
 * @param io - Injectable Git process boundaries
 * @param cwd - Repository root
 * @param tree - Checked tree
 * @param inputs - Declared repository-relative glob inputs
 * @returns The matching tree entries or an unresolved Git read
 */
export async function matchTreeInputs(io: TreeMatchIO, cwd: string, tree: string, inputs: readonly string[] = ["**"]): Promise<TreeChange> {
  if (inputs.length === 0) return { status: "known", paths: [] };
  let emptyTree: string;
  try {
    emptyTree = (await io.gitInput(["mktree"], "", { cwd })).trim();
  } catch {
    return { status: "unresolved" };
  }
  return readTreeChange(io.git, cwd, emptyTree, tree, inputPathspecs(inputs));
}

function inputPathspecs(inputs: readonly string[]): string[] {
  return inputs.map(input => input.startsWith("!") ? `:(glob,exclude)${input.slice(1)}` : `:(glob)${input}`);
}
