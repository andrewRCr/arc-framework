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
3. [Segments and Verification Boundaries](#segments-and-verification-boundaries)
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

An optional top-level `## Delivery Plan` may appear after that rule and before Phase 1. An unmarked section is
provisional planning prose; canonical publication owns the exact sentinel-bounded replacement. Its renderer-owned
shape is metadata plus plan-level stack landability, aligned member-identity and member-coverage tables, aligned
named-seam topology, and naturally wrapped acceptance bullets outside tables. Identifiers are individually
backticked and comma-separated. Empty seams render `_None._` and omit acceptance.

This projection is informative, not part of the executable task grammar. Structural readers ignore the entire
locus: it contributes no phase, task, subtask, tally, cursor, or delivery task-inventory state. Renderer replacement
preserves the surrounding task-list bytes, including every phase.

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

Lines between the phase heading and its first parent task heading. When a Delivery Plan is present, open with one
`**Delivery member:**` pointer carrying the ordinal and a backticked chunk key for each member represented in the
phase. The required `_Purpose:_` line follows — what the phase delivers and why this granularity. The pointer is
reader orientation, not assignment authority: members bind to tasks through the delivery coverage table, never to
whole phases. It carries the stable ordinal and chunk key, never the free-text member title.

For segmented plans, follow [§ Segments and Verification Boundaries](#segments-and-verification-boundaries) for the
mode, span, exit-criterion, and closing-task contract. In the preamble, place those structural lines after
`_Purpose:_` and before any optional `_Design decisions:_` block; a single-phase segment carries both with
`_Mode:_` first. Separate every preamble entry with a blank line.

Optional `_Design decisions:_` blocks summarize key calls in one or two short paragraphs; link to
`notes-{name}.md` for full rationale, alternatives, and risks. Apply the soft cap of about 12 lines to the purpose
and design-decision prose; delivery-member pointers, `_Mode:_`, and `_Exit criterion:_` are structural and do not
count toward it. Anything longer belongs in the notes file.

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

**Use when:** Parent task requires 2+ distinct, independently completable steps. For test-first work, group by the
segment's mode — behavior path for `slice`, module or concern for `layer`, repeatable transformation batch for
`replication` — with one subtask covering both test and implementation.

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

**Additional Context is a required-read pointer.** Use a root-level `- **Additional Context:** ...`
line only when a task depends on external context the executor should read directly and that is too
large, volatile, or cross-cutting to inline into the task body. It may point to project/team domain
docs, domain rules, `notes-*` sections, `research-*` sections, ARC strategies, or external URLs.
Prefer exact section anchors (`notes-{name}.md` § Parser edge cases), not line numbers or whole-doc
references. Omit tenuous, general, or already-loaded references: ARC-supplied strategies are uncommon
task-local context and belong only when the task directly works in that strategy's domain. Do not use
the field for generic test sequencing or project testing standards; those load through methods.

**Goal and retiring-phase bullets are preserved across completion; other body content is replaced.** At `[x]`,
Goal and every `_Retired in:_ Phase N` detail bullet stay verbatim. Peer descriptors (when present) and all other
Goal-children (description bullets, Build test-first lists) are pruned — replaced by a rolled-up `_Outcome:_` bullet
at parent-Goal indent **placed after all subtasks** when the rollup carries signal (synthesis, verification, or
cross-cutting), or simply removed when title + Goal already capture the work. Goal opens the post-completion shape;
Outcome (when added) closes it from below, with any retained retiring-phase bullet staying at its original depth.
See [process-task-loop § Completion notes content discipline][process-task-loop] for the threshold and granularity
rules.

**Per-subtask description shifts in place** (unchanged behavior). At `[x]`, each subtask's description bullets at
indent +2 shift from plan-content to outcome-content — same shape, no label change — except a `_Retired in:_ Phase N`
detail bullet, which stays verbatim. The parent's rolled-up Outcome at root summarizes the unit-level result.

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
  success-criteria items. Root descriptor clusters follow their own semantic spacing rule below.

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

**Root descriptor clusters use semantic loose spacing when wrapped.** A parent task's opening
cluster consists of `_Goal:_`, documented peer descriptors (`_Context:_`, `_Rationale:_`,
`_Approach:_`, `_Shape:_`, `_Note:_`), and optional `**Additional Context:**` entries before
operational children. When any cluster entry spans multiple physical lines, place at least one
blank line between every adjacent cluster entry. An all-one-line cluster may be tight or loose;
MD012 owns excess consecutive blank lines. Preserve a blank boundary before indent-+1 operational
children and before a post-completion `_Outcome:_`.

Descriptor sub-bullets under an atomic item (`_Observation:_`, `_Scope:_`, `_Files:_`) describe one
item but are not root task descriptors, so they remain outside this rule.

Markdownlint MD022 enforces heading spacing; the "between every subtask", loose-list, root-descriptor-cluster,
and file-header-metadata-block rules are project convention beyond MD022 and are verified at the pre-save
checklist.

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

## Segments and Verification Boundaries

A segmented task plan is an ordered sequence of contiguous segments. Each segment spans one or more phases and
closes on one stated kind of progress. Modes attach to segments rather than work units, so mixed-mode plans are
ordinary and a single-mode plan is the simplest case. Segments carry no identifiers: their opening and closing
phases define them.

Choose the mode from the dominant residual risk after planning closes:

| Residual risk lies in                                           | Mode              | The segment closes on                              |
| --------------------------------------------------------------- | ----------------- | -------------------------------------------------- |
| **Composition** — do the parts assemble into intended behavior? | **`slice`**       | a thin end-to-end capability that can be exercised |
| **Substrate contract** — is the shared thing underneath right?  | **`layer`**       | a complete, settled layer                          |
| **Mechanics at scale** — does this transformation work N times? | **`replication`** | the enumerated surface exhausted, batch-verified   |

### Recording a segment

The opening phase carries `_Mode:_`; the closing phase carries `_Exit criterion:_`; a single-phase segment carries
both. Their preamble order is any delivery-member pointers, `_Purpose:_`, `_Mode:_`, `_Exit criterion:_`, then any
`_Design decisions:_` block, omitting either structural line when the phase is not that segment boundary. Separate
every entry with a blank line.

`_Mode:_` takes a backticked `slice`, `layer`, or `replication` token immediately after the label, an optional
`through Phase N` span, then an em dash and a non-empty prose gloss naming what the segment closes on:

```markdown
_Mode:_ `slice` through Phase 3 — closes on exercisable end-to-end capability.
```

`_Exit criterion:_` takes the segment's specific, non-empty criterion as prose. A task list with neither a
`_Mode:_` line nor a segment-scope verifier is unsegmented. A newly authored single-segment plan records both
structural lines like any other segmented plan.

### Verification family

| Boundary      | Marker                                            | Position                         |
| ------------- | ------------------------------------------------- | -------------------------------- |
| **segment**   | `— validate exit criterion at segment scope`      | segment's closing phase          |
| **member**    | `— validate criteria at member scope`             | final assigned task in its range |
| **work unit** | terminal `Verification` phase and its single task | final phase                      |

The segment and member markers are exact trailing role suffixes outside the bold actionable title:

```markdown
### `[ ]` **M.N {Segment closing title}** — validate exit criterion at segment scope

### `[ ]` **M.N {Member closing title}** — validate criteria at member scope
```

A `slice` or `replication` segment ends with a segment verifier. A `layer` needs none. The segment verifier is the
last parent in its closing phase that does not carry the member suffix. When the two boundaries coincide, the
segment verifier immediately precedes the member verifier so member close-out can consume its evidence.

The terminal `Verification` phase carries neither `_Mode:_` nor `_Exit criterion:_` and contains the sole terminal
work-unit verification task. On a single-segment plan, that terminal task subsumes the segment verifier. No segment
verifier appears in the terminal phase.

A segment verifier is an evidence sink. Its completion records the scenario executed and its result as the ordinary
`_Outcome:_`; it is not a criteria report and never hosts corrective work. Segment exit criteria therefore remain
phase-preamble and closing-task evidence rather than Success Criteria entries. Mandatory lifecycle outcomes remain
Success Criteria and consume that evidence at their assigned member or work-unit boundary.

---

## Test-First Task Structure

**Applies when** the [test-first method][arc-methods-tf] assessment selects test-first for this
work. If your team has overridden test-first to test-after, this section's patterns don't apply
— structure tasks however suits your workflow.

**Core rule:** Group test and implementation together by the segment's mode: behavior path for `slice`, module or
concern for `layer`, repeatable transformation batch for `replication` — never by testing-versus-implementation
activity. Name tasks for that grouping locus. A `` Build `test-first` (one behavior at a time): `` marker introduces
the behavior list. The marker records the sequencing decision made at task generation: its presence means tests-first
for that increment, its absence means the baseline (test-after or no tests). `test-first` is a stable approach
keyword, not a reference to the method's name — it holds even if the method is renamed.

Marker absence is not "no testing discipline": a task that writes or modifies tests still gets
the assertion / mocking discipline at execution, applied by the test-touch gate regardless of
the marker (see [process-task-loop.md][process-task-loop]).

Behavior bullets are coverage targets, not an execution sequence — each cycle informs the next.
Implementation detail bullets (fields, file locations, architectural notes) precede the marker.
No separate "implement" task — test and implementation form one vertical unit.

Apply the same mode input to multi-component and multi-layer work. In a `slice`, name tasks by behavior path even
when one crosses components or layers; its segment boundary closes with end-to-end validation. In a `layer`, name
tasks by module or concern — multiple components may use one task per component, and multi-layer substrate work may
use separate phases per layer. In `replication`, let each task own one repeatable transformation batch across the
components or layers in that batch. Do not add a cross-layer validation phase by default; the resolved segment
boundaries determine where that validation closes.

---

## Verification Phase

Segment, member, and work-unit verifier roles, markers, and ordering are defined together in
[§ Segments and Verification Boundaries](#segments-and-verification-boundaries).

The required final phase of every task list contains that single terminal task pointing to
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

When a Delivery Plan is present, group criteria beneath plain `### Member {ordinal} —` headings carrying a
backticked chunk key and one `### Cross-member seams` heading. A member's ordinary closing task walks its group;
terminal verification walks
the seam group and dispositions member groups from their recorded boundary evidence. Assign each criterion to the
earliest member boundary whose validator can see its evidence; criteria that no member boundary can see belong to
the seam group. A single-deliverable work unit omits the subgroup headings and retains the flat form.

Headings group; indentation must not. Criterion checkboxes stay at root indent. Two or three leading spaces make a
criterion inert content and silently drop it from the walk; four or more spaces parse as a subtask without an open
parent and refuse the task list. A root criterion whose body begins with a task-ID-like token also refuses rather
than becoming a criterion.

Grouped member criteria are checked through `validate-criteria` during each member's ordinary closing task.
Those checks record boundary evidence but leave the markers unchanged. The terminal
[verification phase](#verification-phase) consumes those reports, checks seam and union coherence, dispositions
the member groups, and owns marker changes. Flat criteria are checked during terminal verification. Markers are
backtick-wrapped
(matching parent + subtask convention — see [§ Subtasks](#subtasks-third-level) for rationale). Always include
"All quality gates pass" and "Ready for integration" as seam items for grouped criteria, or standard items in the
flat form. The [`validate-criteria` method][validate-criteria] owns the three states and immutable-criterion-text
rule. Do not duplicate the PRD's criteria verbatim — operationalize them into checkable items.

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
[validate-criteria]: ../../../system/methods/validate-criteria.md
[arc-methods-tf]: ../../../system/methods/test-first.md
[template-tasks]: ../../templates/arc/work-unit/template-tasks.md
[work-org-wu-headers]: strategy-work-organization.md#wu-artifact-headers
