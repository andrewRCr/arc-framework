/** Observe fixer output without changing the repository's index. */
import { normalizeGitRejection } from "../git/process-error.js";
import type { GitExec } from "../git/exec.js";
import type { CheckRequest } from "./request.js";
import type { ResolvedCheckRequest } from "./resolve-request.js";
import { createWorktreeSnapshot, readTreeChange } from "./tree.js";

/**
 * Refresh the current snapshot after a fixer and list its admitted file rewrites.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param coordinates - Mutable content coordinates for subsequent checks
 * @param advanceCheckedTree - Whether this event follows the current worktree content
 * @returns Rewritten repository-relative paths
 */
export async function refreshFixerContent(git: GitExec, root: string, coordinates: ResolvedCheckRequest, advanceCheckedTree = true): Promise<string[]> {
  try {
    const before = coordinates.worktreeTree ?? coordinates.tree;
    if (coordinates.snapshot === undefined) coordinates.snapshot = await createWorktreeSnapshot(git, root, coordinates.snapshotDirectory);
    else {
      if (!await hasWorktreeChanges(git, root, coordinates.snapshot.indexFile)) return [];
      await coordinates.snapshot.refresh();
    }
    const after = coordinates.snapshot.tree;
    const change = before === after ? { status: "known" as const, paths: [] }
      : await readTreeChange(git, root, before, after);
    if (change.status === "unresolved") throw new Error("Unavailable rewrite comparison");
    coordinates.worktreeTree = after;
    if (advanceCheckedTree) coordinates.tree = after;
    return change.paths.map(path => path.path);
  } catch (cause) {
    throw new Error("Could not resolve a fixer's rewrites; retry the check request.", { cause });
  }
}

async function hasWorktreeChanges(git: GitExec, root: string, indexFile: string): Promise<boolean> {
  const args = ["update-index", "--refresh"];
  try {
    await git("git", args, { cwd: root, indexFile });
  } catch (cause) {
    const failure = normalizeGitRejection(cause, { command: "git", args });
    if (failure.kind === "nonzero-exit" && failure.exitCode === 1 && failure.signal === undefined) return true;
    throw cause;
  }
  return (await git("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, indexFile, preserveOutput: true })).stdout !== "";
}

/**
 * Decide whether this request forms content rather than verifying it.
 * @param request - Validated form, scope, and CI policy
 * @returns Whether declared fixers may leave rewrites
 */
export function checkFixesAllowed(request: CheckRequest): boolean {
  if (request.ci) return false;
  return request.form.kind === "increment" || request.form.kind === "segment" || request.form.kind === "run"
    || request.form.kind === "pre-commit" || request.scope?.kind === "paths";
}
