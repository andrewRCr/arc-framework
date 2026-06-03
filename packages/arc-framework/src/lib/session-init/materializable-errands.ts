/**
 * Materializable-errand detection — filtering the oracle's in-flight entries to
 * the remote-only `chore/` errands, the cross-machine resumes session-init's
 * Materialize arm offers.
 *
 * An errand handed off mid-flight is a pushed `chore/<slug>` branch. On another
 * machine it exists only on the remote — no local worktree — so the oracle marks
 * it `remoteOnly`; session-init fetches it (`git worktree add`) and resumes via
 * run-errand. A `chore/` branch already checked out here is a resume (the resume
 * probe), not a materialize; one with a backing meta is a work unit (the oracle
 * classifies it as such, so it never reaches here as an errand).
 *
 * Pure core over the oracle's output ({@link InFlightEntry}) — mirrors
 * {@link findMaterializableWorkUnits}; no git coupling. Errands carry no owner,
 * so unlike the WU filter there is no identity gate.
 *
 * @module
 */

import type { InFlightEntry } from "../git/in-flight-derivation.js";

/** One remote errand branch that can be materialized. */
export interface MaterializableErrand {
  /** The `<slug>` after `chore/`. */
  slug: string;
  /** The remote `chore/<slug>` branch name. */
  branch: string;
}

export interface FindMaterializableErrandsOptions {
  /** Oracle-derived in-flight entries (work units and errands). */
  entries: readonly InFlightEntry[];
}

export interface MaterializableErrandsResult {
  /** Remote-only `chore/` errands materializable as cross-machine resumes. */
  candidates: MaterializableErrand[];
}

/**
 * Select the materializable errands from the oracle's in-flight entries.
 *
 * An entry qualifies when it is an errand (a `chore/<slug>` branch with no
 * backing meta) in flight only on the remote (no local worktree — not already
 * resumable here). Work units are never errand candidates.
 *
 * @param options - The oracle's in-flight entries.
 * @returns The remote-only materializable errands.
 */
export function findMaterializableErrands(
  options: FindMaterializableErrandsOptions,
): MaterializableErrandsResult {
  const candidates: MaterializableErrand[] = [];
  for (const entry of options.entries) {
    if (entry.kind !== "errand") continue;
    if (!entry.remoteOnly) continue;
    candidates.push({ slug: entry.slug, branch: entry.branch });
  }
  return { candidates };
}
