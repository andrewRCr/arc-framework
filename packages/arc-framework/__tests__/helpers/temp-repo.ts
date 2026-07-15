/**
 * Retry-safe teardown for git-backed temp directories.
 *
 * Git's background auto-gc repacks objects under `.git/objects/pack` and can
 * race a recursive removal, surfacing a transient `ENOTEMPTY`/`EBUSY` mid-
 * teardown even after the caller is done with the repo. This primitive retries
 * those transient errnos with bounded backoff, then fails with a diagnostic
 * naming the path and the last errno. It is the single removal path for every
 * git-backed temp directory in the test suite, so the hardened teardown cannot
 * drift between call sites.
 */

import { rm } from "node:fs/promises";

/** Options controlling retry behavior and injectable seams for testing. */
export interface RemoveGitBackedDirOptions {
  /**
   * Removal implementation. Defaults to a recursive, force `rm` (a missing path
   * resolves cleanly). Injectable so tests can simulate a teardown race.
   */
  remove?: (path: string) => Promise<void>;
  /** Maximum removal attempts before giving up. */
  attempts?: number;
  /** Base backoff in milliseconds; the delay grows per attempt up to a cap. */
  baseDelayMs?: number;
  /** Delay implementation between attempts. Injectable so tests skip real waits. */
  sleep?: (ms: number) => Promise<void>;
}

/** Errnos that indicate a transient teardown race worth retrying. */
const RETRYABLE_ERRNOS = new Set(["ENOTEMPTY", "EBUSY"]);

const DEFAULT_ATTEMPTS = 10;
const DEFAULT_BASE_DELAY_MS = 20;
const MAX_DELAY_MS = 500;

function defaultRemove(path: string): Promise<void> {
  return rm(path, { recursive: true, force: true });
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errnoOf(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

/**
 * Remove a git-backed temp directory, retrying transient teardown races.
 *
 * @param path - Absolute path to the directory to remove.
 * @param options - Retry tuning and injectable seams (see {@link RemoveGitBackedDirOptions}).
 * @throws If a non-transient error occurs, or the transient error persists past the attempt budget.
 */
export async function removeGitBackedDir(
  path: string,
  options: RemoveGitBackedDirOptions = {},
): Promise<void> {
  const remove = options.remove ?? defaultRemove;
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep ?? realSleep;

  let lastErrno: string | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await remove(path);
      return;
    } catch (err) {
      const code = errnoOf(err);
      if (code === undefined || !RETRYABLE_ERRNOS.has(code)) throw err;
      lastErrno = code;
      if (attempt < attempts) {
        await sleep(Math.min(baseDelayMs * attempt, MAX_DELAY_MS));
      }
    }
  }

  throw new Error(
    `Failed to remove '${path}' after ${attempts} attempts (last error: ${lastErrno}).`,
  );
}
