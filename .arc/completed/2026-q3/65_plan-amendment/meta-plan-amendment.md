# Metadata: plan-amendment

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-plan-amendment.md`
- **Task List:** `tasks-plan-amendment.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:7d825579cc201906ceaf2d815cdbfa46d2f81f010e4f7bc387025d683587be4f`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/710>
- **Completed:** 2026-09-24

## Release Notes Entry

ARC now provides one scoped procedure for design gaps found during implementation. It classifies the gap against the
current design, records the amendment once, places corrective work beside the affected work, and closes by re-running
the check that exposed it.

### Added

- An amendment workflow and skill entry point for gaps found during task execution, verification, audits, and review.
- A reusable planning-segmentation method for revision work that adds a new segment.

### Changed

- Amendment logs, task-list revision numbering, placement guidance, and spec templates now share one record shape.
- Criteria reports compose ordered amendment deltas, including identity inherited from an earlier delta.
- Workflow method declarations now follow the method each workflow body invokes directly.

### Fixed

- Meta-reference checks accept numbered revision task IDs and method filenames that contain artifact prefixes.

## Completion Notes

The amendment procedure now carries the entry decision, depth-scaled assurance, footprint sweep, revision placement,
and per-site closing checks. Its skill door and the five detection sites route into the same procedure. The task-list
and spec conventions, criteria-delta composition, reusable segmentation method, install recipe, and project/package
copies were completed together. The existing log records the shared corrective parent used by two related historical
amendments; the forward rule now states one parent per amendment.

The terminal verification record marked all 15 written success criteria met. The final review-fix head passed
Markdown and ARC contract lint, TypeScript and shell lint, both typechecks, 12,155 tests with one skipped, and the
build. Two hosted CodeRabbit passes produced eight findings; the approved fixes were applied and all eight threads
resolved. The pre-existing fresh-install gap for `reopen-work-unit` was deferred to `adopter-install-authority`'s
shipped-but-uninstalled file entry.

---
