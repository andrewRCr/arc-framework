# Draft: Cohort Reference Resolution

- **State:** Provisional — captured for deliberate design before commitment.
- **Origin:** [internal] — `arc wu reconcile` reported a live cohort name as a retired work-unit reference.
- **Purpose:** Make reference reconciliation distinguish live cohort identities from retired work-unit subjects so
  its advisory dispositions do not tell operators to remove or retarget valid cohort coordination prose.

---

## Problem

`arc wu reconcile` derives narrative subjects from authenticated work-unit retirement history. When the same slug
also names a live cohort, the planner currently treats every matching prose occurrence as a retired work-unit
reference. A live reference to `review-protocol-alignment` was therefore reported as
`remove-or-retarget` even though the surrounding sentence explicitly called it a cohort and current member metas
still resolve that cohort.

The advisory is non-mutating, but it is the correctness surface an operator relies on when deciding whether tracked
planning prose is stale. A false positive forces the operator to reconstruct namespace state manually and recurs for
any coordination artifact that names a cohort sharing a retired work-unit slug.

## Design Questions

1. Should the reconcile planner receive the lifecycle index's live cohort identities and emit a distinct cohort
   disposition, suppress the retirement disposition, or preserve an ambiguity advisory when both namespaces match?
2. Is cohort resolution local to reconciliation, or should `arc status` gain cohort-slug resolution without weakening
   its existing work-unit contract?
3. How should nested cohort paths and leaf-name collisions be represented so a convenient leaf match never outranks
   canonical cohort identity?

## Scope

- Extend the reference-reconcile input with authoritative cohort identity facts rather than inferring from paths.
- Preserve authenticated retirement-history authority for work-unit rename, decomposition, and removal transitions.
- Cover live-cohort-only, retired-WU-only, namespace-collision, nested-cohort, and absent-subject cases.
- Keep mechanical artifact rewrites limited to uniquely authorized work-unit renames.

## Out of Scope

- Broadening `arc status` to cohorts unless the design establishes that as the coherent shared resolver boundary.
- Guessing intent from arbitrary prose without authoritative namespace facts.
- Changing retirement receipt schemas.
