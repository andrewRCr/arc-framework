/**
 * Portable advisory locking for critical sections that cannot use a native
 * compare-and-swap.
 *
 * An exclusive-create lockfile records the holder's pid, acquisition time, and a
 * per-acquisition token. The default PID-only mode reclaims a lock only when the
 * holder is provably abandoned. Callers spanning isolated PID namespaces may opt
 * into process-scope records and renewable leases, while a per-process instance
 * distinguishes PID reuse inside one observable scope. A live or unreadable
 * holder is waited on rather than evicted. Breaking an abandoned lock is
 * serialized by a sibling break-lock, then re-races the same exclusive create,
 * so concurrent breakers converge on one holder. Release verifies PID and token
 * ownership and never drops a same-process sibling's acquisition.
 *
 * Cross-platform: the `wx` create flag and `process.kill(pid, 0)` liveness behave
 * on Windows, WSL, and macOS.
 *
 * @module
 */

import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile as fsReadFile, unlink as fsUnlink, writeFile as fsWriteFile } from "node:fs/promises";
import { exclusiveCreateFile } from "./fs.js";

type ExclusiveCreateFn = (path: string, content: string) => Promise<void>;

/** Suffix for the serialized stale-break coordination lock. */
const BREAK_LOCK_SUFFIX = ".break";

/** Total bounded wait for a held-and-live lock before surfacing a timeout. */
const DEFAULT_MAX_WAIT_MS = 10_000;

/** Staleness TTL for the break-lock itself; the main lock is never broken by age. */
const DEFAULT_BREAK_LOCK_TTL_MS = 30_000;

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
export interface AdvisoryLockHolder {
  pid: number;
  /**
   * Acquisition time, recorded for diagnostics. The reclaim decision no longer
   * reads it (age is not a reclaim trigger); it is still required for a record to
   * parse as well-formed, so a partial or legacy lockfile reads as breakable.
   */
  acquiredAt: number;
  /**
   * Per-acquisition token, distinguishing two acquisitions that share a pid (two
   * overlapping acquisitions within one Node process). Release removes the lockfile
   * only when this matches the handle's, so a same-pid sibling never drops it.
   * Optional on read so a tokenless lockfile from an older holder still parses.
   */
  token?: string;
  /** Caller-owned diagnostics carried opaquely for contending processes. */
  metadata?: unknown;
  /** Optional renewable-lease deadline for holders not observable through a shared PID namespace. */
  leaseUntil?: number;
  /** Caller-supplied process-visibility scope, such as a Linux PID namespace. */
  processScope?: string;
  /** Per-process token distinguishing PID reuse without weakening same-process sibling safety. */
  processInstance?: string;
}

/** One observation of a live or unreadable holder while waiting for a lock. */
export interface AdvisoryLockContention {
  readonly holder: AdvisoryLockHolder | "unreadable";
  readonly waitedMs: number;
}

/** A handle to an acquired lock, passed to {@link releaseAdvisoryLock}. */
export interface AdvisoryLockHandle {
  /** Absolute path to the lockfile. */
  readonly path: string;
  /** The acquirer's pid — release compares this against the on-disk holder. */
  readonly pid: number;
  /** The acquirer's per-acquisition token — release requires it to match the holder. */
  readonly token: string;
  /** Initial renewable-lease deadline, when acquisition uses a lease. */
  readonly leaseUntil?: number;
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
  /** Opaque caller diagnostics persisted with this holder's lock record. */
  metadata?: unknown;
  /** Optional renewable lease duration; absent preserves PID-only, never-break-by-age behavior. */
  leaseDurationMs?: number;
  /** Process-visibility scope shared by PIDs this caller can probe reliably. */
  processScope?: string;
  /** Per-process token shared by overlapping acquisitions from this exact process. */
  processInstance?: string;
  /** Observe live-holder contention without changing acquisition behavior. */
  onWait?: (contention: AdvisoryLockContention) => void;
  /** Total bounded wait in ms; defaults to {@link DEFAULT_MAX_WAIT_MS}. */
  maxWaitMs?: number;
  /** Staleness TTL for the break-lock itself; defaults to {@link DEFAULT_BREAK_LOCK_TTL_MS}. */
  breakLockTtlMs?: number;
}

