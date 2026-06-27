/**
 * Shared phrasing for the "this note's commit isn't on the current branch's
 * history" case — surfaced identically by the load summary, the session-init
 * freshness line, and `arc user status`. Names the branch HEAD is on (the
 * recognizable anchor) and states the benign cause, replacing the opaque
 * "outside current HEAD ancestry" plumbing phrasing.
 *
 * @module
 */

/**
 * The "off the current branch's history" clause, beginning `not in …`. Callers
 * supply their own lead-in (`Latest local user note is from <hash>, ` or
 * `This note is `).
 *
 * @param currentBranch - The branch HEAD is on, or `null` on a detached HEAD.
 * @param historyDetail - Optional trailing qualifier inserted after "history"
 *   (e.g. ` (2 note update(s) back)`); empty by default.
 * @returns The clause naming the branch and the benign cause.
 */
export function noteOffBranchHistoryClause(
  currentBranch: string | null,
  historyDetail = "",
): string {
  const where = currentBranch === null
    ? "this checkout's history (detached HEAD)"
    : `branch \`${currentBranch}\`'s history`;
  return (
    `not in ${where}${historyDetail} — expected when the work was ` +
    "continued or integrated on another branch or machine"
  );
}
