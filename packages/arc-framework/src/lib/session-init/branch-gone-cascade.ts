/**
 * Branch-gone recovery cascade — resolution logic.
 *
 * When a session opens on a branch whose upstream was deleted (the work shipped
 * elsewhere), session-init must point the operator somewhere: another in-flight
 * worktree, a recently-active remote branch, or `main`. This module is the pure
 * decision step. Given the candidate destinations gathered from the worktree
 * roster and from recent remote branches, it resolves to one of three outcomes:
 *
 * - `resolved` — exactly one candidate in the highest-priority non-empty tier;
 *   the workflow confirms and switches.
 * - `surface` — two or more candidates in that tier; the choice is ambiguous,
 *   so every candidate is surfaced for the operator to pick rather than guessed.
 * - `main-fallback` — no candidate in any tier; fall back to `main` with
 *   explicit confirmation.
 *
 * Tiers are consulted in confidence order: local in-flight worktrees first (the
 * strongest signal — a checked-out branch), then recently-active remote
 * branches. The first non-empty tier decides the outcome; lower tiers are not
 * consulted once a higher one yields. Pure — no git I/O; callers gather the
 * signals and pass them in.
 *
 * @module
 */

/** Proposed disposition for a recovery candidate's worktree. */
export type CandidateAction = "switch" | "offer-remove" | "advisory";

/** A recovery destination the cascade can resolve to. */
export interface CascadeCandidate {
  /** Branch to recover onto. */
  branch: string;
  /**
   * Local worktree path when the candidate is a checked-out worktree; absent
   * for a candidate sourced from a recent remote branch with no local worktree.
   */
  worktreePath?: string;
  /** Proposed action for this candidate's worktree. */
  proposedAction: CandidateAction;
}

/** Outcome of the recovery cascade. */
export type CascadeResolution =
  | { kind: "resolved"; candidate: CascadeCandidate }
  | { kind: "surface"; candidates: CascadeCandidate[] }
  | { kind: "main-fallback" };

/** Candidate tiers, supplied in confidence order. */
export interface ResolveCascadeInput {
  /**
   * Strongest tier: in-flight worktrees from the roster (identity-filtered,
   * with the branch-gone worktree itself excluded).
   */
  worktreeCandidates: CascadeCandidate[];
  /**
   * Fallback tier: recently-active remote branches within the recency window
   * (with the gone branch and any branch already represented in
   * `worktreeCandidates` excluded).
   */
  recentBranchCandidates: CascadeCandidate[];
}

/**
 * Resolve the recovery cascade. Walks the candidate tiers in confidence order
 * and stops at the first non-empty one: a lone candidate resolves; two or more
 * surface for an explicit choice. When every tier is empty, falls back to
 * `main`.
 *
 * @param input - Candidate tiers in confidence order
 * @returns The resolved outcome
 */
export function resolveCascade(input: ResolveCascadeInput): CascadeResolution {
  for (const tier of [input.worktreeCandidates, input.recentBranchCandidates]) {
    const resolution = resolveTier(tier);
    if (resolution !== null) return resolution;
  }
  return { kind: "main-fallback" };
}

/**
 * Resolve a single tier: `null` when empty (the caller falls through to the
 * next tier), a `resolved` outcome for a lone candidate, or `surface` when the
 * tier is ambiguous.
 */
function resolveTier(candidates: CascadeCandidate[]): CascadeResolution | null {
  if (candidates.length === 0) return null;
  const [first] = candidates;
  if (candidates.length === 1 && first !== undefined) {
    return { kind: "resolved", candidate: first };
  }
  return { kind: "surface", candidates };
}
