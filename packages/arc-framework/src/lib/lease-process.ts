/** Native process and advisory-lock boundaries shared by development lease owners. */
import { randomUUID } from "node:crypto";
import { readlink } from "node:fs/promises";
import { releaseAdvisoryLockConfirmed, releaseAdvisoryLockSync, renewAdvisoryLock } from "./advisory-lock.js";
import type { RenewableLeaseDependencies } from "./renewable-lease.js";

const instanceKey = Symbol.for("arc.development-lease.process-instance");
const processStore = globalThis as typeof globalThis & { [instanceKey]?: string };
const processInstance = processStore[instanceKey] ??= randomUUID();

/** Native process identity together with renewable lifetime boundaries. */
export interface LeaseProcessDependencies extends RenewableLeaseDependencies {
  readonly pid: number;
  readonly processInstance: string;
  readonly resolveProcessScope: () => Promise<string>;
}

/**
 * Identify runtimes whose PIDs are mutually observable.
 * @param platform - Runtime operating system
 * @param instance - Identity shared across module copies in this exact process
 * @param readPidNamespace - Linux process-namespace reader
 * @returns Comparable process visibility scope, or an instance-specific fallback
 */
export async function resolveProcessVisibilityScope(
  platform: NodeJS.Platform, instance: string,
  readPidNamespace: () => Promise<string> = async () => await readlink("/proc/self/ns/pid"),
): Promise<string> {
  if (platform !== "linux") return `${platform}:host`;
  try { return await readPidNamespace(); }
  catch { return `linux:unknown:${instance}`; }
}

/** Native defaults retain the same identity even when loaded through a native control bundle. */
export const NATIVE_LEASE_PROCESS: LeaseProcessDependencies = {
  now: Date.now, pid: process.pid, processInstance,
  resolveProcessScope: async () => await resolveProcessVisibilityScope(process.platform, processInstance),
  registerExitCleanup: (handle) => {
    const listener = () => { releaseAdvisoryLockSync(handle); };
    process.once("exit", listener);
    return () => { process.off("exit", listener); };
  },
  releaseLock: releaseAdvisoryLockConfirmed,
  renewLock: renewAdvisoryLock,
  scheduleEvery: (callback, interval) => {
    const timer = setInterval(callback, interval);
    timer.unref();
    return () => { clearInterval(timer); };
  },
  terminateProcess: () => { process.kill(process.pid, "SIGTERM"); },
  writeLine: (line) => { process.stderr.write(`${line}\n`); },
};
