/**
 * Portable per-identity advisory lock — serializes a critical section across
 * concurrent same-machine processes that cannot take a compare-and-swap.
 *
 * The `git notes add` write that backs `runUserSave` does its own unguarded
 * read-modify-write on the notes tree with no old-value protection, so two
 * racing same-identity saves silently collapse to one note. This lock is the
 * serialization that closes that race: an exclusive-create lockfile (the same
 * `O_EXCL` primitive the machine-id store rests on) under
 * `user/{identity}/.internal/`, recording the holder's pid and acquisition
 * time. A stale lock — left by a crashed or hung holder — is reclaimed by a
 * pid-liveness check (`process.kill(pid, 0)`), with a generous mtime ceiling as
 * the pid-reuse backstop. Breaking a stale lock re-races the same exclusive
 * create, so concurrent breakers converge on one holder; release verifies
 * ownership so it never drops another holder's lock.
 *
 * Cross-platform: the `wx` create flag and `process.kill(pid, 0)` liveness
 * behave on Windows / WSL / Mac.
 *
 * @module
 */

import { readFile as fsReadFile, unlink as fsUnlink } from "node:fs/promises";
import { join } from "node:path";

import { exclusiveCreateFile } from "../fs.js";

import { getUserInternalDir, type ExclusiveCreateFn } from "./sync-state.js";

/** Notes write lockfile name under `user/{identity}/.internal/`. */
const NOTES_LOCK_FILENAME = ".notes.lock";

/**
 * Generous staleness ceiling. A held lock older than this is reclaimed even if
 * its pid still looks alive (the pid-reuse / cross-platform-liveness backstop).
 * Far longer than any real notes write, which is a cold, human-invoked path.
 */
const DEFAULT_STALE_CEILING_MS = 60_000;

/** Total bounded wait for a held-and-live lock before surfacing a timeout. */
const DEFAULT_MAX_WAIT_MS = 10_000;

/** Backoff schedule for the held-and-live retry: starts small, doubles to a cap. */
const BACKOFF_INITIAL_MS = 10;
const BACKOFF_CAP_MS = 250;

/** A held lock's recorded acquirer — the lockfile's parsed content. */
interface LockHolder {
  pid: number;
  acquiredAt: number;
}

/** A handle to an acquired lock, passed to {@link releaseAdvisoryLock}. */
export interface AdvisoryLockHandle {
  /** Absolute path to the lockfile. */
  readonly path: string;
  /** The acquirer's pid — release compares this against the on-disk holder. */
  readonly pid: number;
}

/** Liveness probe: whether a process with this pid is currently running. */
export type IsProcessAliveFn = (pid: number) => boolean;

/**
 * Injectable seams and tuning for {@link acquireAdvisoryLock} /
 * {@link releaseAdvisoryLock}. Every field defaults to the real
 * filesystem / process / clock; tests override them for determinism.
 */
export interface AdvisoryLockOptions {
  /** Exclusive-create primitive; defaults to the real `O_EXCL` create. */
  exclusiveCreate?: ExclusiveCreateFn;
  /** Lockfile reader; defaults to the real filesystem read. */
  readFile?: (path: string) => Promise<string>;
  /** Lockfile remover; defaults to the real filesystem unlink. */
  removeFile?: (path: string) => Promise<void>;
  /** Process-liveness probe; defaults to a real `process.kill(pid, 0)` check. */
  isProcessAlive?: IsProcessAliveFn;
  /** Monotonic-enough clock in ms; defaults to {@link Date.now}. */
  now?: () => number;
  /** Backoff sleeper; defaults to a real `setTimeout`-backed delay. */
  sleep?: (ms: number) => Promise<void>;
  /** This acquirer's pid; defaults to {@link process.pid}. */
  pid?: number;
  /** Staleness ceiling in ms; defaults to {@link DEFAULT_STALE_CEILING_MS}. */
  staleCeilingMs?: number;
  /** Total bounded wait in ms; defaults to {@link DEFAULT_MAX_WAIT_MS}. */
  maxWaitMs?: number;
}

/** Thrown when a held-and-live lock could not be acquired within the bounded wait. */
export class AdvisoryLockTimeoutError extends Error {
  constructor(
    public readonly lockPath: string,
    public readonly waitedMs: number,
  ) {
    super(`Timed out after ${waitedMs}ms waiting for advisory lock: ${lockPath}`);
    this.name = "AdvisoryLockTimeoutError";
  }
}

/** Absolute path to the notes-write lockfile for an identity. */
export function getNotesLockPath(cwd: string, identity: string): string {
  return join(getUserInternalDir(cwd, identity), NOTES_LOCK_FILENAME);
}

