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

`## **Phase X:** Description` — level 2, phase number bold within heading, name plain after
colon. Blank line before and after. No time estimates. Phases are the document's section
headings; the document title (`# Task List: ...`) is the only H1. No intermediate `## Tasks`
wrapper between H1 and phase H2s — phases are the H2 layer.

### Phase Preamble

Lines between the phase heading and its first parent task heading. Required: `_Purpose:_` line
(italic) — what the phase delivers and why this granularity. Optional: `_Design decisions:_`
block summarizing the key calls (one or two short paragraphs; link to `notes-{name}.md` for
full rationale, alternatives considered, and risks). Soft cap ~12 lines per preamble —
anything longer belongs in the notes file.

### Parent Tasks

```text
### `[ ]` **X.Y Description**
```

Level 3 heading; status marker (`` `[ ]` `` / `` `[x]` `` / `` `[~]` ``) wrapped in inline
code (backticks); X.Y number and description both bold. The marker is text in the heading,
toggled at completion as a one-character edit. Backticks distinguish the marker from
incidentally-bracketed prose in titles. Subtasks use the same backtick-wrapped marker
(§ Subtasks) for rendered-view consistency.

Numbers follow `1.1`, `1.2`, `2.1` (not `1.1.0`). Description is concise but complete — what,
not how.

Phase headings (H2) and parent task headings (H3) provide the outline-pane navigation surface
in editors. Subtasks remain bullets — promoting them to H4 would crowd outline panes without
navigation benefit.

### Subtasks (Third Level)

```text
- `[ ]` **X.Y.a Description**
```

Checkbox bullet with backtick-wrapped marker (matching parent task heading style); letter
numbering at third level. Bold when detail bullets follow (creates visual hierarchy); plain
when simple single-line. Indented 4 spaces from the parent task heading's content (under the
parent's `_Goal:_` bullet — see § Goal/Note Lines for the structural anchor mechanic).

The backtick wrapping prevents GFM from rendering the marker as an actual checkbox UI element
in preview/rendered views. Without backticks, parent tasks (in headings — where GFM doesn't
render task lists) and subtasks (in bullets — where GFM does) would render inconsistently.
Backticks on both keeps the marker as literal monospace text in all renderers.

**Use when:** Parent task requires 2+ distinct, independently completable steps. For test-first
work, group by concern — one subtask covers both test and implementation.

### Numbering Hierarchy

```text
Phase:         ## **Phase X:**                       (H2 heading)
Parent task:   ### `[x]` **X.Y Title**               (H3 heading, backtick marker)
Subtask:       - `[x]` **X.Y.a Title**               (bullet, backtick marker)
Fourth level:  X.Y.a.1                               (rare — resume numbers after letters)
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

At task completion, per-subtask description bullets shift from plan-content to outcome-content
in place — same shape, no label change. See [process-task-loop § Completion notes content
discipline][process-task-loop] for the content bound and replace-don't-accumulate rule.

### Goal/Note Lines

Italic-prefixed bullets at root level under a parent task heading: `- _Goal:_ {one line}`,
`- _Note:_`, `- _Rationale:_`, `- _Approach:_`, `- _Context:_`. Italics signal non-actionable
descriptor; bold (`**X.Y Title**`) is reserved for actionable task titles.

**Goal as structural anchor.** When a parent task has subtasks, `_Goal:_` is the bullet that
owns them via 4-space indent — semantically, subtasks serve the Goal. Goal must come last
among descriptor bullets so subtasks indent under it; other descriptors (Context, Rationale,
Approach) appear as flat peer bullets BEFORE Goal.

**Subtaskless parents — no descriptor bullets pre-completion.** A parent task without subtasks
must not carry `_Goal:_`, `_Note:_`, `_Rationale:_`, `_Approach:_`, or `_Context:_` bullets.
The title carries the task; supporting bullets without indented children look orphaned. If a
descriptor seems necessary, that's a signal to subtask the work — surface the Goal as the
structural anchor and break the work into 2+ subtasks.

**Post-completion: outcomes replace descriptors.** At `[x]` time, all pre-completion
descriptor bullets are REPLACED by a single `_Outcome:_` bullet at root level (per
[process-task-loop § Completion notes content discipline][process-task-loop]). This applies to
subtaskless parents too — `_Outcome:_` is allowed when warranted, and is the only descriptor
a subtaskless parent ever carries. Don't accumulate plan AND outcome.

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

4 spaces per hierarchy level:

- Phase heading (H2) → col 1
- Parent task heading (H3) → col 1
- Root-level descriptor bullets (`_Goal:_`, peers) → col 1 (bullet marker; content starts col 3)
- Subtasks under `_Goal:_` → col 5 (4-space indent + bullet)
- Per-subtask description bullets → col 9 (8-space indent + bullet)
- Sub-bullets within description → col 13 (12-space indent + bullet)

### Blank-Line Discipline

Blank lines required:

- Before and after every phase heading (H2)
- Before and after every parent task heading (H3)
- Between every subtask (whether or not it carries detail bullets)
- Before and after multi-paragraph descriptor blocks within a phase preamble

Always blank line — no conditional rules. Markdownlint MD022 enforces heading spacing; the
"between every subtask" rule is project convention beyond MD022 and is verified at the pre-save
checklist.

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
archival. Markers backtick-wrapped (matching parent + subtask convention — see
[§ Subtasks](#subtasks-third-level) for rationale). Always include "All quality gates pass"
and "Ready for integration" as standard items. Criterion text is immutable — never rewrite
to match actual implementation. Do not duplicate the PRD's criteria verbatim — operationalize
them into checkable items.

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
