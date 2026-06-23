# Strategy: Task List Formatting

> **Guide and rationale:** [Task Lists](https://andrewrcr.github.io/arc-framework/reference/task-lists/)
> on the docs site covers the structural vs style distinction, design reasoning, annotated
> examples, and common pitfalls.

Authoritative formatting rules for task lists. Agent reference for task list generation and
maintenance. For skeletons, see [`template-tasks.md`][template-tasks]. For the pre-save format
checklist, see [generate-tasks.md § Finalize the task list][generate-tasks].

**Referenced by:**

- [generate-tasks.md][generate-tasks] — planned work

## Contents

1. [Task List Headers](#task-list-headers)
2. [Format Elements Reference](#format-elements-reference)
3. [Task Ownership Markers](#task-ownership-markers)
4. [Test-First Task Structure](#test-first-task-structure)
5. [Verification Phase](#verification-phase)
6. [Success Criteria Section](#success-criteria-section)

---

## Task List Headers

See [`template-tasks.md`][template-tasks] for skeletons.

**Task List** (`# Task List: {Name}`) — work with an upstream spec artifact (PRD by default):

- Title uses `Task List:` prefix
- `**Design:**` names the upstream spec artifact (filename only) — single header field per the
  chain-of-authority model. See [strategy-work-organization.md § WU Artifact
  Headers][work-org-wu-headers] for the full chain rationale and Spec field generalizability
- Horizontal rule (`---`) separates header from tasks

Success Criteria section at the bottom; optional sections (Architecture Patterns, Current State,
Testing Strategy) only when the work needs them.

---

## Format Elements Reference

### Bold and Italic Conventions

Convention tracks document role, not a single global rule:

- **File-header metadata** uses `**Bold:**` field labels — task list `**Design:**`; atomic file
  `**Purpose:**`, `**Ordering:**`. These describe the file.

- **Work descriptors** use `_Italic:_` field labels — phase preamble `_Purpose:_`, parent-task
  `_Goal:_` / `_Note:_` / `_Outcome:_`, atomic-item `_Observation:_` / `_Scope:_` / `_Files:_`.
  These describe the work.

- **Actionable titles** use `**Bold**` (no colon) — parent task `**X.Y Title**`, subtask
  `**X.Y.a Title**`, atomic item `**Title**`. These are the work.

Bold signals "structural piece" (file metadata, task titles); italic signals "describing the
work" (descriptors, rationale, outcomes). The layered split is what keeps the visual hierarchy
readable across document types.

### Phase Headers

`## **Phase X:** Description` — level 2, phase number bold within heading, name plain after
colon. Blank line before and after. No time estimates. Phases are the document's section
headings; the document title (`# Task List: ...`) is the only H1. No intermediate `## Tasks`
wrapper between H1 and phase H2s — phases are the H2 layer.

**Phase numbering.** Phases use single integers (`Phase 1`, `Phase 2`, ...). Tasks within
a phase use dotted notation (`Task 1.4`, `Task 1.4.a`). When referencing specific work, use
`Task X.Y` — `Phase X.Y` is always a misnomer since dotted IDs identify tasks. `Phase X`
remains valid when referring to the entire phase as a unit (e.g., "Phase 4 hasn't started").

**Phase count.** One or more substantive phases plus a single, always-present verification phase (the final
phase — see [§ Verification Phase](#verification-phase)). Count tracks the work's structure, not the WU's
`Class`; every task list ends in the verification phase.

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
when simple single-line. Indented 4 spaces below the parent's root-level descriptor block
(Goal + any peer descriptors). By convention subtasks are Goal's children — the indent +1
layer is what serves Goal, regardless of which root bullet structurally precedes the indent.
See § Goal/Note Lines.

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
in place — same shape, no label change. Parent-level replacement is different (Goal preserved;
peer descriptors and body subsumed by `_Outcome:_` at root); see § Goal/Note Lines and
[process-task-loop § Completion notes content discipline][process-task-loop].

### Goal/Note Lines

Italic-prefixed bullets at root level under a parent task heading. Italics signal
non-actionable descriptor; bold (`**X.Y Title**`) is reserved for actionable task titles.

**Goal first at root, required on every parent task.** Goal opens the task body — always
the first bullet under the parent task heading. It carries the outcome the rest of the body
serves. Goal applies whether the parent has subtasks or not; titles describe changes ("Wire
X into Y") while Goals describe outcomes ("X validates input on save"). Goal alone — title
plus Goal with no further body — is allowed when that pair fully captures the work. For
subtasks, Goal is opt-in: default no, opt in when the subtask carries separable sub-intent
that doesn't reduce to "slice of parent Goal."

**Diagnostic test for Goals**: would removing the Goal make it harder to verify the work
satisfies the spec? If yes, keep it. If no, drop it (subtask) or rewrite to articulate
outcome rather than restating the title (parent). The test catches title-restating Goals
("Goal: Wire validation into save handler" alongside that exact title) and noise-shaped
subtask Goals on mechanical decomposition.

**Peer descriptors as siblings of Goal at root, after Goal.** When framing is genuinely
load-bearing and Goal text alone can't carry it, peer descriptors — `_Context:_`,
`_Rationale:_`, `_Approach:_`, `_Shape:_`, `_Note:_` — sit at root after Goal as siblings.
Optional and absent on most tasks. Markdown's tree treats the indented body as children of
the last root bullet (the last peer descriptor when present); by convention indent +1 is
"Goal's children" — what serves Goal — regardless of which root bullet structurally precedes
the indent.

**Goal preserved across completion; peer descriptors and body replaced.** At `[x]`, Goal stays
verbatim. Peer descriptors (when present) and all Goal-children (description bullets, Build
test-first lists) are pruned — replaced by a rolled-up `_Outcome:_` bullet at parent-Goal indent
**placed after all subtasks** when the rollup carries signal (synthesis, verification, or
cross-cutting), or simply removed when title + Goal already capture the work. Goal opens the
post-completion shape; Outcome (when added) closes it from below; the two protected surfaces
frame what was the pre-completion middle. See [process-task-loop § Completion notes content
discipline][process-task-loop] for the threshold and granularity rules.

**Per-subtask description shifts in place** (unchanged behavior). At `[x]`, each subtask's
description bullets at indent +2 shift from plan-content to outcome-content — same shape,
no label change. The parent's rolled-up Outcome at root summarizes the unit-level result.

**Verification-task exception preserved.** The verification phase's single task (per
[verify-work-unit.md][verify-work-unit]) carries two required completion-note categories
at root — `_Quality gates:_`, `_Success criteria:_` — peers to Goal in
lieu of `_Outcome:_`. All three (Goal + two categories) protected post-completion.

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
- Root-level descriptor bullets (`_Goal:_`, peer descriptors, `_Outcome:_`) → col 1
  (bullet marker; content starts col 3)
- Goal-children → col 5 (4-space indent + bullet) — subtasks, description bullets for
  subtaskless parents, Build test-first marker
- Per-subtask description bullets / test-first cases under a subtaskless parent → col 9
  (8-space indent + bullet)
- Sub-bullets within subtask description / test-first cases under a subtask → col 13
  (12-space indent + bullet)

### Blank-Line Discipline

Blank lines required:

- Before and after every phase heading (H2)

- Before and after every parent task heading (H3)

- Between every subtask (whether or not it carries detail bullets)

- Loose-list rendering for any list of distinct items containing multi-line items — when at
  least one item spans 2+ lines, every item in that list separates from its neighbors with a
  blank line. Lists where every item is single-line stay tight. Applies to lists of
  independently-trackable items — subtasks, atomic-file items, ATOMIC-INBOX entries,
  success-criteria items. It does not reach the descriptor bullets that frame a single item
  (see the descriptor-cluster carve-out below).

- Before and after multi-paragraph descriptor blocks within a phase preamble

- Before an indent-+1 children block when the preceding root bullet is multi-line — separates
  the descriptor block from its operational children (subtasks or task-description bullets)

- Between Goal and Outcome at root post-completion — both protected surfaces. The loose-list
  rule already covers this when either is multi-line; this makes the separation explicit
  even when both are short

**File-header metadata blocks follow a different rule** from content lists. The bullet block
at the top of a `meta-*`, `draft-*`, `spec-*`, or similar tracked-artifact metadata cluster is
shape-mixed: key/value and enum-shaped fields (Origin, Spec, Task List, Branch, State, etc.)
describe the doc; descriptive-prose fields (Purpose, Context) describe what the work is. The
two shapes get different visual treatment:

- Key/value and enum fields stay tight to each other — the cluster keeps its scan rhythm
- Descriptive-prose fields (Purpose, Context, etc.) separate from neighbors with a blank
  line — the prose trailer is visually demarcated from the metadata cluster

The test is field shape, not line count: a key/value that happens to wrap (e.g., long path)
stays tight; a one-sentence Context that fits on one line still gets the separator because
it's prose by role. By convention descriptive fields land at the end of the block, but the
rule is shape-based — a descriptive field anywhere separates from its neighbors.

**Descriptor clusters also stay tight.** The consecutive root-level descriptor bullets that
open a parent task — `_Goal:_` plus any peer descriptors (`_Context:_`, `_Rationale:_`,
`_Approach:_`, `_Shape:_`, `_Note:_`) and `**Strategies:**` — and the descriptor sub-bullets
under an atomic item (`_Observation:_`, `_Scope:_`, `_Files:_`) describe one work item, not a
list of items, so they stay tight to one another even when individual descriptors wrap to
multiple lines. Separation is supplied at the cluster's boundaries, not within it: a blank
before the indent-+1 children block and before a post-completion `_Outcome:_` (both above).

Markdownlint MD022 enforces heading spacing; the "between every subtask", loose-list,
descriptor-cluster, and file-header-metadata-block rules are project convention beyond MD022
and are verified at the pre-save checklist.

---

## Instruction Audience

Task instructions inherit the audience of the file they target — not the audience of the task
list itself. The task list is internal-dev content and references movable WU artifacts freely
(per [DEV-RULES.ARC][dev-rules-arc] § `.arc/` artifact references), but an instruction modifying
a shipped or published file must be written in the shipped-content register — don't pre-load
`draft-*` / `spec-*` / `tasks-*` references the executing agent would have to strip on the way in.
Route executor-only context to the task's `_Note:_` peer descriptor or `notes-{name}.md`, not
the target file.

---

## Task Ownership Markers

**Applies when** `team.mode: true` — multiple developers collaborate on the same task list.
Optional in solo mode.

Format: `(@name)` at end of the checkbox line or phase header:

```markdown
- [ ] **1.1 Implement authentication flow** (@alice)
## **Phase 3:** Auth Layer (@alice)
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
list. The marker records the sequencing decision made at task generation: its presence means
tests-first for that increment, its absence means the baseline (test-after or no tests).
`test-first` is a stable approach keyword, not a reference to the method's name — it holds even
if the method is renamed.

Marker absence is not "no testing discipline": a task that writes or modifies tests still gets
the assertion / mocking discipline at execution, applied by the test-touch gate regardless of
the marker (see [process-task-loop.md][process-task-loop]).

Behavior bullets are coverage targets, not an execution sequence — each cycle informs the next.
Implementation detail bullets (fields, file locations, architectural notes) precede the marker.
No separate "implement" task — test and implementation form one vertical unit.

**Multiple related components:** one task per component within a phase, each with its own
behavior list and marker. **Multi-layer projects** (backend + frontend, API + CLI): separate
phases per layer with the same grouped pattern in each, plus a cross-layer validation phase.

---

## Verification Phase

Required final phase of every task list — a single task pointing to
[`verify-work-unit.md`][verify-work-unit]:

```markdown
## **Phase N:** Verification

### `[ ]` **N.1 Complete verification** — load and follow `verify-work-unit.md`
```

The pointer is a backticked filename only — task lists are relocatable, so they carry no
relative-path links.

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

- [DEV-RULES.ARC](../../../system/rules/DEV-RULES.ARC.md) — test-first assessment
- [generate-tasks.md][generate-tasks] — planned work + pre-save format checklist
- [process-task-loop.md][process-task-loop] — task execution workflow

---

[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[generate-tasks]: ../../../system/workflows/arc/generate-tasks.md
[process-task-loop]: ../../../system/workflows/arc/process-task-loop.md
[verify-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
[arc-methods-tf]: ../../../system/methods/test-first.md
[template-tasks]: ../../templates/arc/work-unit/template-tasks.md
[team-coordination]: strategy-team-coordination.md
[work-org-wu-headers]: strategy-work-organization.md#wu-artifact-headers
