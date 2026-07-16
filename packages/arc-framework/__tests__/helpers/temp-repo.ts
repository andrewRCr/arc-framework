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

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

/** Removal function used by {@link removeGitBackedDirs}. */
export type GitBackedDirRemover = (path: string) => Promise<void>;

/**
 * Remove multiple git-backed directories, attempting every path before
 * propagating the first teardown failure.
 *
 * @param paths - Absolute paths to remove.
 * @param remove - Removal implementation; injectable for deterministic tests.
 * @throws The first removal failure after every path has been attempted.
 */
export async function removeGitBackedDirs(
  paths: readonly string[],
  remove: GitBackedDirRemover = removeGitBackedDir,
): Promise<void> {
  const results = await Promise.allSettled(paths.map((path) => remove(path)));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

/** Options for the shared temp-repo factory core. */
export interface CreateTempRepoOptions {
  /** Temp directory name prefix (tier personality). */
  prefix?: string;
  /**
   * When provided, sets `arc.identity` on the repo so `arc init --yes` skips
   * the interactive identity prompt. E2E fixtures pre-set `"test-user"`;
   * integration fixtures omit it.
   */
  identity?: string;
}

/**
 * Initialize a temp git repo carrying the invariants that must not drift
 * between the integration and e2e factory fronts.
 *
 * Pins the initial branch to `main` (matching the configured `branch.base`
 * rather than the ambient `init.defaultBranch`, so a runner defaulting to
 * `master` doesn't mismatch the base and resolve a `relocate` write-context),
 * disables background auto-gc (its repacking races temp-repo teardown), and
 * sets a test git user. Tier-specific personality (prefix, pre-set identity)
 * layers via {@link CreateTempRepoOptions}.
 *
 * @param options - Prefix and optional pre-set identity (see {@link CreateTempRepoOptions}).
 * @returns Absolute path to the initialized temp repo. Caller owns teardown via {@link removeGitBackedDir}.
 */
export async function createTempRepoCore(options: CreateTempRepoOptions = {}): Promise<string> {
  const { prefix = "arc-test-", identity } = options;
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    await execFileAsync("git", ["init", "-b", "main", dir]);
    await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: dir });
    await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: dir });
    if (identity !== undefined) {
      await execFileAsync("git", ["config", "arc.identity", identity], { cwd: dir });
    }
    return dir;
  } catch (error) {
    try {
      await removeGitBackedDir(dir);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Failed to initialize and clean up temporary repository '${dir}'.`,
        { cause: cleanupError },
      );
    }
    throw error;
  }
}
