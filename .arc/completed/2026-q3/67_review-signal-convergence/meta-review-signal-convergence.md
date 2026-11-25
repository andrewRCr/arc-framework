# Metadata: review-signal-convergence

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `review-protocol-alignment`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-review-signal-convergence.md`
- **Task List:** `tasks-review-signal-convergence.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:4312fb74e385cd6c75ba7a27149cf8f08a2e26569c29a32815daeb8d244d4cf6`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.T — Admit private Candidate incremental correction review
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/714>
- **Completed:** 2026-09-26

---

## Release Notes Entry

Review decisions now use verified findings and durable evidence to determine when a pass is complete, when another
pass is useful, and when explicit approval is needed. Review results and correction coverage remain traceable across
local, frontline, and hosted review.

### Added

- Source-bound review results, clearer disposition reports, and exact incremental correction coverage where the
  reviewer can establish it. Operators can authorize additional named passes after convergence.

### Changed

- Review finding severity uses `critical`, `major`, and `minor`. Reports distinguish reviewer and ARC grades when
  they differ, show a shared grade when they agree, and display pass usage and the reason a review loop stopped.

### Fixed

- Pass-cap enforcement, review continuation after findings and fixes, and preservation of pass usage and the
  one-time frontline phase across an attested Candidate replacement.

## Completion Notes

Delivered one evidence-bound convergence path for local, frontline, and hosted review. Review admission and results
retain exact producer, target, pass, and coverage identity; approved dispositions preserve reported and verified
severity separately. The policy decision uses verified signal after triage, so a material finding cannot converge
merely because its response was recorded, while an adequately covered clean, all-refuted, or minors-only pass can.
Explicit Owner authority admits each additional pass, including after convergence and above the configured cap.

The work lands as one branch under the storage program's 2026-09-24 landing decision; the former delivery members
became review chunks. The design was amended to collapse equal grades in the displayed report and to permit separately
authorized post-convergence passes. Follow-up corrections preserved standard-pass usage and the one-time frontline
phase across validated Candidate supersession, and admitted exact private incremental review of an approved Candidate
correction before a PR exists. No old-target result was treated as new-target clearance.

The completed task criteria and terminal evidence are recorded in the task list and notes. The final source increment
passed the full Tier 3 gate (12,959 routine tests passed, one skipped), and all 616 E2E tests passed. A subsequent
authorized incremental review over the changed authority paths and seams returned clean; its durable local attestation
and reduction settled the pre-publication obligation before the draft PR opened.
