/** Derived timeout and expiring-substrate metrics for retained test-cost runs. */

import type { TestCostFile } from "./capture.js";

export const TEST_COST_CLI_TIMEOUT_META = "arcTestCostCliTimeoutMs";
export const TEST_COST_CLI_SPAWN_COUNT_META = "arcTestCostCliSpawnCount";

export interface TimeoutHeadroom {
  readonly timeoutCeilingMs: number;
  readonly headroomMs: number;
  readonly headroomFraction: number;
}

export interface SubstrateShare {
  readonly durationMs: number;
  readonly shareFraction: number;
  readonly files: readonly string[];
}

export function resolveTimeoutHeadroom(
  durationMs: number,
  vitestTimeoutMs: number,
): TimeoutHeadroom {
  requireNonNegative(durationMs, "test duration");
  requirePositive(vitestTimeoutMs, "Vitest timeout");
  const timeoutCeilingMs = vitestTimeoutMs;
  const headroomMs = timeoutCeilingMs - durationMs;
  return { timeoutCeilingMs, headroomMs, headroomFraction: headroomMs / timeoutCeilingMs };
}

export function isSubstrateBoundFile(path: string): boolean {
  const normalizedPath = path.replaceAll("\\", "/");
  const basename = normalizedPath.split("/").at(-1) ?? path;
  return basename === "user-local-lifecycle.test.ts"
    || basename === "user-remote-lifecycle.test.ts"
    || basename === "user-sync.test.ts"
    || basename === "multi-clone.test.ts"
    || basename === "branch-bounded-notes-export.test.ts"
    || basename === "local-sync-state.test.ts"
    || basename === "errand-record-sync.test.ts"
    || /^user-sync-.+\.test\.ts$/u.test(basename)
    || /(?:^|\/)user-sync\//u.test(normalizedPath)
    || /^user-notes-.+\.test\.ts$/u.test(basename)
    || /^notes-.+\.test\.ts$/u.test(basename)
    || /^sync-state-.+\.test\.ts$/u.test(basename)
    || /^sync-(?:inbound|purity|state-producer)\.e2e\.test\.ts$/u.test(basename);
}

export function summarizeSubstrateShare(files: readonly TestCostFile[]): SubstrateShare {
  const selected = files.filter((file) => isSubstrateBoundFile(file.path));
  const durationMs = selected.reduce((total, file) => total + file.durationMs, 0);
  const totalDurationMs = files.reduce((total, file) => total + file.durationMs, 0);
  return {
    durationMs,
    shareFraction: totalDurationMs === 0 ? 0 : durationMs / totalDurationMs,
    files: selected.map((file) => file.path).sort(),
  };
}

function requireNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative`);
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be finite and positive`);
}
