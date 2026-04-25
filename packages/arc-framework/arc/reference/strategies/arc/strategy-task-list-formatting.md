# Strategy: Task List Formatting

> **Guide and rationale:** [Task Lists](https://andrewrcr.github.io/arc-framework/reference/task-lists/)
> on the docs site covers the structural vs style distinction, design reasoning, annotated
> examples, and common pitfalls.

Authoritative formatting rules for task lists across all work types (feature, technical,
incidental). Agent reference for task list generation and maintenance. For skeletons, see
[`template-tasks.md`][template-tasks]. For the pre-save format checklist, see
[2_generate-tasks.md § Step 4][generate-tasks].

**Referenced by:**

- [2_generate-tasks.md][generate-tasks] — planned feature/technical work
- [manage-incidental-work.md][manage-incidental] — reactive incidental work

## Contents

1. [Task List Headers](#task-list-headers)
2. [Format Elements Reference](#format-elements-reference)
3. [Task Ownership Markers](#task-ownership-markers)
4. [Test-First Task Structure](#test-first-task-structure)
5. [Verification Phase](#verification-phase)
6. [Atomic Companion File](#atomic-companion-file)
7. [Success Criteria Section](#success-criteria-section)

---

## Task List Headers

Two variants. See [`template-tasks.md`][template-tasks] for skeletons.

**Feature/Technical** (`# Task List: {Name}`) — planned work with PRD and dedicated branch:

- Title uses `Task List:` prefix
- PRD reference is repo-root-relative; updates when work activates (arc-in-git mode)
- `Branch(es)` lists the primary implementation branch; comma-separated additions for stacked
  PRs or team sub-branches (see [Task Lists and Branches][work-org-task-branches])
- `Base Branch` references the project's configured base per [`arc-config.yml`][arc-config],
  not a hardcoded name
- `**Purpose:**` is a one-line summary in the header; full Scope (Will Do / Won't Do) lives
  in the PRD — the task list does not mirror it
- Horizontal rule (`---`) separates header from tasks

**Incidental** (`# Incidental: {Title}`) — reactive work discovered during implementation:

- Title uses `Incidental:` prefix
- `Base Branch` is the parent branch this branched from (enables grep-based discovery of
  related work)
- `## Context` replaces the Feature/Technical Purpose field —
  `**Discovered:**` / `**Problem:**` / `**Why Now:**`
- `## Scope` (`### Will Do` / `### Won't Do`) is retained — no PRD to canonicalize from
- Lifecycle state (`State`, `Interrupts`, `Paused At`, `Paused To`) lives in the status file,
  not the task list header — see
  [manage-incidental-work.md § Coordinated Pause/Resume][manage-incidental]

Both variants: Success Criteria section at the bottom; optional sections (Architecture Patterns,
Current State, Testing Strategy) only when the work needs them.

---

## Format Elements Reference

### Phase Headers

`### **Phase X:** Description` — level 3, phase number bold within heading, name plain after
colon. Blank line before and after. No time estimates.

### Phase Preamble

Lines between the phase heading and its first task bullet (`- [ ]` or `- [x]`). Required:
`**Purpose:**` line — what the phase delivers and why this granularity. Optional:
`**Design decisions:**` block summarizing the key calls (one or two short paragraphs; link
to `notes-{name}.md` for full rationale, alternatives considered, and risks). Soft cap
~12 lines per preamble — anything longer belongs in the notes file.

### Parent Tasks

`- [ ] **X.Y Description**` — checkbox with space, number and description both bold. Numbers
follow `1.1`, `1.2`, `2.1` (not `1.1.0`). Description is concise but complete — what, not how.
Indented 0 spaces from margin (top level within phase).

### Subtasks (Third Level)

`- [ ] **X.Y.a Description**` — letter numbering at third level. Bold when detail bullets
follow (creates visual hierarchy); plain when simple single-line. Indented 4 spaces from parent
task. Blank lines between subtasks when they have detail bullets beneath.

**Use when:** Parent task requires 2+ distinct, independently completable steps. For test-first
work, group by concern — one subtask covers both test and implementation.

### Numbering Hierarchy

```text
Phase:         ### **Phase X:**
Parent task:   X.Y          (e.g., 1.1, 2.3)
Subtask:       X.Y.a        (letters at third level)
Fourth level:  X.Y.a.1      (rare — resume numbers after letters)
```

Letters after two number levels provide visual differentiation — `7.3.a` is instantly clearer
than `7.3.1`. Maintain 4-space indentation per level regardless of numbering scheme.

### Unnumbered Implementation Bullets

`- Detail or guidance` (no checkbox, no number). Two purposes:

1. **Implementation guidance** (non-actionable) — file locations, architecture notes, expected
   behaviors (tests FAIL initially, tests should PASS), context, rationale
2. **Grouped sub-actions** (actionable but coupled) — tests in the same file, manual scenarios
   done together, config items changed together — too granular or coupled for numbered subtasks

Indented 4 spaces from the task they support; can nest further (8 / 12 spaces). Keep concise
(1-2 lines per bullet). Use backticks for technical terms.

### Goal/Note Lines

`**Goal:** {One-line clarification}` — or `**Note:**`, `**Rationale:**`, `**Purpose:**`,
`**Approach:**`. Single line only. Must illuminate purpose/impact — never repeat the title.
Indented 4 spaces from margin (same level as subtasks). Blank line after (before first
subtask).

### Revision Numbering (R Scheme)

Expanding a previously-complete subtask without destroying existing numbering:

- `X.Y.R` — subtask-level discovered/remaining work
- `X.R` — phase-level follow-on that cuts across a whole phase (e.g., post-Phase-3 quality-gate
  close)
- `X.Y.R.a`, `X.R.a` — children when the revision item itself needs subtasks

Preserves original numbering and audit trail. Documents mid-implementation discoveries.

### Emoji Usage

Discouraged in task descriptions, phase headers, and Goal/Note lines — prefer plain text.
Acceptable in completion notes (`❌` for explaining deviations from plan with rationale).
Green checkmarks (`✅`) redundant with the `[x]` marker.

### Technical Terms

Backticks for all identifiers: field names (`field_name`), class names (`ClassName`), function
names (`method_name()`), file names (`models.py`), API endpoints (`/api/users/`), constants
(`MAX_LENGTH`), variables (`response_data`).

### Indentation

4 spaces per hierarchy level — phase header → parent task (0) → goal/note or subtask (4) →
detail bullet (8) → sub-bullet (12).

---

## Task Ownership Markers

**Applies when** `team.mode: true` — multiple developers collaborate on the same task list.
Optional in solo mode.

Format: `(@name)` at end of the checkbox line or phase header:

```markdown
- [ ] **1.1 Implement authentication flow** (@alice)
### **Phase 3:** Auth Layer (@alice)
```

Uses the developer's `arc.identity` value. Markers are optional — unowned tasks can be claimed
during execution. Reassignment is a text edit (change the marker, no ceremony). Identifies the
human developer, not the AI agent. Does not appear in commit messages or branch names.

See [Team Coordination Strategy § Task Ownership][team-coordination] for reassignment protocols
and person-to-person handoff.

---

## Test-First Task Structure

**Applies when** the [test-first method][arc-methods-tf] assessment selects test-first for this
work. If your team has overridden test-first to test-after, this section's patterns don't apply
— structure tasks however suits your workflow.

**Core rule:** Group test and implementation together — by module or concern, not by activity.
Name tasks for the module (`` `User` model ``), not the activity ("Write tests for User
model"). A `` Build `test-first` (one behavior at a time): `` marker introduces the behavior
list; the marker signals red-green-refactor discipline. Its absence means test-after is
acceptable.

Behavior bullets are coverage targets, not an execution sequence — each RED→GREEN cycle informs
the next. Implementation detail bullets (fields, file locations, architectural notes) precede
the marker. No separate "implement" task — test and implementation form one vertical unit.

**Multiple related components:** one task per component within a phase, each with its own
behavior list and marker. **Multi-layer projects** (backend + frontend, API + CLI): separate
phases per layer with the same grouped pattern in each, plus a cross-layer validation phase.

See [3_process-task-loop.md][process-task-loop] for the red-green-refactor execution loop.

---

## Verification Phase

Required final phase of every task list — a single task pointing to
[`verify-work-unit.md`][verify-work-unit]:

```markdown
### **Phase N:** Verification

- [ ] **N.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]
```

Include the `[verify-work-unit]` reference-link definition with other reference links at the
task list's end.

---

## Atomic Companion File

Created alongside every task list: `atomic-{name}.md` in the same directory as
`tasks-{name}.md`. Flat checkbox list — no phases, no numbering, no hierarchy. Empty by default;
populated during execution as off-plan work surfaces.

See [`template-tasks.md`][template-tasks] for the skeleton and
[3_process-task-loop.md § Atomic Task Completion][process-task-loop] for the completion
protocol.

**Scope guards** (each item must satisfy all three):

- **Size** — if an item needs subtasks, phases, or more than ~30 minutes of work, it is
  multi-step. Required-for-WU multi-step goes in the task list as a new phase; outside-WU
  multi-step routes via [manage-incidental-work][manage-incidental]
- **Relationship** — elective, not required for the work unit's success criteria. If required
  for the WU to succeed but doesn't fit existing phases, add to the task list
- **Timing** — during this WU's lifecycle. For later work, use ATOMIC-INBOX (arc-in-git) or
  your PM mechanism. The [issue-triage method][arc-methods-it] applies for trivial fixes in
  files already being touched

**Ordering:** incomplete (`[ ]`) at top; completed (`[x]`) sink below in completion order
(oldest first). Parenthetical context ("discovered during Task X.Y") preserves traceability
without formal numbering.

**Naming:** `atomic-{name}.md` where `{name}` matches the task list's `tasks-{name}.md`. The
`atomic-` prefix sorts before `tasks-` in directory listings, bookending the other work-unit
artifacts.

**Lifecycle:** Don't delete an empty companion file — its presence signals off-plan work has a
home. Feature, technical, and incidental task lists all get companion files. Bold headers and
grouped sub-bullets are acceptable for larger items.

**Commit context:** `Context: atomic-{name}.md` (no task number, no special suffix). The commit
message body describes the work. **Archival:** alongside the task list if it contains any
items; deleted if empty at integration time.

---

## Success Criteria Section

Required final section of every task list. Each Scope "Will Do" item maps to a verifiable
criterion — the checkable operationalization of the PRD's success criteria. See
[`template-tasks.md`][template-tasks] for the block.

Checked during the [verification phase](#verification-phase), not during implementation or
archival. Always include "All quality gates pass" and "Ready for {archival | next phase |
merge}" as standard items. Criterion text is immutable — never rewrite to match actual
implementation. Do not duplicate the PRD's criteria verbatim — operationalize them into
checkable items.

**Three states** (applied during [`verify-work-unit.md`][verify-work-unit]):

| Marker | Meaning    | Annotation                                                   |
|--------|------------|--------------------------------------------------------------|
| `[x]`  | Met        | None needed, or **Deviation** note if addressed differently  |
| `[~]`  | Superseded | **Superseded** note required — why dropped/deferred          |
| `[ ]`  | Not met    | Genuine gap — resolve before work is considered complete     |

All items must be `[x]` or `[~]` (with annotations) before running archive. Any remaining
`[ ]` represent genuine gaps requiring resolution.

---

## Related Documentation

- [DEV-RULES.ARC](../../constitution/DEV-RULES.ARC.md) — test-first assessment
- [2_generate-tasks.md][generate-tasks] — planned work + pre-save format checklist
- [manage-incidental-work.md][manage-incidental] — incidental work lifecycle
- [3_process-task-loop.md][process-task-loop] — task execution workflow

---

[generate-tasks]: ../../../system/workflows/arc/2_generate-tasks.md
[manage-incidental]: ../../../system/workflows/arc/supplemental/manage-incidental-work.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[verify-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
[arc-methods-it]: ../../../system/methods/issue-triage.md
[arc-methods-tf]: ../../../system/methods/test-first.md
[template-tasks]: ../../templates/template-tasks.md
[team-coordination]: strategy-team-coordination.md
[arc-config]: ../../../system/arc-config.yml
[work-org-task-branches]: strategy-work-organization.md#task-lists-and-branches
