/**
 * Portable per-identity advisory lock — serializes a critical section across
 * concurrent same-machine processes that cannot take a compare-and-swap.
 *
 * The `git notes add` write that backs `runUserSave` does its own unguarded
 * read-modify-write on the notes tree with no old-value protection, so two
 * racing same-identity saves silently collapse to one note. This lock is the
 * serialization that closes that race: an exclusive-create lockfile (the same
 * `O_EXCL` primitive the machine-id store rests on) under
 * `user/{identity}/.internal/`, recording the holder's pid, acquisition time,
 * and a per-acquisition token. A stale lock — left by a crashed or hung holder —
 * is reclaimed by a pid-liveness check (`process.kill(pid, 0)`), with a generous
 * age ceiling as the pid-reuse backstop. Breaking a stale lock re-races the same
 * exclusive create, so concurrent breakers converge on one holder; release
 * verifies ownership — pid and token — so it never drops another holder's lock,
 * including a same-pid sibling's. Every contention path is bounded by one wait
 * deadline, so a lock that can never be cleared times out rather than spinning
 * forever.
 *
 * Cross-platform: the `wx` create flag and `process.kill(pid, 0)` liveness
 * behave on Windows / WSL / Mac.
 *
 * @module
 */

import { randomUUID } from "node:crypto";
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

/**
 * Read-back budget for an observed-empty lockfile. The winner's exclusive create
 * (`O_CREAT | O_EXCL`) precedes its content write by a narrow window, so a
 * contender can read the file after creation but before the holder record lands.
 * Treating that transient empty as immediately breakable would let a contender
 * reclaim a lock another caller legitimately just took; re-read briefly before
 * concluding the empty file is an abandoned husk. Mirrors the machine-id store's
 * lost-race read-back (50 × 2ms ≈ 100ms).
 */
const EMPTY_READBACK_ATTEMPTS = 50;
const EMPTY_READBACK_DELAY_MS = 2;

/** A held lock's recorded acquirer — the lockfile's parsed content. */
interface LockHolder {
  pid: number;
  acquiredAt: number;
  /**
   * Per-acquisition token, distinguishing two acquisitions that share a pid (two
   * overlapping acquisitions within one Node process). Release removes the lockfile
   * only when this matches the handle's, so a same-pid sibling never drops it.
   * Optional on read so a tokenless lockfile from an older holder still parses.
   */
  token?: string;
}

/** A handle to an acquired lock, passed to {@link releaseAdvisoryLock}. */
export interface AdvisoryLockHandle {
  /** Absolute path to the lockfile. */
  readonly path: string;
  /** The acquirer's pid — release compares this against the on-disk holder. */
  readonly pid: number;
  /** The acquirer's per-acquisition token — release requires it to match the holder. */
  readonly token: string;
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
  /** This acquirer's token; defaults to a fresh {@link randomUUID}. Injectable for deterministic tests. */
  token?: string;
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
 * the lock is older than the stale ceiling, it removes the lockfile (and re-races
 * the create, so concurrent breakers still converge on one holder); otherwise it
 * backs off and retries. An observed-empty lockfile is re-read briefly before
 * being judged an abandoned husk, so the winner's create-before-write window does
 * not invite a contender to break a freshly-taken lock. The whole loop — break,
 * back-off, and re-race alike — is bounded by a single wait deadline, so even a
 * lockfile that can never be removed surfaces a timeout rather than spinning.
 *
 * @returns A handle to pass to {@link releaseAdvisoryLock}.
 * @throws {AdvisoryLockTimeoutError} when the lock cannot be acquired within the wait.
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
  const token = options.token ?? randomUUID();
  const staleCeilingMs = options.staleCeilingMs ?? DEFAULT_STALE_CEILING_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;

  const deadline = now() + maxWaitMs;
  let backoff = BACKOFF_INITIAL_MS;

