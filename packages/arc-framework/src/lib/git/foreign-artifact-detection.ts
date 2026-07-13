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
 * entry — an uncommitted-edits probe in its worktree. A worktree-less entry has
 * no checkout edits to collide with here, so its committed diff against the
 * selected local or remote branch ref is the whole signal. Returns facts only and
 * never blocks — the skill turns the facts into an advisory caveat
 * (bias-to-surface judgment lives there, not here).
 *
 * @module
 */

import type { GitExec } from "./exec.js";
import type {
  InFlightEntry,
  InFlightEntryMark,
  InFlightInputSnapshot,
  InFlightScheduling,
} from "./in-flight-derivation.js";
import type { WorktreeRosterState } from "./worktree-roster.js";

/**
 * The minimal in-flight entry the overlap core needs. A {@link WorktreeRosterEntry}
 * satisfies it directly; an oracle projection also supplies the content-derived
 * WU name used for self-excluding stale duplicate refs.
 */
export interface OverlapCandidateEntry {
  /** Diffable branch ref — a local branch, or `origin/<branch>` for a remote-only entry. */
  branch: string;
  /** Content-derived WU name from the in-flight roster; absent for legacy/local roster callers. */
  name?: string;
  /** Local worktree path; absent for remote-only and unoccupied-local entries. */
  worktreePath?: string;
  /** False distinguishes an unoccupied local branch from legacy/remote worktree-less input. */
  remoteOnly?: boolean;
  /** Present marks a meta-bearing work unit (in-flight); absent → admin/main checkout. */
  metaFilePath?: string;
  /** Roster-entry state; a `Shipped` WU has merged and is excluded. */
  state?: WorktreeRosterState;
  /** Degradation/indeterminacy marks from the in-flight roster. */
  marks?: readonly InFlightEntryMark[];
  /** Scheduling-axis classification; parked entries are ignored by the advisory detector. */
  scheduling?: InFlightScheduling;
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
  /** The originating WU's content-derived name — never reported when known. */
  originatingWorkUnitName?: string;
  /** The originating WU's meta path — never reported when present (remote-only self-exclusion). */
  originatingMetaPath?: string;
  /** Agreed in-flight input snapshot; candidate ref SHAs are reused from it when present. */
  snapshot?: InFlightInputSnapshot;
}

/** One foreign in-flight WU whose state overlaps the errand's target. */
export interface ForeignArtifactOverlap {
  branch: string;
  /** The WU's worktree path; absent when no checkout currently owns the branch. */
  worktreePath?: string;
  /** False when the worktree-less diff ran against an unoccupied local branch. */
  remoteOnly?: boolean;
  /** The subset of target paths this WU touches. */
  matchedPaths: string[];
}

/** One entry whose live probe changed while detection was reading it. */
export interface ForeignArtifactIndeterminateProbe {
  branch: string;
  /** The WU's worktree path; absent when no checkout currently owns the branch. */
  worktreePath?: string;
  /** False when the worktree-less probe targeted an unoccupied local branch. */
  remoteOnly?: boolean;
  /** Determinate matched paths, when any survived before indeterminacy was detected. */
  matchedPaths: string[];
  /** Why the probe cannot be asserted as overlap or no-overlap. */
  reason: "committed-probe-unresolved" | "uncommitted-probe-disagreement";
}

export type ForeignArtifactSkippedReason =
  | "entry-marked-indeterminate"
  | "entry-location-ambiguous";

/** One entry skipped because its roster state is too uncertain for advisory overlap assertions. */
export interface ForeignArtifactSkippedEntry {
  branch: string;
  /** The WU's worktree path; absent when no checkout currently owns the branch. */
  worktreePath?: string;
  /** False when the skipped worktree-less entry is an unoccupied local branch. */
  remoteOnly?: boolean;
  /** Entry marks that caused the skip. */
  marks: readonly InFlightEntryMark[];
  /** Stable machine-readable skip reason. */
  reason: ForeignArtifactSkippedReason;
}

export interface ForeignArtifactDetectionResult {
  /** Foreign in-flight overlaps (possibly empty); advisory, never a block. */
  overlaps: ForeignArtifactOverlap[];
  /** Entries skipped before probing because their roster state cannot be asserted safely. */
  skipped?: ForeignArtifactSkippedEntry[];
  /** Entries skipped because their fire-time probe was indeterminate. */
  indeterminate?: ForeignArtifactIndeterminateProbe[];
  /** Advisory caveats about degraded self-exclusion or probe certainty. */
  notes?: string[];
}

