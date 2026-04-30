/**
 * Head-hash probe — current HEAD short-hash for session-handoff anchoring.
 *
 * Non-destructive read of `git rev-parse --short HEAD`. Consumed by the
 * session-handoff composite envelope so the handoff workflow can record
 * the `Commit at Handoff` value without a separate `git rev-parse` call.
 *
 * Soft-null on empty stdout (unusual but possible in edge git states);
 * exec failures (e.g., no commits yet, not a git repo) propagate to the
 * probe wrapper as a runtime error.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

export interface HeadHashResult {
  /** Current HEAD short-hash, or `null` when rev-parse returned empty stdout. */
  hash: string | null;
}

export interface RunHeadHashStatusOptions {
  exec: GitExec;
}

/**
 * Probe the current HEAD short-hash via `git rev-parse --short HEAD`.
 */
export async function runHeadHashStatus(
  options: RunHeadHashStatusOptions,
): Promise<HeadHashResult> {
  const { stdout } = await options.exec("git", ["rev-parse", "--short", "HEAD"]);
  const hash = stdout.trim();
  return { hash: hash.length === 0 ? null : hash };
}
