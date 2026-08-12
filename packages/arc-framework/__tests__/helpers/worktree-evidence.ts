/**
 * Shared worktree state → remote-evidence qualification for test fixtures.
 *
 * The producer qualifies every worktree reading, so a fixture built from the
 * unqualified `runWorktreeSyncStatus` shape has to add the qualifier itself. Doing
 * that inline meant the state lists were restated per test file, and they must stay
 * in step with `exactStates` / `inapplicableStates` in
 * `src/commands/status/schema.ts` — a state missing from a local copy silently
 * qualifies as `exact` and passes a fixture the producer cannot emit.
 *
 * `remote-unavailable` is deliberately not covered: it admits `exact`,
 * `pending-fetch`, and `unreachable` with different required shapes, so each caller
 * states which reading its fixture represents rather than inheriting a default.
 */

/** States that resolve before any snapshot evidence is consulted. */
export const INAPPLICABLE_WORKTREE_STATES: readonly string[] = [
  "skipped",
  "no-upstream",
  "detached-head",
  "no-remote",
];

/**
 * Qualify one worktree state that is not `remote-unavailable`.
 *
 * @param state - Worktree sync state to qualify.
 * @returns `not-applicable` for the pre-evidence arms, `exact` otherwise.
 */
export function worktreeStateEvidence(state: string): "not-applicable" | "exact" {
  return INAPPLICABLE_WORKTREE_STATES.includes(state) ? "not-applicable" : "exact";
}
