/**
 * Git ancestry helpers for resolving candidate commits against HEAD.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

/**
 * Keep candidate commits reachable from HEAD using one `rev-list HEAD` read.
 *
 * @param exec - Git executor.
 * @param candidates - Candidate commit shas to filter.
 * @returns Reachable candidates in input order. Returns `[]` when HEAD cannot be read.
 */
export async function filterCommitsReachableFromHead(
  exec: GitExec,
  candidates: string[],
): Promise<string[]> {
  if (candidates.length === 0) return [];

  try {
    const { stdout } = await exec("git", ["rev-list", "HEAD"]);
    const reachable = new Set(
      stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
    return candidates.filter((commit) => reachable.has(commit));
  } catch {
    return [];
  }
}

/**
 * Reduce candidate commits to the members no other candidate descends.
 *
 * @param exec - Git executor.
 * @param candidates - Reachable candidate commit shas to reduce.
 * @returns Causally-maximal commits in input order, or `[]` when git cannot reduce them.
 */
export async function reduceCommitsToCausallyMaximal(
  exec: GitExec,
  candidates: string[],
): Promise<string[]> {
  if (candidates.length <= 1) return [...candidates];

  try {
    const { stdout } = await exec("git", ["merge-base", "--independent", ...candidates]);
    const independent = new Set(
      stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
    return candidates.filter((commit) => independent.has(commit));
  } catch {
    return [];
  }
}