interface PathProbeResult {
  matchedPaths: string[];
  indeterminate?: boolean;
  reason?: ForeignArtifactIndeterminateProbe["reason"];
}

const SELF_EXCLUSION_FALLBACK_NOTE =
  "Originating work unit name was unavailable; self-exclusion fell back to worktree/meta path matching.";

/**
 * Prefer the fetched remote base so a stale local base cannot masquerade as
 * sibling-authored work.
 *
 * @param exec - Injectable git executor.
 * @param baseBranch - Configured unqualified base branch.
 * @returns The remote-qualified base when present, otherwise the local branch.
 */
export async function preferRemoteBaseRef(exec: GitExec, baseBranch: string): Promise<string> {
  const remoteBase = `origin/${baseBranch}`;
  try {
    await exec("git", ["rev-parse", "--verify", remoteBase]);
    return remoteBase;
  } catch {
    return baseBranch;
  }
}

/**
 * In-flight = a meta-bearing worktree whose WU has not shipped. A `Shipped` WU
 * has already merged to base, so it can plant no future cross-branch conflict;
 * every other state (Planning / Active / Integrating, or an unparseable State)
 * still occupies a branch that will merge, so it counts. Meta-less admin/main
 * checkouts carry no WU and never count.
 */
function isUnshippedWorkUnit(entry: OverlapCandidateEntry): boolean {
  return entry.metaFilePath !== undefined && entry.state !== "Shipped";
}

