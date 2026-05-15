# Status: Work Organization Reform

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/work-organization-reform

- **Spec:** `prd-work-organization-reform.md`
- **Task List:** `tasks-work-organization-reform.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Tasks 3.1 + 3.7 (deferred range) — `integrate-planning-branch.md` workflow
  retired (+ manifest + init-recipe inventory fixup); `review.planning_checkpoint` config key
  added across yaml × 2 + CLI types/validator + shell validator × 2 + test fixtures. Two adjacent
  design corrections landed mid-execution: `archive.cadence` enum narrowed to
  `with-integration | manual` (deferred value retired as redundant with `manual`); composition
  and sweep moved to post-review-approval timing under `with-integration` (PRD R9/R17/R31 + Task
  3.4 restructure 10 → 14 subtasks + notes rationale).

- **Next Task:** Task 3.2 — Rename `activate-planning-branch.md` → `init-work-unit.md` (WU +
  meta-file creation) (line ~924)

- **Blockers:** [none]

- **Next Action:** Proceed to Task 3.2 — `git mv` of
  `.arc/system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md` →
  `init-work-unit.md` (both copies), then workflow-body restructure for the WU + meta-file
  creation responsibility shift. `template-meta.md` reference (Task 4.1) is forward-compatible —
  body draft works without 4.1 complete.

---
