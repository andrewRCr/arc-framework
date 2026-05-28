/**
 * Recently-active remote-branch probe.
 *
 * One local `git for-each-ref` over `refs/remotes/origin`, returning the
 * branches whose tip commit lands within a recency window, most-recent first.
 * It is the fallback signal in branch-gone recovery: when no in-flight worktree
 * resolves the destination, a recently-pushed branch is the next-best hint.
 *
 * `origin/HEAD` is filtered out and names are returned short (no `origin/`
 * prefix). A failed read yields `[]` — recency is a soft signal that must never
 * be fatal to recovery.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

const SECONDS_PER_DAY = 86_400;

export interface RunRecentRemoteBranchesOptions {
  exec: GitExec;
  /** A branch counts as recent when its tip committerdate is within this many days. */
  withinDays: number;
  /**
   * Reference instant in epoch milliseconds, injected for deterministic tests.
   * Defaults to `Date.now()`.
   */
  now?: number;
}

/**
 * Read recently-active `origin` branches, newest first, limited to those whose
 * tip committerdate is within `withinDays` of `now`.
 *
 * @param options - Executor, recency window, and optional reference instant
 * @returns Short branch names (no `origin/` prefix), most-recent first; `[]` on failure
 */
export async function runRecentRemoteBranches(
  options: RunRecentRemoteBranchesOptions,
): Promise<string[]> {
  const { exec, withinDays, now = Date.now() } = options;
  const cutoff = Math.floor(now / 1000) - withinDays * SECONDS_PER_DAY;

  let stdout: string;
  try {
    ({ stdout } = await exec("git", [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short) %(committerdate:unix)",
      "refs/remotes/origin",
    ]));
  } catch {
    return [];
  }

  const branches: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const lastSpace = trimmed.lastIndexOf(" ");
    if (lastSpace === -1) continue;
    const refName = trimmed.slice(0, lastSpace);
    const timestamp = Number.parseInt(trimmed.slice(lastSpace + 1), 10);
    if (Number.isNaN(timestamp) || timestamp < cutoff) continue;
    // `origin/HEAD` shortens to `origin`; both forms are the symbolic ref, not a branch.
    if (refName === "origin" || refName.endsWith("/HEAD")) continue;
    branches.push(refName.startsWith("origin/") ? refName.slice("origin/".length) : refName);
  }
  return branches;
}
