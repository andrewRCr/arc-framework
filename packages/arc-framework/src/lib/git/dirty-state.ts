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

import { z } from "zod";

import type { GitExec } from "./exec.js";

/** Complete working-tree dirty-state result. */
export const DirtyStateResultSchema = z.strictObject({
  state: z.enum(["clean", "dirty"]),
  /** Number of porcelain entries (modified, staged, untracked). 0 when clean. */
  fileCount: z.number().int().nonnegative(),
});

export type DirtyStateResult = z.infer<typeof DirtyStateResultSchema>;
export type DirtyState = DirtyStateResult["state"];

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
