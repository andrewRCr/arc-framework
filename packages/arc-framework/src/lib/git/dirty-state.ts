/**
 * Dirty-state probe — porcelain check on the working tree.
 *
 * Non-destructive read of `git status --porcelain`. Counts entries and
 * classifies as clean / dirty. Consumed by the session-handoff composite
 * envelope so handoff-time decisions (push readiness, commit prompts)
 * have an authoritative current-state snapshot.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

export type DirtyState = "clean" | "dirty";

export interface DirtyStateResult {
  state: DirtyState;
  /** Number of porcelain entries (modified, staged, untracked). 0 when clean. */
  fileCount: number;
}

export interface RunDirtyStateStatusOptions {
  exec: GitExec;
}

/**
 * Probe the working-tree dirty state via `git status --porcelain`.
 *
 * Each non-empty porcelain line is one entry. Output is parsed
 * line-by-line (ignoring blank lines) — matches `git status`'s short
 * format where staged + unstaged + untracked files each contribute one
 * line.
 */
export async function runDirtyStateStatus(
  options: RunDirtyStateStatusOptions,
): Promise<DirtyStateResult> {
  const { stdout } = await options.exec("git", ["status", "--porcelain"]);
  const lines = stdout.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { state: "clean", fileCount: 0 };
  }
  return { state: "dirty", fileCount: lines.length };
}
