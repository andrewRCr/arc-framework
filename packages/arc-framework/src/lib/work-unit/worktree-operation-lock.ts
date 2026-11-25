/** Repository-wide serialization for physical worktree operations. */

import { join } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  withAdvisoryLock,
  type AdvisoryLockOptions,
} from "../advisory-lock.js";
import { resolveGitCommonDir } from "../git/exec.js";

/** Canonical lockfile shared by worktree rename and teardown. */
export const WORKTREE_OPERATION_LOCK_FILENAME = "arc-worktree-operation.lock";

/** Resolve the one repository-wide worktree-operation mutex. */
export async function resolveWorktreeOperationLockPath(exec: GitExec, cwd: string): Promise<string> {
  return join(await resolveGitCommonDir(exec, cwd), WORKTREE_OPERATION_LOCK_FILENAME);
}

/** Run an operation while holding the repository-wide worktree mutex. */
export async function withWorktreeOperationLock<T>(options: {
  readonly exec: GitExec;
  readonly cwd: string;
  readonly lockOptions?: AdvisoryLockOptions;
  readonly operation: (lockPath: string) => Promise<T>;
}): Promise<T> {
  const lockPath = await resolveWorktreeOperationLockPath(options.exec, options.cwd);
  return withAdvisoryLock(lockPath, options.operation, options.lockOptions);
}
