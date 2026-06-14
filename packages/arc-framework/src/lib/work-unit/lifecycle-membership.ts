/**
 * Projection B — the lifecycle-complete cohort-membership resolver.
 *
 * The second projection over the lifecycle-complete index: it groups the index
 * by each entry's `**Cohort:**` field value, yielding the set of member slugs for
 * any cohort path across **every** lifecycle state (`backlog/`, `active/`,
 * `completed/`). Membership keys on the field value, never on the filed
 * directory, so a member that has graduated out of `backlog/planned/` (now flat
 * in `active/`) or shipped (now under `completed/`) still resolves to its cohort.
 * That is the property that lets a cohort doc tell a **graduated** member from a
 * **removed** one — the false-orphan flag has a real membership set to test
 * against, not a co-located-directory snapshot.
 *
 * This is the one membership source: the position-independent semantics the
 * cohort-consistency validator's live-context walk reproduces today, now sourced
 * from the shared index rather than a second tree scan.
 *
 * @module
 */

import type { LifecycleIndex } from "./lifecycle-index.js";

/**
 * Group the index by `**Cohort:**` field value — cohort path → member slugs.
 * Standalone work units (a `null` cohort) contribute no key. The map is built
 * fresh per call; it is the position-independent membership projection the
 * cohort-consistency live context consumes.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @returns A fresh map from cohort path to the set of member slugs.
 */
export function buildCohortMembership(index: LifecycleIndex): Map<string, Set<string>> {
  const byCohort = new Map<string, Set<string>>();
  for (const { slug, cohort } of index.values()) {
    if (cohort === null) continue;
    const members = byCohort.get(cohort) ?? new Set<string>();
    members.add(slug);
    byCohort.set(cohort, members);
  }
  return byCohort;
}

/**
 * Resolve the set of member slugs for one cohort path — the work units whose
 * `**Cohort:**` field resolves to `cohort`, across every lifecycle state. Returns
 * a fresh (possibly empty) set; an unknown cohort yields the empty set.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param cohort - The cohort path to resolve membership for.
 * @returns The member slugs, or an empty set when the cohort has no members.
 */
export function resolveCohortMembers(index: LifecycleIndex, cohort: string): Set<string> {
  return buildCohortMembership(index).get(cohort) ?? new Set<string>();
}