/** Injectable seams for renewing an owned advisory-lock lease. */
export interface AdvisoryLockRenewOptions extends Pick<
  AdvisoryLockOptions,
  "exclusiveCreate" | "readFile" | "removeFile" | "isProcessAlive" | "now" | "sleep" | "breakLockTtlMs"
> {
  /** Lock-record writer; defaults to the real filesystem. */
  writeFile?: (path: string, content: string) => Promise<void>;
}

/** Outcome of one renewable-lease heartbeat attempt. */
export type AdvisoryLockRenewalResult = "renewed" | "ownership-lost" | "retry";

/** Injectable seams and wait tuning for releasing an owned advisory lock. */
export type AdvisoryLockReleaseOptions = Pick<
  AdvisoryLockOptions,
  "exclusiveCreate" | "readFile" | "removeFile" | "isProcessAlive" | "now" | "sleep" | "maxWaitMs"
  | "breakLockTtlMs"
>;

/** Thrown when acquisition or release cannot obtain its required lock within the bounded wait. */
export class AdvisoryLockTimeoutError extends Error {
  constructor(
    public readonly lockPath: string,
    public readonly waitedMs: number,
    public readonly phase: "acquire" | "release" = "acquire",
  ) {
    super(`Timed out after ${waitedMs}ms waiting for advisory lock: ${lockPath}`);
    this.name = "AdvisoryLockTimeoutError";
  }
}

/**
 * Acquire the advisory lock at `lockPath`, blocking (with bounded backoff) until
 * it is held, reclaimed-as-stale, or the wait times out.
 *
 * Concurrent first-callers race an exclusive create; exactly one wins and the
 * rest contend. A contender reclaims the current holder only when it is provably
 * abandoned — a dead recorded pid, a malformed lockfile, a demonstrably reused
 * same-scope PID, or an expired renewable lease from another process-visibility
 * scope. An observed-empty lockfile is re-read briefly before being judged an
 * abandoned husk, so the winner's create-before-write window does not invite a
 * contender to break a freshly-taken lock. The whole loop — break, back-off, and
 * re-race alike — is bounded by a single wait deadline, so a lock that cannot be
 * acquired surfaces a timeout rather than spinning.
 *
 * @param lockPath - Absolute path of the advisory lockfile.
 * @param options - Optional I/O seams, holder data, lease policy, and wait tuning.
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
  const metadata = options.metadata;
  const leaseDurationMs = options.leaseDurationMs;
  const processScope = options.processScope;
  const processInstance = options.processInstance;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const breakLockTtlMs = options.breakLockTtlMs ?? DEFAULT_BREAK_LOCK_TTL_MS;
  const breakLockPath = `${lockPath}${BREAK_LOCK_SUFFIX}`;

  const waitStartedAt = now();
  const deadline = waitStartedAt + maxWaitMs;
  let backoff = BACKOFF_INITIAL_MS;

  for (;;) {
    // One deadline guards every contention path — break, back-off, and the
    // re-race after a freed/broken lock alike — so an unclearable lockfile times
    // out instead of spinning. The first iteration is always within the wait.
    const observedAt = now();
    if (observedAt >= deadline) {
      throw new AdvisoryLockTimeoutError(lockPath, maxWaitMs);
    }

    try {
      const acquiredAt = now();
      await exclusiveCreate(lockPath, JSON.stringify({
        pid,
        acquiredAt,
        token,
        metadata,
        ...(leaseDurationMs === undefined ? {} : { leaseUntil: acquiredAt + leaseDurationMs }),
        ...(processScope === undefined ? {} : { processScope }),
        ...(processInstance === undefined ? {} : { processInstance }),
      }));
      return {
        path: lockPath,
        pid,
        token,
        ...(leaseDurationMs === undefined ? {} : { leaseUntil: acquiredAt + leaseDurationMs }),
      };
    } catch (err) {
      if (!isEexistError(err)) throw err;
    }

    const holder = await readHolderSettled(readFile, sleep, lockPath);
    if (holder === "absent") {
      // Freed between our failed create and the read — retry the create at once.
      continue;
    }

    // Reclaim only a holder we can prove is gone: a malformed lockfile (no live
    // writer it could represent), a recorded pid that is no longer alive inside
    // the same observable process scope, or an expired opt-in lease from a
    // different process scope. A live same-scope holder — or one whose lockfile is momentarily unreadable (a transient
    // EACCES/EBUSY rather than an absent file) — is never broken; we wait, and the
    // deadline above surfaces a timeout instead of risking eviction of a process
    // still in the critical section. Age alone remains irrelevant without an
    // explicit cross-scope lease. The re-race of the create at the top of the loop — not
    // the remove — is what makes concurrent breakers converge on one holder.
    const breakable = isMainLockBreakable(holder, isProcessAlive, now, processScope, pid, processInstance);
    if (breakable) {
      await attemptSerializedBreak({
        lockPath,
        breakLockPath,
        observedHolder: holder,
        exclusiveCreate,
        readFile,
        removeFile,
        isProcessAlive,
        now,
        sleep,
        pid,
        token,
        breakLockTtlMs,
        processScope,
        processInstance,
      });
    } else {
      options.onWait?.({ holder, waitedMs: Math.max(0, observedAt - waitStartedAt) });
    }

    await sleep(backoff);
    backoff = Math.min(backoff * 2, BACKOFF_CAP_MS);
  }
}

/** Run an operation while holding an advisory lock and release it before returning.
 * @param lockPath - Absolute path of the lock guarding the operation.
 * @param operation - Critical section receiving its held lock path.
 * @param options - Optional filesystem, clock and bounded-wait dependencies.
 * @returns The critical section's result after release succeeds.
 * @throws Acquisition, operation or release errors; simultaneous operation/release errors are aggregated.
 */
