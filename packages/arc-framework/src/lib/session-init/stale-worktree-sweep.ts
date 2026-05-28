/**
 * Stale-worktree sweep — candidate enumeration.
 *
 * Anchored at the main (primary) worktree, the sweep cross-references the
 * in-flight worktree roster against the `completed/` archive and surfaces every
 * lingering worktree whose WU has already shipped — closing the
 * spawn-on-A / integrate-on-B / never-reopen-A's-worktree gap. Outside the
 * primary worktree (the resume-a-WU path) it returns nothing, so the common
 * resume path never pays for a sibling scan.
 *
 * {@link findStaleWorktreeCandidates} selects *which* worktrees are shipped-WU
 * candidates; {@link runStaleWorktreeSweep} then gathers each candidate's
 * marker / clean / merged signals and maps them through the shared cleanup
 * decision (removable / blocked / external) — worktrees are only ever
 * surfaced, never auto-removed without the marker-gated clean-and-merged guard.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import {
  decideWorktreeCleanup,
  isBranchMerged,
  isWorktreeClean,
  type WorktreeCleanupDecision,
} from "../git/worktree-cleanup.js";
import { readWorktreeMarker, type WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import type { WorktreeIdentity } from "../git/worktree-identity.js";
import type {
  WorktreeRosterEntry,
  WorktreeRosterResult,
} from "../git/worktree-roster.js";
import { isShippedWorkUnit, readShippedWorkUnits, type CompletedIndexFs } from "../work-unit/completed-index.js";

export interface StaleWorktreeSweepInput {
  /** Identity-filtered in-flight worktree roster (reused from the session-init roster slot). */
  roster: WorktreeRosterResult;
  /** Shipped WU-name slugs from `readShippedWorkUnits`. */
  shipped: ReadonlySet<string>;
  /** Physical-worktree identity of the session — the sweep runs only when `primary`. */
  worktreeIdentity: WorktreeIdentity;
}

export interface StaleWorktreeCandidatesResult {
  /** Roster entries whose WU has shipped — lingering worktrees to surface for cleanup. */
  candidates: WorktreeRosterEntry[];
  /** Roster warnings, passed through untouched. */
  warnings: string[];
}

/**
 * Select the lingering shipped-WU worktrees from the roster.
 *
 * Returns no candidates when the session is not in the primary worktree: the
 * sweep is a main-worktree-only check, so a linked-worktree (resume) session
 * never scans its siblings.
 *
 * @param input - Roster, shipped-WU set, and the session's worktree identity
 * @returns The shipped-WU candidate worktrees plus passed-through warnings
 */
export function findStaleWorktreeCandidates(
  input: StaleWorktreeSweepInput,
): StaleWorktreeCandidatesResult {
  const { roster, shipped, worktreeIdentity } = input;
  if (worktreeIdentity.kind !== "primary") {
    return { candidates: [], warnings: roster.warnings };
  }
  return {
    candidates: roster.entries.filter((entry) => isShippedWorkUnit(entry.branch, shipped)),
    warnings: roster.warnings,
  };
}

/** One swept worktree paired with its marker-gated cleanup disposition. */
export interface StaleWorktreeReport {
  worktreePath: string;
  branch: string;
  /** Removability state: `removable` only when ARC-marked, clean, and merged. */
  decision: WorktreeCleanupDecision;
}

export interface StaleWorktreeSweepResult {
  /** Lingering shipped-WU worktrees, each with its cleanup disposition. */
  worktrees: StaleWorktreeReport[];
  /** Roster warnings, passed through untouched. */
  warnings: string[];
}

export interface RunStaleWorktreeSweepOptions {
  /** Identity-filtered in-flight worktree roster (reused from the session-init roster slot). */
  roster: WorktreeRosterResult;
  /** Physical-worktree identity — the sweep runs only when `primary`. */
  worktreeIdentity: WorktreeIdentity;
  /** Main-worktree checkout root containing `.arc/completed/`. */
  cwd: string;
  /** Integration base branch short-name (e.g. `main`); the merged check targets `origin/<base>`. */
  baseBranch: string;
  exec: GitExec;
  /** Reads `.arc/completed/` for the shipped-WU set; injected for testability. */
  fs: CompletedIndexFs;
  /** Reads a worktree's ownership marker; injected for testability. */
  readMarker?: (worktreePath: string) => Promise<WorktreeMarkerReadResult>;
}

/**
 * Run the stale-worktree sweep: read the shipped-WU set, select the lingering
 * shipped-WU worktrees, and resolve each one's marker-gated cleanup decision.
 *
 * Outside the primary worktree the candidate set is empty, so no per-worktree
 * signals are gathered and the result carries no worktrees.
 *
 * @param options - Roster, identity, repo root, base branch, and I/O bindings
 * @returns The swept worktrees with cleanup dispositions, plus warnings
 */
export async function runStaleWorktreeSweep(
  options: RunStaleWorktreeSweepOptions,
): Promise<StaleWorktreeSweepResult> {
  const { roster, worktreeIdentity, cwd, baseBranch, exec, fs } = options;
  const readMarker = options.readMarker ?? readWorktreeMarker;
  const integrationTarget = `origin/${baseBranch}`;

  const shipped = await readShippedWorkUnits({ cwd, fs });
  const { candidates, warnings } = findStaleWorktreeCandidates({ roster, shipped, worktreeIdentity });

  const worktrees = await Promise.all(
    candidates.map(async (entry) => {
      const [marker, clean, merged] = await Promise.all([
        readMarker(entry.worktreePath),
        isWorktreeClean({ exec, cwd: entry.worktreePath }),
        isBranchMerged({ exec, branch: entry.branch, target: integrationTarget }),
      ]);
      return {
        worktreePath: entry.worktreePath,
        branch: entry.branch,
        decision: decideWorktreeCleanup({ marker, clean, merged, context: "shipped" }),
      };
    }),
  );

  return { worktrees, warnings };
}
