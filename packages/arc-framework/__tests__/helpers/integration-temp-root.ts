/** Select an executable Linux temp root for write-heavy integration fixtures, and give each run its own directory. */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** Name prefix of one integration run's directory under the selected root. */
export const INTEGRATION_RUN_ROOT_PREFIX = "arc-integration-run-";

/** Age past which a run directory is treated as left behind by an interrupted run. */
export const STALE_INTEGRATION_RUN_ROOT_MS = 24 * 60 * 60 * 1000;

/**
 * Probe the candidate itself: writability does not imply execution on a noexec mount.
 *
 * @param candidateRoot - Optional memory-backed root to use for integration fixtures.
 * @param platform - Host platform, injectable for tests.
 * @param executeProbe - Direct executable invocation, injectable for tests.
 * @returns The canonical candidate when it supports execution; otherwise undefined.
 */
export function selectIntegrationTempRoot(
  candidateRoot: string,
  platform: NodeJS.Platform = process.platform,
  executeProbe: (path: string) => void = (path) => {
    execFileSync(path, [], { stdio: "ignore", timeout: 1_000 });
  },
): string | undefined {
  if (platform !== "linux") return undefined;

  let probeDirectory: string | undefined;
  let selectedRoot: string | undefined;
  try {
    const root = realpathSync(candidateRoot);
    probeDirectory = mkdtempSync(join(root, "arc-vitest-exec-"));
    const probe = join(probeDirectory, "probe");
    writeFileSync(probe, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    executeProbe(probe);
    selectedRoot = root;
  } catch {
    // Unavailable, unwritable, or non-executable candidate: use the OS temp root.
  }

  if (probeDirectory !== undefined) {
    try {
      rmSync(probeDirectory, { recursive: true, force: true });
    } catch {
      return undefined;
    }
  }
  return selectedRoot;
}

/**
 * Name one run's directory under the selected root. The name is fixed when the config loads, and the directory
 * is created only when an integration project's global setup runs.
 *
 * @param root - The selected integration temp root.
 * @returns A path under `root` unique to this process.
 */
export function integrationRunRootPath(root: string): string {
  return join(root, `${INTEGRATION_RUN_ROOT_PREFIX}${process.pid}-${randomBytes(6).toString("hex")}`);
}

/**
 * Create this run's directory after removing any that interrupted runs left behind. Refuses a path not named as a
 * run directory, so a temp directory configured some other way is never removed.
 *
 * @param runRoot - This run's directory, from {@link integrationRunRootPath}.
 * @param now - Current time in milliseconds, injectable for tests.
 * @returns A teardown that removes this run's directory and everything written under it.
 */
export function prepareIntegrationRunRoot(runRoot: string, now: number = Date.now()): () => void {
  if (!basename(runRoot).startsWith(INTEGRATION_RUN_ROOT_PREFIX)) {
    throw new Error(
      `Refusing to manage ${runRoot}: an integration run directory is named ${INTEGRATION_RUN_ROOT_PREFIX}*`);
  }
  sweepStaleIntegrationRunRoots(dirname(runRoot), now, basename(runRoot));
  mkdirSync(runRoot, { recursive: true });
  return () => {
    rmSync(runRoot, { recursive: true, force: true });
  };
}

/**
 * Remove run directories under `root` whose modification time is older than the stale age. Only names carrying
 * {@link INTEGRATION_RUN_ROOT_PREFIX} are considered; anything that cannot be read or removed is left alone.
 *
 * @param root - The selected integration temp root.
 * @param now - Current time in milliseconds.
 * @param keep - A run directory name never to remove.
 * @param maxAgeMs - Age past which a run directory counts as left behind.
 */
export function sweepStaleIntegrationRunRoots(
  root: string,
  now: number,
  keep?: string,
  maxAgeMs: number = STALE_INTEGRATION_RUN_ROOT_MS,
): void {
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(INTEGRATION_RUN_ROOT_PREFIX) || name === keep) continue;
    const path = join(root, name);
    try {
      const stat = lstatSync(path);
      if (stat.isDirectory() && now - stat.mtimeMs > maxAgeMs) rmSync(path, { recursive: true, force: true });
    } catch {
      // Another run removed it first, or it belongs to someone else: leave it.
    }
  }
}
