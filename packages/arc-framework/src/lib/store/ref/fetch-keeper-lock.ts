/** Identify a held Git ref lock that prevented retaining tracking heads before a fetch. */

import { join } from "node:path";
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import type { RefBackendContext } from "./context.js";

/** A known local lock preserves the pre-fetch retry boundary. */
export class RefFetchKeeperLockError extends Error {
  /** Preserve the exact lock and original Git evidence. */
  constructor(readonly lock: string, cause: unknown) {
    super("A Git ref lock prevented preserving tracking heads before fetching.", { cause });
    this.name = "RefFetchKeeperLockError";
  }
}

/** Classify only a completed Git failure with an independently observed lock; preserve all other failures. */
export async function rethrowRefFetchKeeperLock(context: RefBackendContext, refs: readonly string[], error: unknown): Promise<never> {
  const directory = context.repository?.gitDir ?? context.repository?.commonDir;
  if (!directory || !isGitProcessError(error) || !isCompletedGitFailure(error)) throw error;
  const locks = [join(directory, "reftable", "tables.list.lock"), ...refs.map((ref) => join(directory, `${ref}.lock`))];
  for (const lock of locks) {
    try { await context.fs.lstat(lock); }
    catch (failure) {
      if (typeof failure === "object" && failure !== null && "code" in failure
        && (failure.code === "ENOENT" || failure.code === "ENOTDIR")) continue;
      throw failure;
    }
    throw new RefFetchKeeperLockError(lock, error);
  }
  throw error;
}
