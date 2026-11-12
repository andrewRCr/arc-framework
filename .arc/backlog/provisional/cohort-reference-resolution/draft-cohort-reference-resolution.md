# Draft: Cohort Reference Resolution

- **State:** Provisional — captured for deliberate design before commitment.
- **Origin:** [internal] — `arc wu reconcile` reported a live cohort name as a retired work-unit reference.
- **Purpose:** Make reference reconciliation distinguish live cohort identities from retired work-unit subjects so
  its advisory dispositions do not tell operators to remove or retarget valid cohort coordination prose.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Let a completed cohort's name be reused once membership tells cohort generations apart**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ Design Question 3: canonical cohort identity over name matches.

- _Observation:_ contract D2 makes every owner's name, cohorts included, "reusable once its record completes"
  (`spec-storage-contract.md` D2), but decomposition, the only path that creates a cohort, refuses a completed cohort's
  name for a new one (`checkNamespaceName`, `lib/decompose/check-names.ts`), and `cohort-identity-verbs`' cohort rename
  refuses any slug the lookup resolves, ended holders included. The refusals protect correctness: membership names its
  cohort by path and readers match it as text (`lib/decompose/removal-cohorts.ts`, `lib/store/kinds/cohort/rules.ts`,
  the placement in `lib/store/lifecycle-write.ts`, `lib/work-unit/lifecycle-membership.ts`), so a completed cohort's
  members would read as members of a cohort reusing its name. Nothing needs cohort-name reuse today.

- _Approach:_ membership names its cohort by identity, as contract D2's machine records reference each other by UID, or
  its readers tell cohort generations apart; then cohort-name admission relaxes to live holders, as
  `lifecycle-slug-selection` D5's shared check admits work-item names.

- _Related:_ `work-item-relations` records cohort relations as typed data. If membership becomes one of its relations,
  the identity binding belongs with that decision (its buffer's "Decide whether typed relations bind their endpoint by
  UID").

- _Captured during:_ `lifecycle-slug-selection` draft-design, 2026-10-22.

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
