/**
 * Recently-active remote-branch probe.
 *
 * The supplied-snapshot analyzer classifies advertised tips by exact OID using
 * local-only object reads. A compatibility wrapper retains tracking-ref
 * enumeration until session composition supplies the shared snapshot.
 *
 * The compatibility wrapper filters `origin/HEAD`, returns short names, and
 * preserves its soft empty result on tracking-ref read failure.
 *
 * @module
 */

import type { GitExec } from "./exec.js";
import type { HistoryCompletenessResult } from "./history-completeness.js";
import type { ObjectAvailabilityResult } from "./object-availability.js";

const SECONDS_PER_DAY = 86_400;

/** Supplied advertised-head projection for the branch-gone recovery fallback tier. */
export interface AnalyzeRecentRemoteBranchesSnapshotOptions {
  exec: GitExec;
  tips: Readonly<Record<string, string>>;
  objectAvailability: ObjectAvailabilityResult;
  history: HistoryCompletenessResult;
  excludeBranches: ReadonlySet<string>;
  withinDays: number;
  now?: number;
}

/** Verified recent branches plus eligible heads whose objects are not local. */
export interface RecentRemoteBranchesSnapshotResult {
  branches: string[];
  pendingBranchCount: number;
}

/**
 * Analyze advertised branch tips without consulting tracking refs.
 *
 * @param options - Snapshot tips, local prerequisites, exclusions, and recency window
 * @returns Verified recent branch names plus the count of eligible missing objects
 */
export async function analyzeRecentRemoteBranchesSnapshot(
  options: AnalyzeRecentRemoteBranchesSnapshotOptions,
): Promise<RecentRemoteBranchesSnapshotResult> {
  const eligible = Object.entries(options.tips)
    .filter(([branch]) => !options.excludeBranches.has(branch));
  if (eligible.length === 0) return { branches: [], pendingBranchCount: 0 };
  if (options.objectAvailability.kind !== "complete") {
    throw new Error("Advertised recent-branch object availability could not be inspected.");
  }

  let pendingBranchCount = 0;
  const local: Array<readonly [branch: string, oid: string]> = [];
  for (const [branch, oid] of eligible) {
    const available = options.objectAvailability.commits[oid];
    if (available === false) {
      pendingBranchCount += 1;
    } else if (available === true) {
      local.push([branch, oid]);
    } else {
      throw new Error(`Advertised branch ${JSON.stringify(branch)} has no local availability fact.`);
    }
  }
  if (local.length === 0) return { branches: [], pendingBranchCount };
  if (options.history.kind !== "complete") {
    throw new Error("Complete local history is required for recent-branch classification.");
  }

  const cutoff = Math.floor((options.now ?? Date.now()) / 1000) - options.withinDays * SECONDS_PER_DAY;
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    objectAccess: "local-only",
  });
  const dated = await Promise.all(local.map(async ([branch, oid]) => {
    const { stdout } = await localOnlyExec("git", ["show", "-s", "--format=%ct", oid]);
    const value = stdout.trim();
    if (!/^\d+$/u.test(value)) throw new Error(`Malformed commit date for advertised branch ${JSON.stringify(branch)}.`);
    return { branch, timestamp: Number(value) };
  }));
  const branches = dated
    .filter(({ timestamp }) => timestamp >= cutoff)
    .sort((left, right) => right.timestamp - left.timestamp || left.branch.localeCompare(right.branch))
    .map(({ branch }) => branch);
  return { branches, pendingBranchCount };
}

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
