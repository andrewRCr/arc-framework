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

import type { LifecycleIndex, LifecycleIndexEntry } from "./lifecycle-index.js";

/**
 * The index entries whose `**Cohort:**` field resolves to `cohort` — the
 * single-cohort membership filter both single-cohort projections build on.
 * Keys on the field value, so a member is matched regardless of the directory
 * it is filed under.
 */
function cohortMembers(index: LifecycleIndex, cohort: string): LifecycleIndexEntry[] {
  const members: LifecycleIndexEntry[] = [];
  for (const entry of index.values()) {
    if (entry.cohort === cohort) members.push(entry);
  }
  return members;
}

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
  return new Set(cohortMembers(index, cohort).map((entry) => entry.slug));
}

/**
 * Whether a cohort's archival trigger has fired — its **last member has
 * shipped**, i.e. the cohort has at least one member and **no** member remains
 * outside `completed/`. Location-dominant, like the rest of the resolution path:
 * a member physically under `completed/` counts as shipped even if its meta
 * `**State:**` still trails. An empty membership set is `false` — no last member
 * to trip.
 *
 * Detection only: the `archive` fire-point that sweeps the cohort doc to
 * `completed/` on this signal lives in `lifecycle-transition-core`.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param cohort - The cohort path to test.
 * @returns Whether every member of a non-empty cohort has shipped.
 */
export function isArchivalTriggered(index: LifecycleIndex, cohort: string): boolean {
  const members = cohortMembers(index, cohort);
  return members.length > 0 && members.every((entry) => entry.location === "completed");
}

/**
 * The index entries that belong to `cohort` **transitively** — its direct
 * members (`**Cohort:**` equals `cohort`) plus the members of any subcohort
 * nested beneath it (`**Cohort:**` begins with `cohort/`). The trailing-slash
 * prefix keeps a sibling that merely shares a textual prefix (`cohort-other`)
 * out of the set. Bounded by the two-segment cohort-path cap, so the walk reaches
 * one level of subcohort — the full descendant set of a nested-parent cohort.
 */
function cohortMembersWithDescendants(index: LifecycleIndex, cohort: string): LifecycleIndexEntry[] {
  const prefix = `${cohort}/`;
  const members: LifecycleIndexEntry[] = [];
  for (const entry of index.values()) {
    if (entry.cohort === null) continue;
    if (entry.cohort === cohort || entry.cohort.startsWith(prefix)) members.push(entry);
  }
  return members;
}

/**
 * Whether a (possibly nested-parent) cohort's archival trigger has fired,
 * counting descendants transitively: a nested parent is complete only when
 * **every** direct member *and* every subcohort member has shipped. The
 * location-dominant, non-empty-set semantics match {@link isArchivalTriggered};
 * for a leaf cohort with no subcohorts the two are identical (the descendant set
 * collapses to the direct members). A pure container with only subcohorts (no
 * direct members) still trips once its subcohorts ship.
 *
 * This is the trigger the nested-parent archival cascade reads — both the leaf
 * sidecar sweep (so a parent doc is never swept while a subcohort lingers) and
 * the `{NN}b` parent-doc sweep.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param cohort - The cohort path to test (typically a nested-parent segment).
 * @returns Whether every transitive member of a non-empty cohort has shipped.
 */
export function isArchivalTriggeredWithDescendants(index: LifecycleIndex, cohort: string): boolean {
  const members = cohortMembersWithDescendants(index, cohort);
  return members.length > 0 && members.every((entry) => entry.location === "completed");
}
