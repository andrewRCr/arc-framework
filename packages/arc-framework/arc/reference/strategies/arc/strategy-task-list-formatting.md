# Strategy: Task List Formatting

> **Guide and rationale:** [Task Lists](https://andrewrcr.github.io/arc-framework/reference/task-lists/)
> on the docs site covers the structural vs style distinction, design reasoning, annotated
> examples, and common pitfalls.

Authoritative formatting specification for task list structure, style, and organization across
all work types (feature, technical, incidental). Agent reference for task list generation and
maintenance.

**Referenced by:**

- [2_generate-tasks.md][generate-tasks] - Planned feature/technical work
- [manage-incidental-work.md][manage-incidental] - Reactive incidental work

## Contents

1. [Quick Format Checklist](#quick-format-checklist)
2. [Task List Headers](#task-list-headers)
3. [Format Elements Reference](#format-elements-reference)
4. [Task Ownership Markers](#task-ownership-markers)
5. [Test-First Task Structure](#test-first-task-structure)
6. [Verification Phase](#verification-phase)
7. [Atomic Companion File](#atomic-companion-file)
8. [Success Criteria Section](#success-criteria-section)

---

## Quick Format Checklist

Before finalizing any task list, verify:

- [ ] Phase headers use `### **Phase X:** Description` format
- [ ] Parent tasks have checkboxes and bold: `- [ ] **X.Y Description**`
- [ ] Subtasks use letter numbering: `- [ ] **X.Y.a Description**` (bold when detail bullets follow)
- [ ] Third level uses letters (`X.Y.a`, `X.Y.b`), not numbers (`X.Y.1`, `X.Y.2`) - letters signal depth
- [ ] Blank lines between subtasks when they have detail bullets beneath
- [ ] Unnumbered bullets for implementation details (no checkboxes, no numbers)
- [ ] Goal/Note lines indented 4 spaces from margin (same level as subtasks)
- [ ] Test-first tasks group test + implementation together (by concern, not activity)
- [ ] Test-first tasks use `Build \`test-first\` (one behavior at a time):` marker line before behavior list
- [ ] 4-space indentation per hierarchy level
- [ ] Backticks for all technical terms: `field_name`, `ClassName`, `/api/endpoint/`
- [ ] No time estimates anywhere (no duration emojis, minute counts)
- [ ] Verification phase as final phase (single task pointing to `verify-work-unit.md`)
- [ ] Atomic companion file created alongside task list (`atomic-{name}.md`, same directory)
- [ ] Success Criteria section at bottom with checkboxes (checked during verification phase)

---

## Task List Headers

Task list headers provide essential metadata and context. Format varies by task list type.

### Feature/Technical Task Lists

**Use when:** Planned work with dedicated branch and PRD (feature development, technical improvements)

**Required fields:**

```markdown
# Task List: [Feature/Technical Name]

**PRD:** `.arc/active/{feature|technical}/prd-[name].md`
**Created:** YYYY-MM-DD
**Branch(es):** `{feature|technical}/[branch-name]`
**Base Branch:** base branch (typically `main` — see `.arc/system/arc-config.yml`)
**Status:** {Pending|In Progress|Complete|Integrated}

## Overview

**Purpose:** One-sentence description of what this accomplishes.

## Scope

### Will Do

- What's included in this task list

### Won't Do

- What's deferred or out of scope

---

## Tasks

### **Phase 1:** ...
```

**Rules:**

- Title uses `Task List:` (not "Incidental:")
- PRD reference is absolute path from repo root
- `Branch(es)` lists the primary implementation branch; add additional branches comma-separated
  when using stacked PRs or team sub-branches (see
  [Task Lists and Branches](strategy-work-organization.md#task-lists-and-branches))
- Base Branch references the project's configured base branch, not a hardcoded name
- Status values: `Pending` (planned), `In Progress` (active), `Complete` (all tasks done, pre-merge),
  `Integrated` (merged to base branch — set during [archival](../../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md))
- Overview section includes Purpose
- Scope section defines boundaries (Will Do / Won't Do)
- Optional sections (Architecture Patterns, Current State, Testing Strategy, etc.) only when needed
- Horizontal rule (`---`) separates header from tasks
- Success Criteria section goes at bottom (see [Success Criteria Section](#success-criteria-section))

### Incidental Task Lists

**Use when:** Reactive work discovered during implementation (bug fixes, quality improvements, tech debt)

**Required fields:**

```markdown
# Incidental: [Descriptive Title]

**Created:** YYYY-MM-DD
**Branch(es):** `incidental/[name]`
**Base Branch:** `[parent-branch-this-branched-from]`
**Status:** {Pending|In Progress|Complete|Integrated}

## Context

**Discovered:** [Where/how found] - Brief description

**Interrupts:** [Task list path] at [location] OR `None` (fresh work)

**Problem:** One-sentence problem statement

**Why Now:** Brief rationale for immediate work

## Scope

### Will Do

- What's included in this task list

### Won't Do

- What's deferred or out of scope

---

## Tasks

### **Phase 1:** ...
```

**Rules:**

- Title uses `Incidental:` prefix
- `Branch(es)` lists this task list's own branch; add additional branches comma-separated if needed
- Base Branch is the parent branch this branched from (enables grep-based discovery of related work)
- Status values: `Pending` (not started), `In Progress` (active), `Paused` (blocked by other work),
  `Complete` (all tasks done, pre-merge), `Integrated` (merged to base branch)
- **Interrupts** field shows what task list/task was paused (backward pointer) OR `None` if fresh work
- **When pausing parent work**, add `Paused At` and `Paused To` fields to the interrupted task list
  (forward pointer)
- **When resuming**, update `Status` back to `In Progress`
- Scope section separates included vs deferred work
- Horizontal rule (`---`) separates header from tasks
- Success Criteria section goes at bottom (see [Success Criteria Section](#success-criteria-section))

**Example:**

```markdown
# Incidental: CLI Output Encoding on Windows

**Created:** 2025-10-29
**Branch(es):** `incidental/cli-output-encoding`
**Base Branch:** `feature/multi-format-export`
**Status:** In Progress

## Context

**Discovered:** Manual testing during Phase 3.6 (CSV export implementation)

**Interrupts:** `tasks-multi-format-export.md` at Phase 3.6, Task 3.6.2

**Problem:** CLI output garbles non-ASCII characters on Windows terminals.

**Why Now:** Blocks manual testing confidence and affects newly implemented export features.

## Scope

### Will Do

- Fix encoding for all output formats (table, CSV, JSON)
- Add comprehensive encoding tests

### Won't Do

- Performance optimization (separate enhancement)

---

## Tasks
```

### Status Field Values

- **Pending**: Work planned but not yet started
- **In Progress**: Active work happening now
- **Paused**: Blocked by or interrupted for other work (incidental only)
- **Complete**: All tasks finished, quality gates passed, work merged/delivered

---

## Format Elements Reference

### Phase Headers

**Format:** `### **Phase X:** Description`

**Rules:**

- Level 3 heading (`###`)
- Phase number in bold within heading: `**Phase X:**`
- Descriptive name after colon (not in bold)
- No time estimates
- Blank line before and after (visual separation)

```markdown
✅ ### **Phase 1:** Backend Tests and Data Models

❌ ### Phase 1: Backend Tests and Data Models  # Missing bold on "Phase 1:"
❌ ### **Phase 1: Backend Tests**  # Colon inside bold
❌ ### **Phase 1:** Backend Tests (2 hours)  # Time estimate (prohibited)
```

### Parent Tasks

**Format:** `- [ ] **X.Y Description**`

**Rules:**

- Checkbox with space: `- [ ]`
- Task number AND description both bold: `**X.Y Description**`
- Numbers follow pattern: `1.1`, `1.2`, `2.1`, etc. (not `1.1.0`)
- Description is concise but complete (what, not how)
- Indented 0 spaces from margin (top level within phase)

```markdown
✅ - [ ] **1.1 Write tests for data models**

❌ - [ ] 1.1 Write tests for data models  # Not bold
❌ - [ ] **1.1** Write tests for data models  # Only number bold
❌ - [x] **1.1 Write tests for data models**  # Pre-checked (starts unchecked)
```

### Subtasks (Third Level)

**Format:** `- [ ] **X.Y.a Description**` (bold when detail bullets follow)

**When to use:** Parent task requires 2+ distinct, independently completable steps

**Rules:**

- **Letter format: `X.Y.a`, `X.Y.b`, `X.Y.c`** (letters at third level for visual clarity)
- **Bold description when subtask has detail bullets beneath** (creates visual hierarchy)
- Indented 4 spaces from parent task
- Each subtask should be completable/testable independently
- For test-first work, group by concern — subtask covers both test and implementation
- **Blank lines between subtasks when they have detail bullets** (improves readability)

```markdown
✅ Subtasks with detail bullets:

- [ ] **1.1 `User` model (`models.py`)**

    - [ ] **1.1.a Field validation**

        Build `test-first` (one behavior at a time):
        - Email format validation
        - Username uniqueness constraint

    - [ ] **1.1.b Password hashing**

        Build `test-first` (one behavior at a time):
        - Password stored as hash, not plaintext

✅ Simple single-line subtasks:

- [ ] **1.2 Run quality gates**
    - [ ] 1.2.a Run linting checks
    - [ ] 1.2.b Run type checking

❌ - [ ] **1.1.1 Create test for User model**  # Numeric third level (use letters)
❌ - [ ] 1.1.a Create test with details  # Not bold but has details below
```

### Letter Numbering (Third Level and Beyond)

**Format:** `X.Y.a`, `X.Y.b` for third level; `X.Y.a.1`, `X.Y.a.2` for fourth level (rare)

After two number levels, use letters for visual differentiation. `7.3.a` is instantly clearer
than `7.3.1` — letters signal deeper nesting and break up number sequences.

**Numbering hierarchy:**

```
Phase: ### **Phase X:**
Parent task: X.Y (e.g., 1.1, 2.3)
Subtask: X.Y.a, X.Y.b (letters at third level)
Fourth level (rare): X.Y.a.1, X.Y.a.2
```

**Guidelines:**

- Use letters after two number levels for visual differentiation
- If fourth level needed, resume numbers after letters
- Maintain 4-space indentation per level regardless of numbering scheme

### Unnumbered Implementation Bullets

**Format:** `- Detail or guidance (no checkbox, no number)`

Detail bullets serve two distinct purposes:

1. **Implementation guidance (non-actionable):** File locations, architecture notes, expected
   behaviors ("tests FAIL initially", "tests should PASS"), context or rationale
2. **Grouped sub-actions (actionable but coupled):** Multiple tests in same file, manual testing
   scenarios done together, configuration items changed together — too granular/coupled to track
   separately as numbered subtasks

**Rules:**

- No checkbox, no numbers
- Indented 4 spaces from the task they support
- Can nest further (8 spaces for sub-bullets)
- Use backticks for technical terms
- Keep concise (1-2 lines per bullet)

### Goal/Note Lines

**Format:** `**Goal:** One-line clarification` or `**Note:** Important context`

**When to use:** Parent task title is technical/terse and needs purpose/rationale clarification

**Rules:**

- Indented 4 spaces from margin (same level as subtasks)
- First word bold (`**Goal:**`, `**Note:**`, `**Rationale:**`, `**Purpose:**`, `**Approach:**`)
- Single line only (not a paragraph)
- Must illuminate purpose/impact, NOT repeat title
- Blank line after (before first subtask)

```markdown
✅ - [ ] **1.1 `User` model (`models.py`)**

       **Goal:** Validated user model with email, username, and password constraints.

       - [ ] **1.1.a Field validation**

❌     **Goal:** Create the User model.  # Repeats title, adds no value
❌     **Goal:** This task involves building a comprehensive user model
       with field validation, password hashing, and relationship setup
       to ensure data integrity across the application.  # Too long, should be 1 line
```

### Revision Numbering (R Scheme)

**Format:** `X.Y.R`, `X.Y.R.Z` for discovered/remaining work

**When to use:** Expanding a previously-complete subtask without destroying existing numbering.
Documents mid-implementation discoveries, preserves original numbering, maintains audit trail.

```markdown
- [x] **3.1 Implement pagination metadata**
    - [x] 3.1.1 Update hook to extract metadata

    - [ ] **3.1.R Additional integration tests discovered**
        - [ ] **3.1.R.1 `PaginatedQuery` handler tests**

            Build `test-first` (one behavior at a time):
            - Correct metadata extraction from paginated response

        - [ ] **3.1.R.2 `ResultsList` stability tests**

            Build `test-first` (one behavior at a time):
            - Handles empty result set without error
```

### Emoji Usage

**Policy:** Discourage emojis in task planning; acceptable in completion details.

- **Discouraged** in task descriptions, phase headers, and Goal/Note lines — prefer plain text
- **Acceptable** in completion details (when marking tasks `[x]`): ❌ for explaining deviations
  from plan with rationale
- Green checkmarks (✅) discouraged as redundant — task already marked `[x]`

### Technical Terms

**Format:** Backticks for all technical identifiers

**Apply to:** Field names (`field_name`), class names (`ClassName`), function names
(`method_name()`), file names (`models.py`), API endpoints (`/api/users/`), constants
(`MAX_LENGTH`), variables (`response_data`)

```markdown
✅ - [ ] 1.2.1 Create `User` model in `src/models/user.py`
       - Add fields: `username`, `email`, `date_joined`

❌ - [ ] 1.2.1 Create User model in src/models/user.py  # No backticks
```

### Indentation Rules

**Standard:** 4 spaces per hierarchy level

```
Phase Header (### **Phase X:**)
↓
Phase-level notes (0 spaces) **Purpose:** Optional context
↓
Parent Task (0 spaces) - [ ] **X.Y Description**
    ↓
    Goal/Note Line (4 spaces) **Goal:** Clarification
    ↓
    Numbered Subtask (4 spaces) - [ ] **X.Y.Z Description** (bold if details follow)
        ↓
        Detail Bullet (8 spaces) - Implementation detail
            ↓
            Sub-bullet (12 spaces) - Nested detail
```

**Visual example:**

```markdown
### **Phase 1:** Backend Implementation

**Purpose:** Establish data models with test-first approach.

- [ ] **1.1 `User` model (`models.py`)**

    **Goal:** Validated user model with email and username constraints.

    - [ ] **1.1.a Field validation**
        - Fields: `username`, `email`, `password_hash`
        - Add `clean()` method for validation

        Build `test-first` (one behavior at a time):
        - Email format validation
        - Username uniqueness constraint

    - [ ] **1.1.b Password hashing**

        Build `test-first` (one behavior at a time):
        - Password stored as hash, not plaintext
        - Hash verification succeeds with correct password

- [ ] **1.2 `Profile` model (`models.py`)**

    Build `test-first` (one behavior at a time):
    - Foreign key to `User`
    - Cascade delete when `User` removed
```

---

## Task Ownership Markers

**Applies when:** `team.mode: true` — multiple developers collaborate on the same task list.
Optional in solo mode.

### The `(@name)` Convention

Mark task ownership by appending `(@name)` at the end of the checkbox line:

```markdown
- [ ] **1.1 Implement authentication flow** (@alice)
- [ ] **1.2 Set up CI pipeline** (@bob)
- [ ] **1.3 Write API documentation** (@alice)
```

Phase headers can carry area-level ownership:

```markdown
### **Phase 3:** Auth Layer (@alice)
```

**Placement:** Always at the end of the line, after the task description (and after any trailing
parenthetical if present). Uses the developer's `arc.identity` value.

**Rules:**

- Markers are optional — unowned tasks can be claimed during execution
- Reassignment is a text edit (change the marker, no ceremony)
- `(@name)` appears in task lists only, not in commit messages or branch names
- `(@name)` identifies the human developer, not the AI agent

See [Team Coordination Strategy][team-coordination] § Task Ownership for the full convention,
including reassignment and person-to-person handoff.

---

## Test-First Task Structure

**Applies when:** The [test-first method][arc-methods-tf] assessment says test-first for this work.
If your team has overridden test-first to test-after, this section's patterns don't apply — structure
tasks however suits your workflow.

**Core principle:** Test-first is an execution discipline within a task, not a task-ordering
convention. Group test and implementation together — by module or concern, not by activity.

### Standard Pattern

```markdown
### **Phase 1:** User Model

- [ ] **1.1 `User` model (`models.py`)**

    - [ ] **1.1.a Field validation**
        - Fields: `username`, `email`, `password_hash`
        - Add validation in `clean()` method

        Build `test-first` (one behavior at a time):
        - Email format validation
        - Username uniqueness constraint

    - [ ] **1.1.b Password hashing**

        Build `test-first` (one behavior at a time):
        - Password stored as hash, not plaintext
        - Hash verification succeeds with correct password

    - [ ] **1.1.c Run quality gates (linting, type checking)**
```

**Key elements:**

- **Task named for the module**, not the activity — "`User` model", not "Write tests for User model"
- **`Build \`test-first\` (one behavior at a time):`** is the execution marker — a leading line that signals
  red-green-refactor discipline and introduces the behavior list beneath it (see
  [process-task-loop][process-task-loop] for the execution loop). Its absence means test-after is acceptable.
- **Behavior bullets are a discovery guide, not a batch spec** — each is a behavior to verify, not a test to
  write upfront. The agent picks one, writes a failing test, makes it pass, then picks the next. The list
  informs what to cover; the execution order emerges from each RED→GREEN cycle.
- **Implementation detail bullets precede the marker** — context about what you're building (fields,
  file locations, architectural notes) comes before the behavioral spec
- **No separate "implement" task** — test and implementation are one vertical unit

**For multiple related components:** One task per component within the phase, each with its own
behavior list and `Build \`test-first\`:` marker. For multi-layer projects (backend + frontend,
API + CLI), use separate phases per layer with the same grouped pattern in each, plus a
cross-layer validation phase.

---

## Verification Phase

**Required for all task lists.** Every task list ends with a verification phase as its final
phase. This phase marks the boundary between "doing the work" and "confirming the work is done."

**Standard format:**

```markdown
### **Phase N:** Verification

- [ ] **N.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]
```

A single task that points to the workflow. The task description is intentionally thin — the
workflow is the authoritative protocol (Tier 3 quality gates, success criteria validation,
atomic task resolution). The `[verify-work-unit]` link reference is part of the template —
include it in every generated task list.

**Why a single task:** Verification is one review increment — three read-only validation
activities that produce a single coherent outcome. Breaking them into separate tasks created
self-contained descriptions that agents could execute without loading the workflow, causing
protocol details (immutable criteria text, three-state model) to be missed. A thin pointer
forces the workflow load.

**Completion notes as record:** The workflow instructs the agent to include completion notes
covering what was verified. This makes the archived task list self-documenting — a reader
sees the verification outcome without needing to find the workflow.

---

## Atomic Companion File

**Created alongside every task list.** A standalone file (`atomic-{name}.md`) in the same directory
as `tasks-{name}.md`. Empty by default — populated during execution as off-plan work is discovered.

**Purpose:** Tracks indivisible one-off tasks you elect to do in parallel to the planned work —
discovered during execution, not required for the work unit's success criteria. Unlike the phased
task list, these tasks have no position in the dependency sequence and are accessed at
unpredictable times throughout execution.

**Companion file format:**

```markdown
# Atomic Tasks — {Work Unit Name}

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. Flat checkbox list, no numbering hierarchy.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink
below them in completion order (oldest completed first). See process-task-loop §
Atomic Task Completion for the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

- [ ] Clarify error message in config loader (noticed during Task 5.3, deferred)

- [x] Fixed broken cross-reference in session-init.md (discovered during Task 3.2)
- [x] Updated .gitignore for new build artifacts (discovered during Task 4.1)

---
```

**Naming convention:** `atomic-{name}.md` where `{name}` matches the task list's `tasks-{name}.md`.
The `atomic-` prefix sorts before `tasks-` in directory listings, bookending the other work unit
artifacts for easy visual identification.

**Rules:**

- **Flat checkbox list** — no phase headers, no numbered tasks, no subtask hierarchy. Each item
  is a single checkbox with a brief description. This is deliberately simpler than the main task
  structure. Bold headers and grouped sub-bullets are acceptable for larger items.
- **Ordering** — incomplete tasks (`[ ]`) stay at the top; completed tasks (`[x]`) sink below
  them in completion order (most recently completed last). This keeps pending work immediately
  visible when the file is opened. A blank line between the two groups is optional but aids
  scannability.
- **Parenthetical context** — note where/when the item was discovered (e.g., "discovered during
  Task 3.2") to preserve traceability without formal numbering
- **Scope guard — size** — if an item needs subtasks, phases, or more than ~30 minutes of work, it
  is multi-step. Multi-step work required for the WU goes in the task list as a new phase.
  Multi-step work outside the WU's concern goes through [manage-incidental-work][manage-incidental].
- **Scope guard — relationship to WU** — items belong here if they are **elective, not required
  for the work unit's success criteria**. If something is required for the WU to succeed but
  doesn't fit existing phases, add it to the task list (new phase or subtask) — not here.
  The companion file is for parallel work you choose to do because you have context.
- **Scope guard — timing** — items belong here if you intend to do them **during this work unit's
  lifecycle**. "Will I do this during this WU?" → companion file. "Is this for later?" →
  ATOMIC-INBOX (arc-in-git) or your PM mechanism. The [issue-triage method][arc-methods-it]
  applies if the fix is trivial and in a file you're already touching.
- **Empty by default** — the file is created alongside every task list from generation but starts
  with only the guidance comment. Don't remove an empty companion file — its presence signals that
  off-plan work has a home.
- **All work unit types** — feature, technical, and incidental task lists all get companion files.
- **Commit context** — `Context: atomic-{name}.md` (no task number, no special suffix). The commit
  message body describes the work.
- **Archival** — archives alongside the task list if it contains any items. Deleted (not archived)
  if empty at integration time.

---

## Success Criteria Section

**Required for all task lists.** Placed at the bottom of the task list, serves as outcome
verification checklist.

**Purpose:** Checkable operationalization of the PRD's success criteria. Each "Will Do" item
should map to a verifiable criterion. These checkboxes are checked during the
[verification phase](#verification-phase), not during implementation.

**Format:**

```markdown
---

## Success Criteria

- [ ] [Verifiable outcome derived from Scope "Will Do"]
- [ ] [Another verifiable outcome]
- [ ] [Functional requirement that can be tested]
- [ ] All quality gates pass (tests, linting, type checking)
- [ ] Ready for [archival | next phase | merge]
```

**Rules:**

- Checkboxes required (actionable verification items)
- Derived from Scope "Will Do" items and PRD success criteria
- Always include "All quality gates pass" and "Ready for X" as standard items
- **Marked during verification phase** — not during implementation, not during archival
- Do not duplicate the PRD's criteria verbatim — operationalize them into checkable items
- **Criterion text is immutable** — never rewrite to match actual implementation
- All items must be `[x]` or `[~]` (with annotations) before running archive workflow.
  Any remaining `[ ]` items represent genuine gaps requiring resolution.
- No time estimates

**Three states** (see [verify-work-unit.md][verify-work-unit] for the execution protocol):

| Marker | Meaning    | Annotation                                                   |
|--------|------------|--------------------------------------------------------------|
| `[x]`  | Met        | None needed, or **Deviation** note if addressed differently  |
| `[~]`  | Superseded | **Superseded** note required - why dropped/deferred          |
| `[ ]`  | Not met    | Genuine gap - resolve before work is considered complete     |

**Example:**

```markdown
## Success Criteria

- [x] Required-field validation reports all missing fields with paths
- [x] Type-mismatch validation reports expected vs actual types
- [x] Multiple errors collected and reported in single pass
- [x] `getting-started.md` exists with adoption story and "what to customize" guidance
    - **Deviation:** Content redirected to external docs site (MkDocs Material +
      GitHub Pages). In-repo file is a lightweight pointer, not the full adoption
      story originally planned. Decided during Task 5.1.
- [~] Widget supports offline mode
    - **Superseded:** Descoped to Phase D after discovering API dependency requires
      always-online for initial sync. See `plan-public-release.md`.
- [x] All quality gates pass (tests, linting, type checking — 0 violations)
- [x] Ready to resume interrupted work at Task 3.3
```

---

## Related Documentation

- [DEV-RULES.ARC](../../constitution/DEV-RULES.ARC.md) — Test-first assessment
- [2_generate-tasks.md][generate-tasks] — Planned work task generation
- [manage-incidental-work.md][manage-incidental] — Incidental work lifecycle
- [3_process-task-loop.md][process-task-loop] — Task execution workflow

---

[generate-tasks]: ../../../system/workflows/arc/2_generate-tasks.md
[manage-incidental]: ../../../system/workflows/arc/supplemental/manage-incidental-work.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[verify-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
[arc-methods-it]: ../../../system/workflows/arc-methods.md#issue-triage
[arc-methods-tf]: ../../../system/workflows/arc-methods.md#test-first
[team-coordination]: strategy-team-coordination.md
