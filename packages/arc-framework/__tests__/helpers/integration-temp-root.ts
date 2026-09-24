/** Select an executable Linux temp root for write-heavy integration fixtures. */

import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
