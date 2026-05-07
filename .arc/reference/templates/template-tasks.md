# Template: Task Lists

Templates and guidance for task lists created during the [2_generate-tasks.md][generate-tasks]
workflow (planned feature/technical work) or [manage-incidental-work.md][manage-incidental]
(reactive incidental work).

Every task list uses one of the two header variants below and gets a paired
[atomic companion file](#atomic-companion-file) alongside it.

See [strategy-task-list-formatting.md][task-list-formatting] for the authoritative format rules,
element reference, test-first patterns, and annotated examples. The Quick Format Checklist in
[2_generate-tasks.md § Step 4][generate-tasks] covers the final-save checks.

---

## Header Variant: Feature / Technical

**Use when:** Planned work with a dedicated branch and PRD (feature development, technical improvements).

Title uses `Task List:` (not "Incidental:"). PRD reference is a bare filename — path is derived
from the task list's directory, so backlog → active rotation needs no field edit. The PRD is
canonical for Scope (Will Do / Won't Do) — the task list carries a one-line `**Purpose:**`
field instead of mirroring it. `Branch(es)` lists the primary implementation branch — add
comma-separated entries for stacked PRs or team sub-branches. Base Branch references the
project's configured base branch per [`arc-config.yml`][arc-config], not a hardcoded name.

```markdown
# Task List: {Work Name}

- **PRD:** `prd-{name}.md`
- **Branch(es):** `{feature|technical}/{branch-name}`
- **Base Branch:** {base branch per arc-config.yml — typically `main`}

- **Purpose:** {One-sentence summary — full Scope lives in the PRD}

---

## **Phase 1:** {Phase name}

_Purpose:_ {what this phase delivers and why this granularity}

### `[ ]` **1.1 {Subtaskless parent task title}**

- _Goal:_ {one-line outcome the task targets — protected across completion}

    - {description bullet — replaced by `_Outcome:_` at `[x]`}
    - {another description bullet}

### `[ ]` **1.2 {Parent-with-subtasks task title}**

- _Goal:_ {one-line outcome — protected across completion}

    - `[ ]` **1.2.a {Subtask description}**
        - {detail bullet — plan now, outcome at `[x]`}
    - `[ ]` **1.2.b {Subtask description}**
        - {detail bullet}

## **Phase N:** Verification

### `[ ]` **N.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` {Verifiable outcome derived from Scope "Will Do"}
- `[ ]` {Another verifiable outcome}
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
```

Optional sections (Architecture Patterns, Current State, Testing Strategy, etc.) appear only when
the work needs them.

---

## Header Variant: Incidental

**Use when:** Reactive work discovered during implementation (bug fixes, quality improvements, tech debt).

Title uses `Incidental:` prefix. Base Branch is the parent branch this branched from — enables
grep-based discovery of related work. Lifecycle state (`State`, `Interrupts`, `Paused At`,
`Paused To`) lives in the status file, not the task list header — see
[manage-incidental-work.md][manage-incidental] § Coordinated Pause/Resume.

```markdown
# Incidental: {Descriptive Title}

**Branch(es):** `incidental/{name}`
**Base Branch:** `{parent-branch-this-branched-from}`

## Context

**Discovered:** {Where/how found} — {Brief description}

**Problem:** {One-sentence problem statement}

**Why Now:** {Brief rationale for immediate work}

## Scope

### Will Do

- {What's included in this task list}

### Won't Do

- {What's deferred or out of scope}

---

## **Phase 1:** {Phase name}

_Purpose:_ {what this phase delivers and why this granularity}

### `[ ]` **1.1 {Task description}**

## **Phase N:** Verification

### `[ ]` **N.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` {Verifiable outcome}
- `[ ]` All quality gates pass
- `[ ]` Ready for integration

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
```

---

## Atomic Companion File

Create alongside every task list: `atomic-{name}.md` in the same directory. Empty by default;
see [strategy-task-list-formatting.md § Atomic Companion File][task-list-formatting] for scope
guards, shape rules, and lifecycle.

```markdown
# Atomic Tasks — {Work Unit Name}

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

### `[ ]` **{Example incomplete task title}**

- _Observation:_ {what surfaced — where/when discovered, e.g., "noticed during Task X.Y"}
- _Scope:_ {bounded effort}
- _Files:_ `{path/to/file.ext}`

### `[x]` **{Example completed task title}**

- _Outcome:_ {what was done — discovered during Task A.B, fixed in commit `abc1234`.}
```

---

[generate-tasks]: ../../system/workflows/arc/2_generate-tasks.md
[manage-incidental]: ../../system/workflows/arc/supplemental/manage-incidental-work.md
[task-list-formatting]: ../strategies/arc/strategy-task-list-formatting.md
[arc-config]: ../../system/arc-config.yml
