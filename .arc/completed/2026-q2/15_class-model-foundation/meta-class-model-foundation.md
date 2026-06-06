# Metadata: Class Model Foundation

| **State**     | **Owner** | **Branch**                    | **Class** | **Priority** |
| ------------- | --------- | ----------------------------- | --------- | ------------ |
| `Shipped`     | `andrew`  | `feat/class-model-foundation` | `Novel`   | `P1`         |

- **Cohort:** `principle-anchored-core/agile-wu-lifecycle`
- **Depends On:** `worktree-foundation`

- **Origin:** [internal]
- **Design:** `spec-class-model-foundation.md`
- **Task List:** `tasks-class-model-foundation.md`

- **Last Completed:** Task 6.1 — full verification complete; success criteria met and gates passed
- **Next Task:** integrate-work-unit Step 1 — verify completion
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/59>
- **Completed:** 2026-06-06

---

## Release Notes Entry

ARC now records a work unit's weight with a three-value `Class` model and uses that signal across planning,
status, and review surfaces while keeping execution discipline invariant.

### Added

- A `Class` field for work-unit metadata with `Light`, `Heavy`, `Novel`, and `[TBD]` states, rendered in the
  core metadata table.
- A reusable classification method with boundary tests for Errand vs. work unit, derivation, scale, and
  invent-vs-compose novelty.
- A planned-entry graduation workflow that forces a best-estimate `Class` before a work unit becomes ready to
  start.
- Status support for class composition and class-aware user views.
- Path-valued `Cohort` metadata with a two-segment cap and leaf rendering in readiness/status tables.

### Changed

- Work-unit metadata now renders through a structured core table plus ordered field groups, with shared parsing
  across status, worktree, and validation consumers.
- `Design` metadata now points at ARC-owned planning artifacts by lifecycle state, with external origins kept in
  `Origin`.
- The work-organization strategy, classification method, templates, and agent brief now describe scaled ceremony
  through `Light`, `Heavy`, and `Novel`.
- Existing active and backlog work-unit metadata was migrated to the new format and stamped with best-estimate
  classes.

### Removed

- Retired stale tier/atomic-tier framing from the class model surfaces; atomic remains a work character below the
  work-unit wrapper.

### Fixed

- Malformed or narrative markdown tables no longer confuse core metadata parsing.
- Malformed remote metadata no longer appears as ownerless in-flight work.
- Worktree roster warnings are preserved when malformed peer metadata appears beside valid work-unit metadata.

## Completion Notes

Class Model Foundation shipped the constitutional and schema foundation for scaled work-unit ceremony. The final
model is three-valued: `Light`, `Heavy`, and `Novel`, with `Novel` added during the work unit after the backlog
dogfood pass showed that a flat `Heavy` band lost the plate-balancing signal at the top of the derivation axis.

The shipped contract spans the always-loaded surfaces, the on-demand classification method, the work
organization strategy, ADR-023, the metadata template, the planned-entry graduation workflow, the status views,
and the active/backlog metadata corpus. It also codifies the relocatability invariant and path-valued `Cohort`
schema that sibling work units consume.

Implementation centered on one shared metadata reader/renderer: core metadata now has a table-backed render,
legacy bullets remain parseable, and consumers that read active, ready, in-flight, worktree, and validation state
route through the shared parser. Review iteration hardened that foundation further by constraining table parsing
to the core block, skipping malformed remote metas in in-flight derivation, and preserving malformed peer
warnings in the worktree roster.

Verification passed before PR creation with the full Tier 3 gate set: typecheck, TypeScript lint, shell lint,
markdown lint, build, test suite, and ARC audits. PR review then produced local and GitHub CodeRabbit findings;
all accepted findings were fixed, the one rejected thread was resolved with rationale, and the final PR state had
green CI, passing CodeRabbit, and zero unresolved review threads.
