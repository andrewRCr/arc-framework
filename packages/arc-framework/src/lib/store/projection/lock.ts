/** The projection lock: one per worktree, serializing the projection's reads and writes in it. */
import { randomBytes } from "node:crypto";
import { link, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  acquireAdvisoryLock, AdvisoryLockTimeoutError, releaseAdvisoryLockConfirmed, renewAdvisoryLock,
  type AdvisoryLockContention, type AdvisoryLockHandle, type AdvisoryLockHolder, type AdvisoryLockOptions,
} from "../../advisory-lock.js";
import { createAtomicFileCreator } from "../../fs.js";
import { NATIVE_LEASE_PROCESS, type LeaseProcessDependencies } from "../../lease-process.js";
import {
  ADVISORY_LEASE_DURATION_MS, withRenewableLease, type RenewableLeaseDependencies,
} from "../../renewable-lease.js";
import { ensureProjectionStateFolder, type ProjectionLocation } from "./location.js";

/** The lockfile's name in the state folder. */
export const PROJECTION_LOCK_FILE = "lock";

/** How long fan-out and a command's end wait for a worktree's lock before skipping it. */
export const SIBLING_LOCK_WAIT_MS = 200;

/** What the guarded operation holds: each step it takes first checks the lease still holds. */
export interface ProjectionLockSession {
  readonly step: () => Promise<void>;
}

/** How a guarded operation ended. */
export type ProjectionLockResult<T> =
  | { readonly status: "done"; readonly value: T }
  | { readonly status: "held"; readonly holder: AdvisoryLockHolder | "unreadable" | null }
  | { readonly status: "gone" }
  | { readonly status: "lost"; readonly report: string };

// Creates a lockfile only inside a state folder that exists, so no create recreates a removed worktree's Git directory.
const createInExistingFolder = createAtomicFileCreator({
  mkdir: () => Promise.resolve(undefined),
  writeFile: (path, content, options) => writeFile(path, content, options),
  link, unlink, randomId: () => randomBytes(8).toString("hex"),
});

function isGone(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function rethrowUnlessGone(error: unknown): void {
  if (!isGone(error)) throw error;
}

/** Process and lockfile boundaries, native by default. */
export type ProjectionLockDependencies = LeaseProcessDependencies & {
  readonly readFile?: (path: string) => Promise<string>;
};

/**
 * Run an operation holding a worktree's projection lock. The lock is not reentrant: asking again for one this process
 * holds waits until it times out, so take it at one level only.
 * @param location - The located worktree.
 * @param operation - The operation, which awaits `step` before each step it takes.
 * @param options - `maxWaitMs` bounds the wait; unset, the lock's default bound applies.
 * @param overrides - Process and lockfile boundaries to replace.
 * @returns The operation's value, or why it did not run or did not finish.
 */
export async function withProjectionLock<T>(
  location: ProjectionLocation, operation: (session: ProjectionLockSession) => Promise<T>,
  options: { readonly maxWaitMs?: number } = {}, overrides: Partial<ProjectionLockDependencies> = {},
): Promise<ProjectionLockResult<T>> {
  const deps: ProjectionLockDependencies = { ...NATIVE_LEASE_PROCESS, ...overrides };
  if (await ensureProjectionStateFolder(location) === "gone") return { status: "gone" };
  const lockFiles = {
    exclusiveCreate: createInExistingFolder, ...(deps.readFile === undefined ? {} : { readFile: deps.readFile }),
  };
  const startedAt = deps.now();
  const acquired = await acquire(join(location.stateDir, PROJECTION_LOCK_FILE), lockFiles, options, deps);
  if ("status" in acquired) return acquired;
  return runLeased(acquired, startedAt, operation, lockFiles, deps);
}

type LockFiles = Pick<AdvisoryLockOptions, "exclusiveCreate" | "readFile">;

async function acquire(
  lockPath: string, lockFiles: LockFiles, options: { readonly maxWaitMs?: number }, deps: ProjectionLockDependencies,
): Promise<AdvisoryLockHandle | ProjectionLockResult<never>> {
  let lastSeen: AdvisoryLockContention["holder"] | null = null;
  try {
    return await acquireAdvisoryLock(lockPath, {
      ...lockFiles, ...(options.maxWaitMs === undefined ? {} : { maxWaitMs: options.maxWaitMs }),
      pid: deps.pid, processInstance: deps.processInstance, processScope: await deps.resolveProcessScope(),
      leaseDurationMs: ADVISORY_LEASE_DURATION_MS, now: deps.now,
      onWait: ({ holder }) => { lastSeen = holder; },
    });
  } catch (error) {
    if (error instanceof AdvisoryLockTimeoutError) return { status: "held", holder: lastSeen };
    if (isGone(error)) return { status: "gone" };
    throw error;
  }
}

/** Raised by a step taken after the lease was lost, ending the operation there. */
class ProjectionLockLostError extends Error {}

/**
 * Run the operation under a renewable lease that renews and releases through the same create seam, and whose loss
 * ends only this operation, at its next step, rather than the process.
 */
async function runLeased<T>(
  handle: AdvisoryLockHandle, startedAt: number, operation: (session: ProjectionLockSession) => Promise<T>,
  lockFiles: LockFiles, deps: ProjectionLockDependencies,
): Promise<ProjectionLockResult<T>> {
  // Written by the lease's callbacks, so read through an object rather than a narrowed local.
  const state: { lost: boolean } = { lost: false };
  const lines: string[] = [];
  const lease: RenewableLeaseDependencies = {
    ...deps,
    renewLock: async (held, duration) => await renewAdvisoryLock(held, duration, lockFiles),
    // A worktree whose Git directory went during the release leaves nothing to release; the result stands.
    releaseLock: async (held) => { await releaseAdvisoryLockConfirmed(held, lockFiles).catch(rethrowUnlessGone); },
    terminateProcess: () => { state.lost = true; },
    writeLine: (line) => { lines.push(line); },
  };
  try {
    const value = await withRenewableLease(handle, startedAt, async (ownership) => await operation({
      step: async (): Promise<void> => {
        if (state.lost) throw new ProjectionLockLostError("The projection lock was lost");
        try {
          await ownership.confirmOwnership();
        } catch (error) {
          state.lost = true;
          const detail = error instanceof Error ? error.message : String(error);
          lines.push(detail);
          throw new ProjectionLockLostError(detail);
        }
      },
    }), lease,
      { lock: "Projection lock", controller: "this worktree's projection operation" });
    if (state.lost) return { status: "lost", report: lines.join("\n") };
    for (const line of lines) deps.writeLine(line);
    return { status: "done", value };
  } catch (error) {
    if (state.lost) return { status: "lost", report: lines.join("\n") };
    for (const line of lines) deps.writeLine(line);
    throw error;
  }
}
