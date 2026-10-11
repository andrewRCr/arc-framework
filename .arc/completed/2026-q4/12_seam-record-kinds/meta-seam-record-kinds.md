# Metadata: Seam Record Kinds

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-seam`
- **Depends On:** [none]

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09)
- **Design:** `spec-seam-record-kinds.md`
- **Task List:** `tasks-seam-record-kinds.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:0f7ce9ec6fe0b7e123f68d91dd2ea8c260668860b5e3b5233eb9597c02d0a604`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/893>
- **Completed:** 2026-10-11

## Release Notes Entry

Stored work-item, design, lineage, and cohort records now share registered parsers, typed field writers, and reusable
integrity checks.

### Added

- Reusable record checks report stable rule identifiers and validate related records together.

### Changed

- Record reads and listings decode through the kind registry.
- Lineage records use schema version 2, and cohort Parent parsing accepts omitted and empty values consistently.

### Fixed

- Metadata field updates preserve unrelated sections and CRLF line endings; clearing optional fields removes their
  readable values.
- Task-list header parsing stops at every admitted phase heading.

## Completion Notes

Delivered the shared record interfaces for metadata, task lists, design documents, lineage, and cohorts: registered
parsers and parsed schemas, typed field writers with field ownership, and reusable write checks with stable diagnostics
and batch-aware views. In-repository reads and listings use the registry; write checks remain callable without changing
that backend’s pre-cutover admission behavior. Lineage producers and consumers use the new shape, and tracked records
were converted where required.

The approved amendments narrowed helper import boundaries and allowed the specific legacy setter corrections for CRLF
metadata, Candidate removal, and Branch clearing. These preserve unrelated bytes and sections. Prepublication review
fixes also aligned tolerant task header boundaries and Session Context clearing with the readers’ admitted forms.

All task success criteria were verified against merged base `930101bff`. The final forced local merge gate passed all
16 selected checks, including both type checks, full build, unit and integration tests, and ARC contracts. Repository
listing probes and runtime import-closure checks passed. Seven final regression cases failed before the corrections and
passed afterward; the focused suites passed all 29 cases. CI supplies the remaining E2E and platform portability legs.

Independent chunked review covered the full change set in the first standard pass and the correction range in the
second, each with dedicated seam and aggregate evaluation. Approved fixes and the rejected record-marker finding were
recorded through the review response protocol. The final standard terminus is Owner-accepted after two passes; it is
accepted residual risk, not an evaluator-clean result.

---