export async function withAdvisoryLock<T>(
  lockPath: string,
  operation: (lockPath: string) => Promise<T>,
  options: AdvisoryLockOptions = {},
): Promise<T> {
  const handle = await acquireAdvisoryLock(lockPath, options);
  let result: { readonly kind: "success"; readonly value: T } | { readonly kind: "failure"; readonly error: unknown };
  try {
    result = { kind: "success", value: await operation(lockPath) };
  } catch (error) {
    result = { kind: "failure", error };
  }

  let releaseError: unknown;
  try {
    await releaseAdvisoryLock(handle, options);
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

/**
 * Extend the deadline of an owned renewable lease.
 *
 * Renewal and stale reclamation take the same sibling break-lock. Whichever
 * operation wins rechecks the main holder while serialized: a timely renewal
 * cannot be removed by a stale observation, and a holder that already lost
 * ownership cannot overwrite its replacement.
 *
 * @param handle - The acquisition whose lease should be renewed.
 * @param leaseDurationMs - New duration measured from the renewal clock.
 * @param options - Injectable filesystem, liveness, and clock seams.
 * @returns Whether the lease renewed, ownership is confirmed lost, or transient contention should retry.
 */
export async function renewAdvisoryLock(
  handle: AdvisoryLockHandle,
  leaseDurationMs: number,
  options: AdvisoryLockRenewOptions = {},
): Promise<AdvisoryLockRenewalResult> {
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error("Advisory-lock lease duration must be a positive finite number");
  }

  const exclusiveCreate = options.exclusiveCreate ?? exclusiveCreateFile;
  const readFile = options.readFile ?? defaultReadFile;
  const writeFile = options.writeFile ?? defaultWriteFile;
  const removeFile = options.removeFile ?? defaultRemoveFile;
  const isProcessAlive = options.isProcessAlive ?? realProcessAlive;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const breakLockTtlMs = options.breakLockTtlMs ?? DEFAULT_BREAK_LOCK_TTL_MS;
  const currentHolder = await readHolderSettled(readFile, sleep, handle.path);
  const currentOwnership = classifyRenewalOwnership(currentHolder, handle);
  if (currentOwnership.state !== "owned") return currentOwnership.state;
  const ownedHolder = currentOwnership.holder;

  const context: SerializedBreakContext = {
    lockPath: handle.path,
    breakLockPath: `${handle.path}${BREAK_LOCK_SUFFIX}`,
    observedHolder: ownedHolder,
    exclusiveCreate,
    readFile,
    removeFile,
    isProcessAlive,
    now,
    sleep,
    pid: handle.pid,
    token: handle.token,
    breakLockTtlMs,
    processScope: ownedHolder.processScope,
    processInstance: ownedHolder.processInstance,
  };
  const breakHandle = await tryAcquireBreakLock(context);
  if (breakHandle === null) return "retry";

  try {
    const latestHolder = await readHolderSettled(readFile, sleep, handle.path);
    const latestOwnership = classifyRenewalOwnership(latestHolder, handle);
    if (latestOwnership.state !== "owned") return latestOwnership.state;
    await writeFile(handle.path, JSON.stringify({
      ...latestOwnership.holder,
      leaseUntil: now() + leaseDurationMs,
    }));
    return "renewed";
  } finally {
    await releaseOwnedLockDirect(breakHandle, readFile, removeFile, false);
  }
}

function classifyRenewalOwnership(
  holder: AdvisoryLockHolder | "absent" | "corrupt" | "unreadable",
  handle: AdvisoryLockHandle,
):
  | { readonly state: "owned"; readonly holder: AdvisoryLockHolder }
  | { readonly state: Exclude<AdvisoryLockRenewalResult, "renewed"> } {
  if (typeof holder === "object" && holder.pid === handle.pid && holder.token === handle.token) {
    return { state: "owned", holder };
  }
  if (holder === "corrupt" || holder === "unreadable") return { state: "retry" };
  return { state: "ownership-lost" };
}

interface SerializedBreakContext {
  lockPath: string;
  breakLockPath: string;
  observedHolder: AdvisoryLockHolder | "corrupt";
  exclusiveCreate: ExclusiveCreateFn;
  readFile: (path: string) => Promise<string>;
  removeFile: (path: string) => Promise<void>;
  isProcessAlive: IsProcessAliveFn;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  pid: number;
  token: string;
  breakLockTtlMs: number;
  processScope?: string;
  processInstance?: string;
}

async function attemptSerializedBreak(context: SerializedBreakContext): Promise<void> {
  const breakHandle = await tryAcquireBreakLock(context);
  if (!breakHandle) return;

  try {
    const currentHolder = await readHolderSettled(context.readFile, context.sleep, context.lockPath);
    if (
      isSameBreakTarget(context.observedHolder, currentHolder)
      && isMainLockBreakable(
        currentHolder,
        context.isProcessAlive,
        context.now,
        context.processScope,
        context.pid,
        context.processInstance,
      )
    ) {
      await tolerantRemove(context.removeFile, context.lockPath);
    }
  } finally {
    await releaseOwnedLockDirect(breakHandle, context.readFile, context.removeFile, false);
  }
}

type BreakLockContext = Pick<
  SerializedBreakContext,
  | "breakLockPath"
  | "exclusiveCreate"
  | "readFile"
  | "removeFile"
  | "isProcessAlive"
  | "now"
  | "sleep"
  | "pid"
  | "token"
  | "breakLockTtlMs"
>;

async function tryAcquireBreakLock(context: BreakLockContext): Promise<AdvisoryLockHandle | null> {
  const breakToken = `${context.token}:break`;
  try {
    await context.exclusiveCreate(
      context.breakLockPath,
      JSON.stringify({ pid: context.pid, acquiredAt: context.now(), token: breakToken }),
    );
    return { path: context.breakLockPath, pid: context.pid, token: breakToken };
  } catch (err) {
    if (!isEexistError(err)) throw err;
  }

  const holder = await readHolderSettled(context.readFile, context.sleep, context.breakLockPath);
  if (isBreakLockBreakable(holder, context.isProcessAlive, context.now, context.breakLockTtlMs)) {
    await tolerantRemove(context.removeFile, context.breakLockPath);
  }
  return null;
}

async function acquireBreakLockForRelease(
  lockPath: string,
  context: BreakLockContext,
  maxWaitMs: number,
): Promise<AdvisoryLockHandle> {
  const waitStartedAt = context.now();
  const deadline = waitStartedAt + maxWaitMs;
  let backoff = BACKOFF_INITIAL_MS;

  for (;;) {
    const handle = await tryAcquireBreakLock(context);
    if (handle !== null) return handle;
    if (context.now() >= deadline) {
      throw new AdvisoryLockTimeoutError(lockPath, maxWaitMs, "release");
    }
    await context.sleep(backoff);
    backoff = Math.min(backoff * 2, BACKOFF_CAP_MS);
  }
}

function isMainLockBreakable(
  holder: AdvisoryLockHolder | "absent" | "corrupt" | "unreadable",
  isProcessAlive: IsProcessAliveFn,
  now: () => number,
  processScope: string | undefined,
  pid: number,
  processInstance: string | undefined,
): holder is AdvisoryLockHolder | "corrupt" {
  if (holder === "corrupt") return true;
  if (holder === "absent" || holder === "unreadable") return false;
  const distinctProcessScopes = holder.processScope !== undefined
    && processScope !== undefined
    && holder.processScope !== processScope;
  if (distinctProcessScopes) return holder.leaseUntil !== undefined && now() >= holder.leaseUntil;
  if (
    holder.pid === pid
    && holder.processInstance !== undefined
    && processInstance !== undefined
    && holder.processInstance !== processInstance
  ) {
    return true;
  }
  return !isProcessAlive(holder.pid);
}

function isBreakLockBreakable(
  holder: AdvisoryLockHolder | "absent" | "corrupt" | "unreadable",
  isProcessAlive: IsProcessAliveFn,
  now: () => number,
  ttlMs: number,
): boolean {
  if (holder === "absent" || holder === "unreadable") return false;
  if (holder === "corrupt") return true;
  return !isProcessAlive(holder.pid) || now() - holder.acquiredAt >= ttlMs;
}

function isSameBreakTarget(
  observed: AdvisoryLockHolder | "corrupt",
  current: AdvisoryLockHolder | "absent" | "corrupt" | "unreadable",
): boolean {
  if (observed === "corrupt") return current === "corrupt";
  if (current === "absent" || current === "corrupt" || current === "unreadable") return false;
  return (
    observed.pid === current.pid
    && observed.acquiredAt === current.acquiredAt
    && observed.token === current.token
    && observed.leaseUntil === current.leaseUntil
    && observed.processScope === current.processScope
    && observed.processInstance === current.processInstance
  );
}

function isReleasableHolder(
  holder: AdvisoryLockHolder | "absent" | "corrupt" | "empty" | "unreadable",
  handle: AdvisoryLockHandle,
  allowTokenless: boolean,
): holder is AdvisoryLockHolder {
  return typeof holder === "object"
    && holder.pid === handle.pid
    && (holder.token === undefined ? allowTokenless : holder.token === handle.token);
}

/**
 * Release a lock acquired via {@link acquireAdvisoryLock}.
 *
 * Verifies ownership first — the on-disk holder's pid and token must match the
 * handle's — so a lock that was reclaimed as stale and re-acquired by another
 * process, or re-taken by a same-pid sibling, is never dropped. A missing, empty,
 * or unverifiable lockfile is left untouched.
 *
 * @param handle - The acquisition to release if it still owns the lockfile.
 * @param options - Optional filesystem seams used for ownership verification and removal.
 */
export async function releaseAdvisoryLock(
  handle: AdvisoryLockHandle,
  options: AdvisoryLockReleaseOptions = {},
): Promise<void> {
  const exclusiveCreate = options.exclusiveCreate ?? exclusiveCreateFile;
  const readFile = options.readFile ?? defaultReadFile;
  const removeFile = options.removeFile ?? defaultRemoveFile;
  const isProcessAlive = options.isProcessAlive ?? realProcessAlive;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const breakLockTtlMs = options.breakLockTtlMs ?? DEFAULT_BREAK_LOCK_TTL_MS;
  const breakLockPath = `${handle.path}${BREAK_LOCK_SUFFIX}`;
  const observedHolder = await readHolder(readFile, handle.path);
  if (!isReleasableHolder(observedHolder, handle, true)) return;
  const breakHandle = await acquireBreakLockForRelease(handle.path, {
    breakLockPath,
    exclusiveCreate,
    readFile,
    removeFile,
    isProcessAlive,
    now,
    sleep,
    pid: handle.pid,
    token: handle.token,
    breakLockTtlMs,
  }, maxWaitMs);

  try {
    await releaseOwnedLockDirect(handle, readFile, removeFile, true);
  } finally {
    await releaseOwnedLockDirect(breakHandle, readFile, removeFile, false);
  }
}

/**
 * Release ownership and require observable absence or replacement before returning.
 * @param handle - The exact acquired owner
 * @param options - Filesystem and waiting boundaries used by native release
 * @returns Only after this owner no longer holds the lockfile
 */
export async function releaseAdvisoryLockConfirmed(
  handle: AdvisoryLockHandle, options: AdvisoryLockReleaseOptions = {},
): Promise<void> {
  await releaseAdvisoryLock(handle, options);
  const holder = await readHolder(options.readFile ?? defaultReadFile, handle.path);
  if (holder === "absent" || typeof holder === "object" && !isReleasableHolder(holder, handle, true)) return;
  throw new Error(`Unable to confirm release of lock ${handle.path}; repair filesystem access and rerun the operation.`);
}

/**
 * Best-effort token-verified release for a process `exit` listener.
 *
 * Async cleanup cannot run once Node enters its exit event. This narrow sibling
 * uses synchronous filesystem calls and never throws; an absent, malformed, or
 * replaced holder remains untouched.
 *
 * @param handle - The acquisition to release if it still owns the lockfile.
 */
export function releaseAdvisoryLockSync(handle: AdvisoryLockHandle): void {
  const breakHandle = {
    path: `${handle.path}${BREAK_LOCK_SUFFIX}`,
    pid: handle.pid,
    token: `${handle.token}:break`,
  };
  try {
    writeFileSync(
      breakHandle.path,
      JSON.stringify({ pid: breakHandle.pid, acquiredAt: Date.now(), token: breakHandle.token }),
      { encoding: "utf-8", flag: "wx" },
    );
  } catch {
    return;
  }

  try {
    releaseOwnedLockSyncDirect(handle, false);
  } finally {
    releaseOwnedLockSyncDirect(breakHandle, false);
  }
}

async function releaseOwnedLockDirect(
  handle: AdvisoryLockHandle,
  readFile: (path: string) => Promise<string>,
  removeFile: (path: string) => Promise<void>,
  allowTokenless: boolean,
): Promise<void> {
  const holder = await readHolder(readFile, handle.path);
  if (!isReleasableHolder(holder, handle, allowTokenless)) return;
  await tolerantRemove(removeFile, handle.path);
}

function releaseOwnedLockSyncDirect(handle: AdvisoryLockHandle, allowTokenless: boolean): void {
  try {
    const parsed: unknown = JSON.parse(readFileSync(handle.path, "utf-8"));
    if (typeof parsed !== "object" || parsed === null) return;
    const pid = (parsed as { pid?: unknown }).pid;
    const token = (parsed as { token?: unknown }).token;
    if (pid !== handle.pid) return;
    if (token === undefined ? !allowTokenless : token !== handle.token) return;
    unlinkSync(handle.path);
  } catch {
    // Process-exit cleanup is best effort; lease expiry remains the crash backstop.
  }
}

/**
 * Read and parse the current holder from a lockfile.
 *
 * @returns the parsed holder; `"absent"` when the file does not exist; `"empty"`
 *   when present but blank (the holder's create-before-write window — re-read
 *   before judging); `"unreadable"` when the read itself fails for a reason other
 *   than absence (a transient EACCES/EBUSY — waited on, never broken); `"corrupt"`
 *   when present and non-blank but malformed (treated as breakable).
 */
async function readHolder(
  readFile: (path: string) => Promise<string>,
  lockPath: string,
): Promise<AdvisoryLockHolder | "absent" | "corrupt" | "empty" | "unreadable"> {
  let raw: string;
  try {
    raw = await readFile(lockPath);
  } catch (err) {
    return isEnoentError(err) ? "absent" : "unreadable";
  }
  if (raw.trim().length === 0) return "empty";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const pidValue = (parsed as { pid?: unknown }).pid;
      const acquiredAtValue = (parsed as { acquiredAt?: unknown }).acquiredAt;
      const tokenValue = (parsed as { token?: unknown }).token;
      const metadataValue = (parsed as { metadata?: unknown }).metadata;
      const leaseUntilValue = (parsed as { leaseUntil?: unknown }).leaseUntil;
      const processScopeValue = (parsed as { processScope?: unknown }).processScope;
      const processInstanceValue = (parsed as { processInstance?: unknown }).processInstance;
      // A holder pid must be a real OS pid — a positive safe integer. Rejecting 0,
      // negatives, NaN, fractions, and unsafe integers keeps a corrupted record from
      // reading as a live holder (and from reaching process.kill(pid, 0) as garbage).
      if (
        typeof pidValue === "number"
        && Number.isSafeInteger(pidValue)
        && pidValue > 0
        && typeof acquiredAtValue === "number"
      ) {
        return {
          pid: pidValue,
          acquiredAt: acquiredAtValue,
          ...(typeof tokenValue === "string" ? { token: tokenValue } : {}),
          ...(metadataValue === undefined ? {} : { metadata: metadataValue }),
          ...(typeof leaseUntilValue === "number" && Number.isFinite(leaseUntilValue)
            ? { leaseUntil: leaseUntilValue }
            : {}),
          ...(typeof processScopeValue === "string" ? { processScope: processScopeValue } : {}),
          ...(typeof processInstanceValue === "string" ? { processInstance: processInstanceValue } : {}),
        };
      }
    }
  } catch {
    // fall through to corrupt
  }
  return "corrupt";
}

/**
 * Read the holder, tolerating the winner's create-before-write window. The lock is
 * created (`exclusiveCreateFile`, `wx`) before its JSON body is fully written, so a
 * contender can observe it blank (`empty`) or mid-write (`corrupt`). Both are
 * re-read a bounded number of times before the file is declared `corrupt` (an
 * abandoned husk, breakable) — so a partially-written live holder is never broken
 * mid-write, while a genuinely abandoned husk stays corrupt across the retries. A
 * settled result — a parsed holder, `absent`, or `unreadable` — returns at once.
 * The injected `sleep` keeps the read-back deterministic under test.
 */
async function readHolderSettled(
  readFile: (path: string) => Promise<string>,
  sleep: (ms: number) => Promise<void>,
  lockPath: string,
): Promise<AdvisoryLockHolder | "absent" | "corrupt" | "unreadable"> {
  for (let attempt = 0; attempt < EMPTY_READBACK_ATTEMPTS; attempt++) {
    const holder = await readHolder(readFile, lockPath);
    if (holder !== "empty" && holder !== "corrupt") return holder;
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

function defaultWriteFile(path: string, content: string): Promise<void> {
  return fsWriteFile(path, content, "utf-8");
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
