/**
 * Pre-computed top-of-Confirm-Handoff summary line.
 *
 * Pure helper: takes worktree state plus a context discriminator and returns
 * the workflow's `**Reconcile required:**` / `**Worktree:** N unpushed` line,
 * or `null` when nothing warrants a top-level surface. The Confirm Handoff
 * step renders the string verbatim instead of re-deriving it from a
 * state×context conditional matrix.
 *
 * @module
 */

import type { WorktreeSyncState } from "../git/worktree-sync.js";

/**
 * Context discriminator: did `arc sync` run, or was its auto-invoke skipped?
 *
 * - `sync-ran` — `syncInterlock.value === "on-handoff"` and identity present.
 *   The sync envelope's surface is limited to the `Reconcile required:` line
 *   for the diverged cell; other cells return `null` here (worktree-vs-remote
 *   surfaces are owned by sync's own output).
 * - `sync-skipped` — `syncInterlock.value === "manual"` or identity absent.
 *   The handoff probe envelope surfaces the diverged Reconcile line and the
 *   `Worktree:` unpushed-count line on `local-ahead`.
 */
export type HandoffSummaryContext = "sync-ran" | "sync-skipped";

export interface SummaryLineInput {
  context: HandoffSummaryContext;
  worktreeState: WorktreeSyncState;
  ahead: number;
  behind: number;
  branch: string | null;
  /**
   * Total unpushed commits to surface in `sync-skipped` context. Caller
   * computes per the formula `worktree.ahead + (1 if step 3 fired a chore
   * commit, else 0)`; the helper consumes the resolved number.
   */
  unpushedN: number;
}

export function inferRecommendedSummaryLine(input: SummaryLineInput): string | null {
  if (input.branch === null) return null;
  if (input.worktreeState === "diverged") {
    return composeReconcileLine(input.branch, input.ahead, input.behind);
  }
  if (input.context === "sync-skipped" && input.unpushedN > 0) {
    return composeUnpushedLine(input.branch, input.unpushedN);
  }
  return null;
}

function composeReconcileLine(branch: string, ahead: number, behind: number): string {
  return (
    `**Reconcile required:** \`${branch}\` diverged from \`origin/${branch}\` `
    + `(${ahead} ahead, ${behind} behind). Manual rebase or merge needed before pushing.`
  );
}

function composeUnpushedLine(branch: string, n: number): string {
  return `**Worktree:** ${n} unpushed commit(s) on \`${branch}\`.`;
}