function skipReasonForMarks(marks: readonly InFlightEntryMark[] | undefined): ForeignArtifactSkippedReason | null {
  if (marks?.includes("indeterminate") === true) return "entry-marked-indeterminate";
  if (marks?.includes("location-ambiguous") === true) return "entry-location-ambiguous";
  return null;
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
  const {
    exec,
    roster,
    targetPaths,
    baseBranch,
    originatingWorktreePath,
    originatingWorkUnitName,
    originatingMetaPath,
    snapshot,
  } = options;
  const selfName =
    originatingWorkUnitName ?? roster.entries.find(
      (entry) => isUnshippedWorkUnit(entry) && entry.worktreePath === originatingWorktreePath
        && entry.name !== undefined,
    )?.name;
  const notes =
    selfName === undefined && roster.entries.some((entry) => isUnshippedWorkUnit(entry))
      ? [SELF_EXCLUSION_FALLBACK_NOTE]
      : [];

  const candidates: OverlapCandidateEntry[] = [];
  const skipped: ForeignArtifactSkippedEntry[] = [];
  for (const entry of roster.entries) {
    if (!isUnshippedWorkUnit(entry)) continue;
    if (selfName !== undefined && entry.name === selfName) continue;
    if (entry.worktreePath === originatingWorktreePath) continue;
    if (originatingMetaPath !== undefined && entry.metaFilePath === originatingMetaPath) continue;
    if (entry.scheduling === "parked") continue;

    const skipReason = skipReasonForMarks(entry.marks);
    if (skipReason !== null) {
      skipped.push({
        branch: entry.branch,
        ...(entry.worktreePath !== undefined ? { worktreePath: entry.worktreePath } : {}),
        ...(entry.remoteOnly !== undefined ? { remoteOnly: entry.remoteOnly } : {}),
        marks: [...(entry.marks ?? [])],
        reason: skipReason,
      });
      continue;
    }
    candidates.push(entry);
  }
  const baseSha = candidates.length > 0 ? await tryResolveRefSha(exec, baseBranch) : null;

  const overlaps: ForeignArtifactOverlap[] = [];
  const indeterminate: ForeignArtifactIndeterminateProbe[] = [];
  for (const entry of candidates) {
    const committed = await committedMatches(exec, baseSha ?? baseBranch, entry.branch, targetPaths, snapshot);
    // A worktree-less entry has no checkout edits to probe, so committed is all.
    const uncommitted = entry.worktreePath === undefined
      ? { matchedPaths: [] }
      : await uncommittedMatches(exec, entry.worktreePath, targetPaths);
    const matched = targetPaths.filter(
      (target) => committed.matchedPaths.includes(target) || uncommitted.matchedPaths.includes(target),
    );
    if (committed.indeterminate === true || uncommitted.indeterminate === true) {
      indeterminate.push({
        branch: entry.branch,
        ...(entry.worktreePath !== undefined ? { worktreePath: entry.worktreePath } : {}),
        ...(entry.remoteOnly !== undefined ? { remoteOnly: entry.remoteOnly } : {}),
        matchedPaths: matched,
        reason: committed.reason ?? uncommitted.reason ?? "uncommitted-probe-disagreement",
      });
      continue;
    }
    if (matched.length > 0) {
      overlaps.push({
        branch: entry.branch,
        ...(entry.worktreePath !== undefined ? { worktreePath: entry.worktreePath } : {}),
        ...(entry.remoteOnly !== undefined ? { remoteOnly: entry.remoteOnly } : {}),
        matchedPaths: matched,
      });
    }
  }

  return {
    overlaps,
    ...(skipped.length > 0 ? { skipped } : {}),
    ...(indeterminate.length > 0 ? { indeterminate } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

/** Target paths an in-flight branch changed (committed) vs. the base, by prefix. */
async function committedMatches(
  exec: GitExec,
  baseSha: string,
  branch: string,
  targetPaths: string[],
  snapshot?: InFlightInputSnapshot,
): Promise<PathProbeResult> {
  try {
    const candidateSha = snapshot?.refs[branch]?.trim() || await resolveRefSha(exec, branch);
    const { stdout } = await exec("git", [
      "diff",
      `${baseSha}...${candidateSha}`,
      "--name-only",
      "--",
      ...targetPaths,
    ]);
    const changed = stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    return {
      matchedPaths: targetPaths.filter((target) => changed.some((file) => underPath(file, target))),
    };
  } catch {
    return {
      matchedPaths: [],
      indeterminate: true,
      reason: "committed-probe-unresolved",
    };
  }
}

/** Resolve a ref to a commit SHA once so later probes operate on immutable inputs. */
async function resolveRefSha(exec: GitExec, ref: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--verify", ref]);
  const sha = stdout.trim().split(/\s+/u)[0] ?? "";
  if (sha === "") throw new Error(`Unable to resolve ref: ${ref}`);
  return sha;
}

async function tryResolveRefSha(exec: GitExec, ref: string): Promise<string | null> {
  try {
    return await resolveRefSha(exec, ref);
  } catch {
    return null;
  }
}

/** Target paths with uncommitted edits in the in-flight WU's own worktree, by prefix. */
async function uncommittedMatches(
  exec: GitExec,
  worktreePath: string,
  targetPaths: string[],
): Promise<PathProbeResult> {
  const first = await readUncommittedPaths(exec, worktreePath, targetPaths);
  const second = await readUncommittedPaths(exec, worktreePath, targetPaths);
  if (!sameStrings(first, second)) {
    return {
      matchedPaths: [],
      indeterminate: true,
      reason: "uncommitted-probe-disagreement",
    };
  }
  return {
    matchedPaths: targetPaths.filter((target) => first.some((file) => underPath(file, target))),
  };
}

async function readUncommittedPaths(
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
  return [...new Set(stdout
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter((l) => l !== "")
    .map((entry) => {
      const arrow = entry.lastIndexOf(" -> ");
      return arrow === -1 ? entry : entry.slice(arrow + 4);
    }))]
    .sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
 * full committed + uncommitted probe. A worktree-less local WU keeps its local
 * branch ref; a remote-only WU projects as `origin/<branch>`. The committed diff
 * against that selected ref is its overlap signal. The content-derived WU name stays on each
 * candidate so stale duplicate refs of the originating WU self-exclude by
 * identity instead of by path equality.
 *
 * @param entries - Oracle output (identity-filtered in-flight WUs and errands).
 * @returns The overlap roster the detection core consumes.
 */
export function projectInFlightToOverlapRoster(entries: readonly InFlightEntry[]): OverlapRoster {
  const projected: OverlapCandidateEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== "work-unit") continue;
    projected.push({
      branch: entry.remoteOnly ? `origin/${entry.branch}` : entry.branch,
      name: entry.name,
      ...(entry.worktreePath !== undefined ? { worktreePath: entry.worktreePath } : {}),
      ...(entry.worktreePath === undefined && !entry.remoteOnly ? { remoteOnly: false } : {}),
      metaFilePath: `.arc/active/meta-${entry.name}.md`,
      state: entry.state,
      ...(entry.marks !== undefined ? { marks: entry.marks } : {}),
      ...(entry.scheduling !== undefined ? { scheduling: entry.scheduling } : {}),
    });
  }
  return { entries: projected, warnings: [] };
}
