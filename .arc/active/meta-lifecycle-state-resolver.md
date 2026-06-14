# Metadata: lifecycle-state-resolver

| **State**     | **Owner** | **Branch**                      | **Class** | **Priority** |
|---------------|-----------|---------------------------------|-----------|--------------|
| `Integrating` | `andrew`  | `feat/lifecycle-state-resolver` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-lifecycle-state-resolver.md`
- **Task List:** `tasks-lifecycle-state-resolver.md`

- **Last Completed:** Task 5.1 — verification complete; integration PR #99 opened
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Continue integrate-work-unit — address PR #99 review feedback, then await merge.

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/99>
- **Completed:** 2026-06-14

---

## Release Notes Entry

ARC now has a deterministic lifecycle-state read surface for work units: `arc status --lifecycle <slug>` reports
where a work unit is in the lifecycle, including whether it is currently occupying active work, whether it has
shipped, and which dependencies have landed.

### Added

- `arc status --lifecycle <slug>` with text and JSON output for the resolved lifecycle state, `(phase, location)`
  pair, occupancy, shipped status, and dependency landed reads.
- A lifecycle-complete work-unit index over `backlog/provisional/`, `backlog/planned/`, `active/`, and
  `completed/`, shared by state, dependency, and cohort-membership projections.
- Cohort-membership and final-member archival-trigger resolver primitives over the shared lifecycle index.

### Fixed

- Cohort-consistency validation now uses lifecycle-complete membership context, so a member that has activated or
  shipped is distinguished from a removed member when checking cohort-doc member sections.
- Lifecycle location parsing is anchored to the top-level `.arc` lifecycle tier, so nested directory names such
  as `completed` do not override the containing work-unit location.

## Completion Notes

Landed the read-side lifecycle substrate for the lifecycle-state-machine cohort. The implementation establishes
the `(phase, location)` pair model, a build-once lifecycle index, the derived slug-state enum, curated
`occupied` / `shipped` predicates, dependency landed-state reads, cohort membership, and final-member archival
detection. The queryable surface is currently `arc status --lifecycle <slug>`; the pure query aggregator is kept
thin so `lifecycle-transition-core` can relocate the CLI shell into the eventual lifecycle verb group without
changing the JSON shape.

Review sharpened two edges: lifecycle location resolution now anchors on the top-level `.arc` tier rather than
substring order, and the cohort validator's live disk context includes provisional metas as membership context
when they already declare a cohort. The latter does not make provisional files part of staged cohort-structure
validation; it only prevents field-derived membership from going blind to modeled provisional cohort members.

Verification: Tier 3 gates passed before PR (`lint:md`, `lint:ts`, `lint:sh`, `typecheck:all`, `build`, and full
`npm test`), and the review-fix pass reran targeted markdown lint, TypeScript lint, focused unit tests, full unit
tests, and `typecheck:all`.
