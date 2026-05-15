# Atomic Tasks — Work Organization Reform

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. No phases or numbering hierarchy; items are flat parent-level entries under
a single `## Tasks` wrapper.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink
below them in completion order (oldest completed first). See process-task-loop §
Atomic Task Completion for the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

## Tasks

### `[ ]` **Audience-vocabulary sweep — WU docs (PRD + task list)**

- _Schedule:_ After Task 2.13.f, before Task 2.14.
- _Why:_ Task 2.13.a surfaced `adopter onboarding` carrying verbatim from PRD R27 spec text into
  adopter-facing `commit-format.md`. Spec-carryover during R-ID-driven codification is the failure
  mode. Cleaning the source eliminates the carryover risk for later 2.13 subtasks and downstream
  phases that port more spec text into adopter-facing surfaces.
- _Scope:_ `prd-work-organization-reform.md` + `tasks-work-organization-reform.md`. Grep
  `\badopters?\b` (case-insensitive). Replace in spec text / R-IDs / acceptance criteria that gets
  ported into adopter-facing outputs. Keep `adopter` where it explicitly names the framework-author
  audience (e.g., section labels like "Adopter-facing surfaces"). Judgement call per instance.
- _Out of scope:_ Task 6.7.n already sweeps non-WU adopter-facing surfaces; this is the WU-internal
  complement, scheduled early to neutralize carryover risk during the remaining WOR execution.
