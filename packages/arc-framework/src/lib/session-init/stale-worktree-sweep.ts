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
 * This stage selects *which* worktrees are shipped-WU candidates; the
 * marker-gated cleanup decision (offer-remove / surface / advisory) is applied
 * by the surfacing layer over these candidates.
 *
 * @module
 */

import type { WorktreeIdentity } from "../git/worktree-identity.js";
import type {
  WorktreeRosterEntry,
  WorktreeRosterResult,
} from "../git/worktree-roster.js";
import { isShippedWorkUnit } from "../work-unit/completed-index.js";

export interface StaleWorktreeSweepInput {
  /** Identity-filtered in-flight worktree roster (reused from the session-init roster slot). */
  roster: WorktreeRosterResult;
  /** Shipped WU-name slugs from `readShippedWorkUnits`. */
  shipped: ReadonlySet<string>;
  /** Physical-worktree identity of the session — the sweep runs only when `primary`. */
  worktreeIdentity: WorktreeIdentity;
}

export interface StaleWorktreeSweepResult {
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
): StaleWorktreeSweepResult {
  const { roster, shipped, worktreeIdentity } = input;
  if (worktreeIdentity.kind !== "primary") {
    return { candidates: [], warnings: roster.warnings };
  }
  return {
    candidates: roster.entries.filter((entry) => isShippedWorkUnit(entry.branch, shipped)),
    warnings: roster.warnings,
  };
}
