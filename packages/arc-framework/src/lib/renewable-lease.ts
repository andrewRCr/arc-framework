/** Shared process lifetime for renewable advisory ownership. */
import type { AdvisoryLockHandle, AdvisoryLockRenewalResult } from "./advisory-lock.js";

/** Process, time, and native lock seams used by both admission and artifact ownership. */
export interface RenewableLeaseDependencies {
  readonly now: () => number;
  readonly registerExitCleanup: (handle: AdvisoryLockHandle) => () => void;
  readonly releaseLock: (handle: AdvisoryLockHandle) => Promise<void>;
  readonly renewLock: (handle: AdvisoryLockHandle, duration: number) => Promise<AdvisoryLockRenewalResult>;
  readonly scheduleEvery: (callback: () => void, interval: number) => () => void;
  readonly terminateProcess: () => void;
  readonly writeLine: (line: string) => void;
}

/** Capability valid only within an owning action's renewable lifetime. */
export interface RenewableLease {
  readonly confirmOwnership: () => Promise<void>;
}

/** Human diagnostics identifying the owned operation without supplying authority. */
export interface RenewableLeaseLabels {
  readonly lock: string;
  readonly controller: string;
}

export const ADVISORY_LEASE_DURATION_MS = 120_000;
export const ADVISORY_LEASE_RENEW_INTERVAL_MS = 10_000;

/**
 * Retain renewal and process-exit cleanup through the owning action and asynchronous release.
 * @param handle - Native acquired ownership
 * @param startedAt - Acquisition clock baseline
 * @param action - Work bound to the lease lifetime
 * @param deps - Actual process and native lock boundaries
 * @param labels - Operator diagnostics
 * @returns The action result after release completes
 */
export async function withRenewableLease<T>(
  handle: AdvisoryLockHandle, startedAt: number, action: (lease: RenewableLease) => Promise<T>,
  deps: RenewableLeaseDependencies, labels: RenewableLeaseLabels,
): Promise<T> {
  const unregister = deps.registerExitCleanup(handle);
  const monitor = createMonitor(handle, startedAt, deps, labels);
  const cancel = deps.scheduleEvery(monitor.tick, ADVISORY_LEASE_RENEW_INTERVAL_MS);
  try {
    return await action(monitor);
  } finally {
    monitor.beginRelease();
    await deps.releaseLock(handle);
    monitor.stop();
    cancel();
    unregister();
  }
}

function createMonitor(
  handle: AdvisoryLockHandle, startedAt: number, deps: RenewableLeaseDependencies, labels: RenewableLeaseLabels,
) {
  let active = true;
  let releasing = false;
  let lost = false;
  let pending: Promise<AdvisoryLockRenewalResult> | undefined;
  let repeat = false;
  let confirmedUntil = handle.leaseUntil ?? startedAt + ADVISORY_LEASE_DURATION_MS;
  const cannotRetry = () => deps.now() + ADVISORY_LEASE_RENEW_INTERVAL_MS >= confirmedUntil;
  const terminate = (message: string) => {
    if (!active || lost || releasing) return;
    lost = true;
    deps.writeLine(message);
    deps.terminateProcess();
  };
  const expiredMessage = `${labels.lock} could not be renewed before its last confirmed lease deadline; `
    + `stopping ${labels.controller}.`;
  const renewOnce = async (): Promise<AdvisoryLockRenewalResult> => {
    const start = deps.now();
    try {
      const result = await deps.renewLock(handle, ADVISORY_LEASE_DURATION_MS);
      if (!active) return result;
      if (result === "renewed") confirmedUntil = Math.max(confirmedUntil, start + ADVISORY_LEASE_DURATION_MS);
      else if (result === "ownership-lost") {
        if (releasing) active = false;
        else terminate(`${labels.lock} ownership was lost; stopping ${labels.controller}.`);
      } else if (cannotRetry()) terminate(expiredMessage);
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (active) {
        if (cannotRetry()) terminate(`Unable to renew the ${labels.lock.toLowerCase()} before its last confirmed `
          + `lease deadline: ${detail}; stopping ${labels.controller}.`);
        else deps.writeLine(`Unable to renew the ${labels.lock.toLowerCase()} heartbeat: ${detail}`);
      }
      return "retry";
    }
  };
  const renew = (queueAgain = false): Promise<AdvisoryLockRenewalResult> => {
    if (pending !== undefined) {
      if (queueAgain) repeat = true;
      return pending;
    }
    const operation = renewOnce();
    pending = operation;
    const clear = () => {
      if (pending !== operation) return;
      pending = undefined;
      if (repeat && active && !lost) { repeat = false; void renew(); }
    };
    void operation.then(clear, clear);
    return operation;
  };
  return {
    tick: () => {
      if (!active) return;
      if (!releasing && cannotRetry()) terminate(expiredMessage);
      else void renew(true);
    },
    confirmOwnership: async () => {
      const result = active && !releasing && !lost ? await renew() : "ownership-lost";
      if (!active || releasing || lost || result !== "renewed") {
        throw new Error(`${labels.lock} ownership cannot be confirmed; rerun the operation after ownership repair.`);
      }
    },
    beginRelease: () => { releasing = true; },
    stop: () => { active = false; },
  };
}