  for (;;) {
    // One deadline guards every contention path — break, back-off, and the
    // re-race after a freed/broken lock alike — so an unclearable lockfile times
    // out instead of spinning. The first iteration is always within the wait.
    if (now() >= deadline) {
      throw new AdvisoryLockTimeoutError(lockPath, maxWaitMs);
    }

    try {
      await exclusiveCreate(lockPath, JSON.stringify({ pid, acquiredAt: now(), token }));
      return { path: lockPath, pid, token };
    } catch (err) {
      if (!isEexistError(err)) throw err;
    }

    const holder = await readHolderSettled(readFile, sleep, lockPath);
    if (holder === "absent") {
      // Freed between our failed create and the read — retry the create at once.
      continue;
    }

    const stale =
      holder === "corrupt"
      || !isProcessAlive(holder.pid)
      || now() - holder.acquiredAt > staleCeilingMs;
    if (stale) {
      // Drop the husk; the re-race of the exclusive create at the top of the loop
      // — not the remove — is what makes concurrent breakers converge on one
      // holder. Back off first so a lockfile that resists removal can't busy-spin.
      await tolerantRemove(removeFile, lockPath);
    }

    await sleep(backoff);
    backoff = Math.min(backoff * 2, BACKOFF_CAP_MS);
  }
}

/**
 * Release a lock acquired via {@link acquireAdvisoryLock}.
 *
 * Verifies ownership first — the on-disk holder's pid and token must match the
 * handle's — so a lock that was reclaimed as stale and re-acquired by another
 * process, or re-taken by a same-pid sibling, is never dropped. A missing, empty,
 * or unverifiable lockfile is left untouched.
 */
export async function releaseAdvisoryLock(
  handle: AdvisoryLockHandle,
  options: Pick<AdvisoryLockOptions, "readFile" | "removeFile"> = {},
): Promise<void> {
  const readFile = options.readFile ?? defaultReadFile;
  const removeFile = options.removeFile ?? defaultRemoveFile;

  const holder = await readHolder(readFile, handle.path);
  if (holder === "absent" || holder === "corrupt" || holder === "empty") return;
  if (holder.pid !== handle.pid) return;
  // A tokenless holder (an older lockfile) falls back to the pid match above; a
  // tokened one must match exactly, so a same-pid sibling never drops our lock.
  if (holder.token !== undefined && holder.token !== handle.token) return;
  await tolerantRemove(removeFile, handle.path);
}

/**
 * Read and parse the current holder from a lockfile.
 *
 * @returns the parsed holder; `"absent"` when the file does not exist; `"empty"`
 *   when present but blank (the holder's create-before-write window — re-read
 *   before judging); `"corrupt"` when present and non-blank but unreadable or
 *   malformed (treated as breakable).
 */
async function readHolder(
  readFile: (path: string) => Promise<string>,
  lockPath: string,
): Promise<LockHolder | "absent" | "corrupt" | "empty"> {
  let raw: string;
  try {
    raw = await readFile(lockPath);
  } catch (err) {
    return isEnoentError(err) ? "absent" : "corrupt";
  }
  if (raw.trim().length === 0) return "empty";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object"
      && parsed !== null
      && typeof (parsed as { pid?: unknown }).pid === "number"
      && typeof (parsed as { acquiredAt?: unknown }).acquiredAt === "number"
    ) {
      const record = parsed as LockHolder;
      const tokenValue = (parsed as { token?: unknown }).token;
      return {
        pid: record.pid,
        acquiredAt: record.acquiredAt,
        ...(typeof tokenValue === "string" ? { token: tokenValue } : {}),
      };
    }
  } catch {
    // fall through to corrupt
  }
  return "corrupt";
}

/**
 * Read the holder, tolerating the winner's create-before-write window: an
 * observed-empty lockfile is re-read a bounded number of times before being
 * reported as `corrupt` (an abandoned husk, breakable). Any non-empty result —
 * a parsed holder, `absent`, or a genuinely `corrupt` file — returns at once. The
 * injected `sleep` keeps the read-back deterministic under test.
 */
async function readHolderSettled(
  readFile: (path: string) => Promise<string>,
  sleep: (ms: number) => Promise<void>,
  lockPath: string,
): Promise<LockHolder | "absent" | "corrupt"> {
  for (let attempt = 0; attempt < EMPTY_READBACK_ATTEMPTS; attempt++) {
    const holder = await readHolder(readFile, lockPath);
    if (holder !== "empty") return holder;
    await sleep(EMPTY_READBACK_DELAY_MS);
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