/**
 * Acquire the advisory lock at `lockPath`, blocking (with bounded backoff) until
 * it is held, reclaimed-as-stale, or the wait times out.
 *
 * Concurrent first-callers race an exclusive create; exactly one wins and the
 * rest contend. A contender inspects the current holder: if its pid is dead, or
 * the lock is older than the stale ceiling, it removes the lockfile and re-races
 * the create (so concurrent breakers still converge on one holder); otherwise it
 * backs off and retries until the holder frees the lock or the bounded wait is
 * exhausted.
 *
 * @returns A handle to pass to {@link releaseAdvisoryLock}.
 * @throws {AdvisoryLockTimeoutError} when a held-and-live lock outlasts the wait.
 */
export async function acquireAdvisoryLock(
  lockPath: string,
  options: AdvisoryLockOptions = {},
): Promise<AdvisoryLockHandle> {
  const exclusiveCreate = options.exclusiveCreate ?? exclusiveCreateFile;
  const readFile = options.readFile ?? defaultReadFile;
  const removeFile = options.removeFile ?? defaultRemoveFile;
  const isProcessAlive = options.isProcessAlive ?? realProcessAlive;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const pid = options.pid ?? process.pid;
  const staleCeilingMs = options.staleCeilingMs ?? DEFAULT_STALE_CEILING_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;

  const deadline = now() + maxWaitMs;
  let backoff = BACKOFF_INITIAL_MS;

  for (;;) {
    try {
      await exclusiveCreate(lockPath, JSON.stringify({ pid, acquiredAt: now() }));
      return { path: lockPath, pid };
    } catch (err) {
      if (!isEexistError(err)) throw err;
    }

    const holder = await readHolder(readFile, lockPath);
    if (holder === "absent") {
      // Freed between our failed create and the read — retry the create at once.
      continue;
    }

    const stale =
      holder === "corrupt"
      || !isProcessAlive(holder.pid)
      || now() - holder.acquiredAt > staleCeilingMs;
    if (stale) {
      // Re-race the exclusive create rather than trust the remove: that, not the
      // remove, is what makes concurrent breakers converge on a single holder.
      await tolerantRemove(removeFile, lockPath);
      continue;
    }

    if (now() >= deadline) {
      throw new AdvisoryLockTimeoutError(lockPath, maxWaitMs);
    }
    await sleep(backoff);
    backoff = Math.min(backoff * 2, BACKOFF_CAP_MS);
  }
}

/**
 * Release a lock acquired via {@link acquireAdvisoryLock}.
 *
 * Verifies ownership first — the on-disk holder's pid must match the handle's —
 * so a lock that was reclaimed as stale and re-acquired by another process is
 * never dropped. A missing or unverifiable lockfile is left untouched.
 */
export async function releaseAdvisoryLock(
  handle: AdvisoryLockHandle,
  options: Pick<AdvisoryLockOptions, "readFile" | "removeFile"> = {},
): Promise<void> {
  const readFile = options.readFile ?? defaultReadFile;
  const removeFile = options.removeFile ?? defaultRemoveFile;

  const holder = await readHolder(readFile, handle.path);
  if (holder === "absent" || holder === "corrupt") return;
  if (holder.pid !== handle.pid) return;
  await tolerantRemove(removeFile, handle.path);
}

/**
 * Read and parse the current holder from a lockfile.
 *
 * @returns the parsed holder; `"absent"` when the file does not exist;
 *   `"corrupt"` when present but unreadable or malformed (treated as breakable).
 */
async function readHolder(
  readFile: (path: string) => Promise<string>,
  lockPath: string,
): Promise<LockHolder | "absent" | "corrupt"> {
  let raw: string;
  try {
    raw = await readFile(lockPath);
  } catch (err) {
    return isEnoentError(err) ? "absent" : "corrupt";
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object"
      && parsed !== null
      && typeof (parsed as { pid?: unknown }).pid === "number"
      && typeof (parsed as { acquiredAt?: unknown }).acquiredAt === "number"
    ) {
      const record = parsed as LockHolder;
      return { pid: record.pid, acquiredAt: record.acquiredAt };
    }
  } catch {
    // fall through to corrupt
  }
  return "corrupt";
}

/** Remove a lockfile best-effort, swallowing an already-gone (or unremovable) file. */
async function tolerantRemove(
  removeFile: (path: string) => Promise<void>,
  lockPath: string,
): Promise<void> {
  try {
    await removeFile(lockPath);
  } catch {
    // A concurrent breaker may have removed it first; best-effort either way.
  }
}

/** Real process-liveness via the no-op signal. `EPERM` means alive-but-not-ours. */
function realProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function defaultReadFile(path: string): Promise<string> {
  return fsReadFile(path, "utf-8");
}

function defaultRemoveFile(path: string): Promise<void> {
  return fsUnlink(path);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEexistError(err: unknown): boolean {
  return isErrnoCode(err, "EEXIST");
}

function isEnoentError(err: unknown): boolean {
  return isErrnoCode(err, "ENOENT");
}

function isErrnoCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object"
    && err !== null
    && (err as { code?: unknown }).code === code
  );
}
