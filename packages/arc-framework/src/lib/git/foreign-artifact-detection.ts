/**
 * Deterministic foreign-artifact detection for the `arc-errand` advisory gate.
 *
 * Given an errand's target path(s) and the originating WU, reports which other
 * in-flight WUs touch the target — a git-checkable fact, not a judgment call.
 * The check stays deterministic because an errand has a concrete target path, so
 * overlap is decidable from local git state alone (no remote fetch, no heuristics).
 *
 * The roster (identity-filtered by the caller, no remote fetch) supplies the
 * in-flight set; this module adds the per-path overlap diff on top of it. It
 * returns facts only and never blocks — the skill turns the facts into an
 * advisory caveat (bias-to-surface judgment lives there, not here).
 *
 * @module
 */

import type { GitExec } from "./exec.js";
import type { WorktreeRosterEntry, WorktreeRosterResult } from "./worktree-roster.js";

/** Inputs for {@link detectForeignArtifactOverlap}. */
export interface ForeignArtifactDetectionOptions {
  /** Injectable git executor (local only — no remote fetch). */
  exec: GitExec;
  /** Identity-filtered roster — the caller applies `filterRosterByIdentity`. */
  roster: WorktreeRosterResult;
  /** Repo-relative target path(s); matched by path-prefix (a dir matches files beneath it). */
  targetPaths: string[];
  /** Base branch to diff against — resolved from `branch.base`, never hardcoded. */
  baseBranch: string;
  /** The originating WU's worktree path — never reported (self-excluded). */
  originatingWorktreePath: string;
}

/** One foreign in-flight WU whose state overlaps the errand's target. */
export interface ForeignArtifactOverlap {
  branch: string;
  worktreePath: string;
  /** The subset of target paths this WU touches. */
  matchedPaths: string[];
}

export interface ForeignArtifactDetectionResult {
  /** Foreign in-flight overlaps (possibly empty); advisory, never a block. */
  overlaps: ForeignArtifactOverlap[];
}

/**
 * In-flight = a meta-bearing worktree whose WU has not shipped. A `Shipped` WU
 * has already merged to base, so it can plant no future cross-branch conflict;
 * every other state (Planning / Active / Integrating, or an unparseable State)
 * still occupies a branch that will merge, so it counts. Meta-less admin/main
 * checkouts carry no WU and never count.
 */
function isInFlight(entry: WorktreeRosterEntry): boolean {
  return entry.metaFilePath !== undefined && entry.state !== "Shipped";
}

/**
 * Detect which other in-flight WUs touch the errand's target path(s).
 *
 * @param options - Roster, target paths, base branch, and the originating worktree.
 * @returns The foreign overlaps; empty when none touch the target.
 */
export async function detectForeignArtifactOverlap(
  options: ForeignArtifactDetectionOptions,
): Promise<ForeignArtifactDetectionResult> {
  const { exec, roster, targetPaths, baseBranch, originatingWorktreePath } = options;

  const candidates = roster.entries.filter(
    (entry) => isInFlight(entry) && entry.worktreePath !== originatingWorktreePath,
  );

  const overlaps: ForeignArtifactOverlap[] = [];
  for (const entry of candidates) {
    const committed = await committedMatches(exec, baseBranch, entry.branch, targetPaths);
    const uncommitted = await uncommittedMatches(exec, entry.worktreePath, targetPaths);
    const matched = targetPaths.filter(
      (target) => committed.includes(target) || uncommitted.includes(target),
    );
    if (matched.length > 0) {
      overlaps.push({ branch: entry.branch, worktreePath: entry.worktreePath, matchedPaths: matched });
    }
  }

  return { overlaps };
}

/** Target paths an in-flight branch changed (committed) vs. the base, by prefix. */
async function committedMatches(
  exec: GitExec,
  baseBranch: string,
  branch: string,
  targetPaths: string[],
): Promise<string[]> {
  const { stdout } = await exec("git", [
    "diff",
    `${baseBranch}...${branch}`,
    "--name-only",
    "--",
    ...targetPaths,
  ]);
  const changed = stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  return targetPaths.filter((target) => changed.some((file) => underPath(file, target)));
}

/** Target paths with uncommitted edits in the in-flight WU's own worktree, by prefix. */
async function uncommittedMatches(
  exec: GitExec,
  worktreePath: string,
  targetPaths: string[],
): Promise<string[]> {
  const { stdout } = await exec(
    "git",
    ["status", "--porcelain", "--", ...targetPaths],
    { cwd: worktreePath },
  );
  // Porcelain v1 lines are `XY <path>` — the path begins at column 3.
  const changed = stdout
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter((l) => l !== "");
  return targetPaths.filter((target) => changed.some((file) => underPath(file, target)));
}

/** True when `file` is at or beneath `target` (path-prefix match). */
function underPath(file: string, target: string): boolean {
  return file === target || file.startsWith(target.endsWith("/") ? target : `${target}/`);
}
