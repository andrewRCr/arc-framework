/**
 * Repository-wide admission for subprocess-heavy local test tiers.
 *
 * Unit-only runs remain concurrent. Full, integration, and E2E runners call this
 * boundary so linked worktrees on one machine share a single heavy-test slot.
 *
 * @module
 */

import { randomUUID } from "node:crypto";
import { mkdir as fsMkdir, readlink as fsReadlink } from "node:fs/promises";
import { join } from "node:path";

import { createGitExec } from "./io-context.js";
import type { GitExec } from "./git/exec.js";
import {
  acquireAdvisoryLock,
  renewAdvisoryLock,
  releaseAdvisoryLock,
  releaseAdvisoryLockSync,
  type AdvisoryLockContention,
  type AdvisoryLockHandle,
  type AdvisoryLockOptions,
} from "./advisory-lock.js";
import { resolveGitCommonDir } from "./user-sync/repo-shared-paths.js";

/** Explicit opt-out used only for deliberate local contention experiments. */
export const LOCAL_TEST_CONCURRENCY_OVERRIDE = "ARC_TEST_ALLOW_CONCURRENCY";

/** Local tiers whose subprocess load must be admitted through the shared slot. */
export type LocalHeavyTestTier = "full" | "integration" | "e2e" | "e2e-focused";

/** Inputs resolved by the package-script adapter. */
export interface LocalTestAdmissionInput {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly tier: LocalHeavyTestTier;
}

/** Non-authoritative operator diagnostics; never a source of ARC or Git state. */
interface LocalTestHolderMetadata {
  readonly schemaVersion: 1;
  readonly branch: string;
  readonly tier: LocalHeavyTestTier;
  readonly worktree: string;
  readonly startedAt: string;
}

interface LocalTestAdmissionDependencies {
  readonly acquireLock: (
    path: string,
    options?: AdvisoryLockOptions,
  ) => Promise<AdvisoryLockHandle>;
  readonly git: GitExec;
  readonly mkdir: (path: string) => Promise<void>;
  readonly now: () => number;
  readonly pid: number;
  readonly processInstance: string;
  readonly registerExitCleanup: (handle: AdvisoryLockHandle) => () => void;
  readonly releaseLock: (handle: AdvisoryLockHandle) => Promise<void>;
  readonly renewLock: (handle: AdvisoryLockHandle, leaseDurationMs: number) => Promise<boolean>;
  readonly resolveProcessScope: () => Promise<string>;
  readonly scheduleEvery: (callback: () => void, intervalMs: number) => () => void;
  readonly writeLine: (line: string) => void;
}

const DEFAULT_DEPENDENCIES: LocalTestAdmissionDependencies = {
  acquireLock: acquireAdvisoryLock,
  git: createGitExec(),
  mkdir: async (path) => {
    await fsMkdir(path, { recursive: true, mode: 0o700 });
  },
  now: Date.now,
  pid: process.pid,
  processInstance: randomUUID(),
  registerExitCleanup: (handle) => {
    const listener = () => {
      releaseAdvisoryLockSync(handle);
    };
    process.once("exit", listener);
    return () => {
      process.off("exit", listener);
    };
  },
  releaseLock: releaseAdvisoryLock,
  renewLock: renewAdvisoryLock,
  resolveProcessScope: async () => {
    if (process.platform !== "linux") return `${process.platform}:host`;
    try {
      return await fsReadlink("/proc/self/ns/pid");
    } catch {
      return "linux:host";
    }
  },
  scheduleEvery: (callback, intervalMs) => {
    const timer = setInterval(callback, intervalMs);
    timer.unref();
    return () => {
      clearInterval(timer);
    };
  },
  writeLine: (line) => {
    process.stderr.write(`${line}\n`);
  },
};

const LOCK_ROOT = join("arc", "test-suite");
const LOCK_FILENAME = ".local-heavy-tests.lock";
const HEARTBEAT_MS = 60_000;
const LEASE_DURATION_MS = 120_000;
const LEASE_RENEW_INTERVAL_MS = 10_000;

/**
 * Run one heavy local test action while holding the repository-common slot.
 *
 * CI is explicitly outside this local admission boundary, preserving job and
 * runner fan-out. A named environment override permits deliberate contention
 * experiments. The action runs in this process: the lock-owning PID is also the
 * Vitest controller PID, so controller death cannot leave a live controller
 * behind a reclaimable wrapper lock.
 *
 * @param input - Current checkout, environment, and logical test tier.
 * @param action - In-process heavy test runner.
 * @param overrides - Injectable process, Git, filesystem, and clock seams.
 * @returns The action's result.
 */
