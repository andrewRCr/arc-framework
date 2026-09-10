# Metadata: plan-segmentation

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-plan-segmentation.md`
- **Task List:** `tasks-plan-segmentation.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:a5135bc231326dccca478e1c452ee626dc9ade78808e610619de2ef8a22aae9b`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — Complete verification — D1–D13
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/580>
- **Completed:** 2026-09-09

## Release Notes Entry

ARC task planning now records contiguous segments that close on a stated kind of progress, keeping planning
structure distinct from review chunks and delivery members. Task generation resolves segment shape from residual
risk, and task-list validation enforces the recorded structure at both local authoring gates.

### Added

- `slice`, `layer`, and `replication` segment modes, with phase-preamble mode and exit-criterion declarations and a
  segment/member/work-unit verification family.
- A pure task-list segmentation scan with source-located diagnostics for malformed declarations, uncovered or
  overlapping phases, invalid verifier placement, segmented terminal phases, and unresolved retirement references.
- Segment-scoped delivery task typing and compatibility coverage across structural scans, cursor and tally analysis,
  delivery inventory, and compaction-seed emission.

### Changed

- Task generation now chooses and orders segments from the dominant residual risk, records exit criteria, assigns
  mandatory lifecycle outcomes, and requires boundary-appropriate verification tasks.
- Test-first work groups by behavior path, substrate concern, or repeatable batch according to segment mode;
  incidentally passing behaviors retain behavioral reconstruct-and-revert evidence.
- Task-list guidance, templates, and orientation vocabulary now carry the same segmentation grammar and boundary
  distinctions.

### Fixed

- Execution-time testing standards now install as a configurable method rather than remaining a dangling workflow
  dependency.
- Nested subtask retirement references retain their actual owning subtask, and exit-only declarations activate the
  segmentation diagnostics needed to report orphaned, empty, or duplicate criteria.

## Completion Notes

Delivered the complete segmentation model across task generation, task-list doctrine and templates, structural
validation, delivery task typing, and consumer compatibility. Plans can mix `slice`, `layer`, and `replication`
segments while keeping segment boundaries independent of review and merge topology; the first-party scanner emits a
closed diagnostic family at both staged-index and worktree authoring gates.

The accepted forward amendment makes an exact phase-preamble `_Exit criterion:_` declaration an independent
presence trigger, keeping exit-only errors reachable without changing legacy unsegmented lists. Review also exposed
and corrected nested-subtask ownership for retirement references. No new compatibility layer, delivery-member
derivation, or automated judgment mechanism was added.

All 14 success criteria are met. Both delivery-member reports replayed against the corrected private chain, and the
cross-member seam and complete union remained coherent. Final verification passed Markdown and ARC contract lint,
TypeScript and shell lint, both typechecks, the production build, and 11,576 tests across 869 passing files with one
intentional skipped file and test; the final documentation correction then passed its targeted Markdown and ARC
contract checks.

---
