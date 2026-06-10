# Metadata: Doc Cascade Sweep

| **State**     | **Owner** | **Branch**                | **Class** | **Priority** |
| ------------- | --------- | ------------------------- | --------- | ------------ |
| `Shipped`     | `andrew`  | `chore/doc-cascade-sweep` | `Heavy`   | `P3`         |

- **Cohort:** `principle-anchored-core/agile-wu-lifecycle`
- **Depends On:** `scalable-authoring-pipeline`, `decomposition-machinery`

- **Origin:** [internal]
- **Design:** `spec-doc-cascade-sweep.md`
- **Task List:** `tasks-doc-cascade-sweep.md`

- **Last Completed:** Task 5.1 — Complete verification (Phase 5 complete; all quality gates + 12 success
  criteria pass)
- **Next Task:** integrate-work-unit — documentation cleanup, code review, PR, merge
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion

---

## Release Notes Entry

ARC's live methodology documentation now uses the current `Class` / planning-depth / Work Character model
consistently, drops obsolete incidental-work-unit guidance, and uses unnumbered lifecycle workflow filenames for
spec creation, task generation, and task execution.

**Breaking Changes:**

- `manage-incidental-work.md` is removed. Route discovered work through Discovered Work Routing, Errands,
  `arc-inbox`, housekeep, and backlog graduation.
- Lifecycle workflow filenames drop numeric prefixes: `1_create-spec.md`, `2_generate-tasks.md`, and
  `3_process-task-loop.md` become `create-spec.md`, `generate-tasks.md`, and `process-task-loop.md`.

### Changed

- Always-loaded and strategy surfaces now distinguish Work Character from `Class`, clarify flat `active/` layout,
  name `Class`-invariant quality gates, tighten phase grammar, and describe commit/PR surface language.
- Planning guidance now speaks in `Class` and planning-depth vocabulary instead of the retired tier/depth-mode
  terms.

### Removed

- Retired the incidental work-unit shape and tier-era terminology from live workflows, strategies, methods,
  templates, skills, extension guidance, install metadata, and tests.

### Fixed

- Corrected the `draft-design` commit template so draft-capture commits emit a valid `Context:` footer.
- Brought existing cohort documentation into the current cohort-record shape where the lifecycle-aware validator
  permits it.

### Infrastructure

- Updated the install recipe, framework manifest path keys, and workflow-name test fixtures for the unnumbered
  workflow filenames.

## Completion Notes

This WU closes the agile-WU-lifecycle cohort by cascading the sibling model changes through the live ARC framework
surface. It retired the obsolete incidental-WU workflow and the atomic/quick/standard tier vocabulary, made the
always-loaded session surfaces coherent with `Class` and Work Character, corrected flat-`active/` documentation,
renamed the numbered lifecycle workflows, and updated the package/install/test surfaces that make those filenames
real.

The implementation also reconciled point debts from the cohort: `cohort-agile-parallelism.md` now matches the
cohort-record shape, `draft-arc-plan-conductor.md` speaks in the shipped `Class` / planning-depth model, and
`draft-design.md`'s commit-template footer validates. `decomposition-machinery`'s graduation workflow already
captured the manual-run steps this WU checked, so no extra adopter-facing worked-example prose was added.

Two planned deviations remain intentional. First, historical records, supplemental analysis, backlog drafts, and
this WU's own artifacts may still mention old workflow names or retired vocabulary because they document earlier
states rather than live framework guidance. Second, `cohort-agile-wu-lifecycle.md` is conceptually conformant but
still trips the current backlog-scoped validator after its members graduate; that lifecycle-aware validator gap was
captured to `operational-state-docs` instead of patched around here.

Verification passed before integration: markdown lint, TypeScript lint, shell lint, source and test typechecks,
build, and the full Vitest suite. PR #77 is green; the local CodeRabbit pass produced one false-positive finding
against the package template/render convention, rejected after verifying the documented package-sync mapping.