export async function withLocalHeavyTestAdmission<T>(
  input: LocalTestAdmissionInput,
  action: () => Promise<T>,
  overrides: Partial<LocalTestAdmissionDependencies> = {},
): Promise<T> {
  if (isTruthyEnvironmentFlag(input.env["CI"]) || input.env[LOCAL_TEST_CONCURRENCY_OVERRIDE] === "1") {
    return await action();
  }

  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const [{ stdout: worktreeRaw }, { stdout: branchRaw }, commonDir, processScope] = await Promise.all([
    dependencies.git("git", ["rev-parse", "--show-toplevel"], { cwd: input.cwd }),
    dependencies.git("git", ["branch", "--show-current"], { cwd: input.cwd }),
    resolveGitCommonDir(dependencies.git, input.cwd),
    dependencies.resolveProcessScope(),
  ]);
  const worktree = requireGitValue(worktreeRaw, "worktree root");
  const branch = branchRaw.trim() || "(detached HEAD)";
  const lockRoot = join(commonDir, LOCK_ROOT);
  const lockPath = join(lockRoot, LOCK_FILENAME);
  await dependencies.mkdir(lockRoot);

  const metadata: LocalTestHolderMetadata = {
    schemaVersion: 1,
    branch,
    tier: input.tier,
    worktree,
    startedAt: new Date(dependencies.now()).toISOString(),
  };
  const waitState = { observed: false };
  let lastReportMs: number | null = null;

  const handle = await dependencies.acquireLock(lockPath, {
    leaseDurationMs: LEASE_DURATION_MS,
    maxWaitMs: Number.POSITIVE_INFINITY,
    metadata,
    now: dependencies.now,
    onWait: (contention) => {
      if (lastReportMs === null) {
        waitState.observed = true;
        lastReportMs = contention.waitedMs;
        dependencies.writeLine(renderInitialWait(contention));
        return;
      }
      if (contention.waitedMs - lastReportMs >= HEARTBEAT_MS) {
        lastReportMs = contention.waitedMs;
        dependencies.writeLine(renderWaitHeartbeat(contention));
      }
    },
    pid: dependencies.pid,
    processInstance: dependencies.processInstance,
    processScope,
  });

  if (waitState.observed) {
    dependencies.writeLine(`Local heavy-test slot acquired after waiting; starting ${tierLabel(input.tier)} tests.`);
  }

  const unregisterExitCleanup = dependencies.registerExitCleanup(handle);
  const cancelHeartbeat = dependencies.scheduleEvery(() => {
    void dependencies.renewLock(handle, LEASE_DURATION_MS).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      dependencies.writeLine(`Unable to renew the local heavy-test lock heartbeat: ${detail}`);
    });
  }, LEASE_RENEW_INTERVAL_MS);

  try {
    return await action();
  } finally {
    cancelHeartbeat();
    try {
      await dependencies.releaseLock(handle);
    } finally {
      unregisterExitCleanup();
    }
  }
}

function renderInitialWait(contention: AdvisoryLockContention): string {
  return `Local heavy tests queued behind ${renderHolder(contention)}. This is normal; no action is needed.`;
}

function renderWaitHeartbeat(contention: AdvisoryLockContention): string {
  return `Still queued after ${formatDuration(contention.waitedMs)} behind ${renderHolder(contention)}. `
    + "This is normal; no action is needed.";
}

function renderHolder(contention: AdvisoryLockContention): string {
  if (contention.holder === "unreadable") return "another local heavy-test run (holder details unavailable)";
  const metadata = parseHolderMetadata(contention.holder.metadata);
  if (metadata === null) return `another local heavy-test run (PID ${contention.holder.pid})`;
  return `${tierLabel(metadata.tier)} tests (PID ${contention.holder.pid}, branch ${metadata.branch}, `
    + `worktree ${metadata.worktree}, started ${metadata.startedAt})`;
}

function parseHolderMetadata(value: unknown): LocalTestHolderMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<Record<keyof LocalTestHolderMetadata, unknown>>;
  if (
    candidate.schemaVersion !== 1
    || typeof candidate.branch !== "string"
    || !isLocalHeavyTestTier(candidate.tier)
    || typeof candidate.worktree !== "string"
    || typeof candidate.startedAt !== "string"
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    branch: candidate.branch,
    tier: candidate.tier,
    worktree: candidate.worktree,
    startedAt: candidate.startedAt,
  };
}

function isLocalHeavyTestTier(value: unknown): value is LocalHeavyTestTier {
  return value === "full" || value === "integration" || value === "e2e" || value === "e2e-focused";
}

function tierLabel(tier: LocalHeavyTestTier): string {
  return tier === "e2e-focused" ? "focused E2E" : tier === "e2e" ? "E2E" : tier;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes === 0 ? `${seconds}s` : remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function requireGitValue(raw: string, label: string): string {
  const value = raw.trim();
  if (value.length === 0) throw new Error(`git returned an empty ${label}`);
  return value;
}

function isTruthyEnvironmentFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}
