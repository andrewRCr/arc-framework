/**
 * Deterministic foreign-artifact detection for the `arc-errand` advisory gate.
 *
 * Given an errand's target path(s) and the originating WU, reports which other
 * in-flight WUs touch the target — a git-checkable fact, not a judgment call.
 * The check stays deterministic because an errand has a concrete target path, so
 * overlap is decidable from local git state alone (no remote fetch, no heuristics).
 *
 * The in-flight set is supplied as a roster-shaped input the caller projects —
 * the local worktree roster (`runActiveRoster`) or the cross-machine oracle
 * (`runActiveInFlight`). This module adds the per-path overlap diff on top of
 * it: a committed diff against the base, plus — only for a locally-checked-out
 * entry — an uncommitted-edits probe in its worktree. A worktree-less
 * (remote-only) entry has no local edits to collide with here, so its committed
 * diff against `origin/<branch>` is the whole signal. Returns facts only and
 * never blocks — the skill turns the facts into an advisory caveat
 * (bias-to-surface judgment lives there, not here).
 *
 * @module
 */

import type { GitExec } from "./exec.js";
import type { InFlightEntry } from "./in-flight-derivation.js";
import type { WorktreeRosterState } from "./worktree-roster.js";

/**
 * The minimal in-flight entry the overlap core needs. A {@link WorktreeRosterEntry}
 * satisfies it directly; an oracle projection supplies `branch` as the diffable
 * ref (`origin/<branch>` for a remote-only entry) and omits `worktreePath` when
 * the WU has no local worktree.
 */
export interface OverlapCandidateEntry {
  /** Diffable branch ref — a local branch, or `origin/<branch>` for a remote-only entry. */
  branch: string;
  /** Local worktree path; absent for a remote-only entry (no uncommitted probe runs). */
  worktreePath?: string;
  /** Present marks a meta-bearing work unit (in-flight); absent → admin/main checkout. */
  metaFilePath?: string;
  /** Roster-entry state; a `Shipped` WU has merged and is excluded. */
  state?: WorktreeRosterState;
}

/** The roster-shaped in-flight input — local roster or oracle projection. */
export interface OverlapRoster {
  entries: OverlapCandidateEntry[];
  warnings: string[];
}

/** Inputs for {@link detectForeignArtifactOverlap}. */
export interface ForeignArtifactDetectionOptions {
  /** Injectable git executor. */
  exec: GitExec;
  /** Identity-filtered in-flight set — the caller applies the identity filter. */
  roster: OverlapRoster;
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
  /** The WU's worktree path; absent for a remote-only entry (in flight elsewhere). */
  worktreePath?: string;
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
function isInFlight(entry: OverlapCandidateEntry): boolean {
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
    // A remote-only entry has no local worktree to probe; its uncommitted edits
    // live elsewhere and can't collide with a local edit, so committed is all.
    const uncommitted = entry.worktreePath === undefined
      ? []
      : await uncommittedMatches(exec, entry.worktreePath, targetPaths);
    const matched = targetPaths.filter(
      (target) => committed.includes(target) || uncommitted.includes(target),
    );
    if (matched.length > 0) {
      overlaps.push({
        branch: entry.branch,
        ...(entry.worktreePath !== undefined ? { worktreePath: entry.worktreePath } : {}),
        matchedPaths: matched,
      });
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
  // Porcelain v1 lines are `XY <path>` — the path begins at column 3. A rename
  // or copy reads `XY <old> -> <new>`; the destination after the arrow is the
  // live path, so match on that (else a renamed target slips past detection).
  const changed = stdout
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter((l) => l !== "")
    .map((entry) => {
      const arrow = entry.lastIndexOf(" -> ");
      return arrow === -1 ? entry : entry.slice(arrow + 4);
    });
  return targetPaths.filter((target) => changed.some((file) => underPath(file, target)));
}

/** True when `file` is at or beneath `target` (path-prefix match). */
function underPath(file: string, target: string): boolean {
  return file === target || file.startsWith(target.endsWith("/") ? target : `${target}/`);
}

/**
 * Project oracle in-flight entries into the overlap roster shape.
 *
 * Work units only — errands carry no meta and aren't WU-overlap candidates
 * (mirroring the meta-bearing narrowing the worktree roster applies). A
 * locally-checked-out WU keeps its branch and worktree, so the core runs its
 * full committed + uncommitted probe; a remote-only WU projects its branch as
 * `origin/<branch>` with no worktree, so the committed diff against the remote
 * ref is its overlap signal.
 *
 * @param entries - Oracle output (identity-filtered in-flight WUs and errands).
 * @returns The overlap roster the detection core consumes.
 */
export function projectInFlightToOverlapRoster(entries: readonly InFlightEntry[]): OverlapRoster {
  const projected: OverlapCandidateEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== "work-unit") continue;
    projected.push({
      branch: entry.worktreePath !== undefined ? entry.branch : `origin/${entry.branch}`,
      ...(entry.worktreePath !== undefined ? { worktreePath: entry.worktreePath } : {}),
      metaFilePath: `.arc/active/meta-${entry.name}.md`,
      state: entry.state,
    });
  }
  return { entries: projected, warnings: [] };
}
