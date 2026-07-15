/** Generation-aware storage for the worktree-local latest commit-message retry. */

import { join, resolve } from "node:path";

import { COMMIT_MESSAGE_RETRY_FILENAME } from "./commit-message-retry.js";

/** Lockfile that serializes retry replacement and successful-consumption cleanup. */
export const COMMIT_MESSAGE_RETRY_LOCK_FILENAME = `${COMMIT_MESSAGE_RETRY_FILENAME}.lock`;

/** Writable private temporary file used during atomic retry replacement. */
export interface CommitMessageRetryFileHandle {
  writeFile: (bytes: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
}

/** System boundaries required by the retry store. */
export interface CommitMessageRetryStoreDeps {
  resolveGitDir: (cwd: string) => Promise<string>;
  randomId: () => string;
  openPrivate: (path: string) => Promise<CommitMessageRetryFileHandle>;
  identifyFile: (path: string) => Promise<string>;
  rename: (from: string, to: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  withLock: <T>(path: string, operation: () => Promise<T>) => Promise<T>;
}

/** Serialized latest-retry persistence and cleanup operations. */
export interface CommitMessageRetryStore {
  persist: (opts: { cwd: string; bytes: Uint8Array }) => Promise<{ path: string }>;
  cleanup: (opts: {
    cwd: string;
    sourcePath: string;
    sourceIdentity: string;
  }) => Promise<boolean>;
}

function isErrnoCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && "code" in cause && cause.code === code;
}

/**
 * Create a retry store whose replacement and cleanup operations share one lock.
 *
 * @param deps - Filesystem, Git-directory, identity, and locking boundaries.
 * @returns Serialized persistence and cleanup operations.
 */
export function createCommitMessageRetryStore(
  deps: CommitMessageRetryStoreDeps,
): CommitMessageRetryStore {
  return {
    persist: async (opts) => {
      const gitDir = await deps.resolveGitDir(opts.cwd);
      const path = join(gitDir, COMMIT_MESSAGE_RETRY_FILENAME);
      const lockPath = join(gitDir, COMMIT_MESSAGE_RETRY_LOCK_FILENAME);

      return deps.withLock(lockPath, async () => {
        const temporaryPath = join(
          gitDir,
          `.arc-release-commit-message-retry-${deps.randomId()}.tmp`,
        );
        const handle = await deps.openPrivate(temporaryPath);
        try {
          await handle.writeFile(opts.bytes);
          await handle.close();
          await deps.rename(temporaryPath, path);
        } catch (cause: unknown) {
          await handle.close().catch(() => undefined);
          await deps.unlink(temporaryPath).catch(() => undefined);
          throw cause;
        }
        return { path };
      });
    },

    cleanup: async (opts) => {
      const gitDir = await deps.resolveGitDir(opts.cwd);
      const path = join(gitDir, COMMIT_MESSAGE_RETRY_FILENAME);
      if (resolve(opts.cwd, opts.sourcePath) !== path) return false;
      const lockPath = join(gitDir, COMMIT_MESSAGE_RETRY_LOCK_FILENAME);

      return deps.withLock(lockPath, async () => {
        let currentIdentity: string;
        try {
          currentIdentity = await deps.identifyFile(path);
        } catch (cause: unknown) {
          if (isErrnoCode(cause, "ENOENT")) return false;
          throw cause;
        }
        if (currentIdentity !== opts.sourceIdentity) return false;
        try {
          await deps.unlink(path);
        } catch (cause: unknown) {
          if (!isErrnoCode(cause, "ENOENT")) throw cause;
        }
        return true;
      });
    },
  };
}
