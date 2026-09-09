/** Repository-wide serialization for physical worktree operations. */

import { join } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  acquireAdvisoryLock,
  releaseAdvisoryLock,
  type AdvisoryLockOptions,
} from "../advisory-lock.js";
import { resolveGitCommonDir } from "../user-sync/repo-shared-paths.js";

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
  const handle = await acquireAdvisoryLock(lockPath, options.lockOptions);
  let result: { readonly kind: "success"; readonly value: T } | { readonly kind: "failure"; readonly error: unknown };
  try {
    result = { kind: "success", value: await options.operation(lockPath) };
  } catch (error) {
    result = { kind: "failure", error };
  }

  let releaseError: unknown;
  try {
    await releaseAdvisoryLock(handle, options.lockOptions);
  } catch (error) {
    releaseError = error;
  }

  if (result.kind === "failure") {
    const primary = normalizeError(result.error);
    if (releaseError !== undefined) {
      throw new AggregateError([primary, normalizeError(releaseError)], primary.message, { cause: primary });
    }
    throw primary;
  }
  if (releaseError !== undefined) throw normalizeError(releaseError);
  return result.value;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
