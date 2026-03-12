# Strategy: Task List Formatting

## Purpose

Authoritative standards and conventions for task list structure, style, and organization across all work types
(feature, technical, incidental). This strategy ensures consistency, readability, and maintainability of task
documentation throughout the project lifecycle.

**Referenced by:**

- [2_generate-tasks.md][generate-tasks] - Planned feature/technical work
- [manage-incidental-work.md][manage-incidental] - Reactive incidental work

## Table of Contents

1. [Quick Format Checklist](#quick-format-checklist)
2. [Task List Headers](#task-list-headers)
3. [Format Elements Reference](#format-elements-reference)
4. [Test-First Task Structure](#test-first-task-structure)
5. [Complete Annotated Example](#complete-annotated-example)
6. [Common Mistakes](#common-mistakes)
7. [Decision Guidelines](#decision-guidelines)
8. [Verification Phase](#verification-phase)
9. [Atomic Tasks Section](#atomic-tasks-section)
10. [Success Criteria Section](#success-criteria-section)

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
- [ ] Verification phase as final phase (workflow reference + Tier 3 gates + PRD validation + atomic tasks)
- [ ] Atomic Tasks section present (empty by default, between verification phase and Success Criteria)
- [ ] Success Criteria section at bottom with checkboxes (checked during verification phase)

---

## Structural Requirements vs. Style Conventions

Not all formatting guidance carries equal weight. Some elements are **structural** — tooling,
hooks, and workflows depend on them. Others are **style conventions** — they produce better task
lists but aren't mechanically enforced. Understanding the boundary helps adopters know what they
can relax without breaking anything.

### Structural (tooling depends on these)

These elements are parsed by git hooks, workflows, or session initialization. Deviating from
them may cause hook failures, workflow mismatches, or context loading errors.

- **Checkbox syntax**: `- [ ]` / `- [x]` / `- [~]` — workflows track completion state (`[~]` =
  intentionally deferred or superseded)
- **Task numbering pattern**: `X.Y` (parent), `X.Y.a` (subtask) — pre-commit hook validates
  letter numbering at third level (`[configurable]`: `hooks.task_numbering` in `arc-config.yml`)
- **Phase header format**: `### **Phase X:** Description` — used for phase counting and navigation
- **Header metadata fields**: `**Status:**`, `**Branch(es):**`, `**PRD:**` — parsed by workflows
  and session initialization
- **File naming**: `tasks-{name}.md` in `active/` or `backlog/` — hook file matching, WORK-STATUS
  references
- **Atomic Tasks section header**: `## Atomic Tasks — {name}` — workflows and archival expect this section
- **Success criteria markers**: `[x]`, `[ ]`, `[~]` — verification workflow reads these

### Style (human-facing quality)

These conventions improve readability, consistency, and maintainability. They represent ARC's
recommended practices but aren't enforced by tooling. Adopters can adjust these to team
preference without breaking workflows.

- Bold formatting on task descriptions
- Goal/Note line placement and formatting
- Blank lines between subtasks with detail bullets
- Test-first task grouping within phases
- Backticks on technical terms
- Emoji policy
- Indentation depth (4-space convention)
- Detail bullet conventions (unnumbered, no checkboxes)
- Revision numbering (R scheme)

The rest of this document covers both categories together — structural requirements are the
baseline, style conventions build on them.

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
  [Task Lists and Branches](strategy-work-organization.md#5-task-lists-and-branches))
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

**Key distinction:** Unnumbered bullets provide guidance or grouped actions, not independent
completable steps that warrant tracking separately.

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

### Anti-Patterns

❌ **Wrong — tests as separate final phase:**

```markdown
### **Phase 1:** Implement Features
- [ ] **1.1 Create models**
- [ ] **1.2 Create API endpoints**

### **Phase 2:** Write Tests  # DON'T DO THIS
- [ ] **2.1 Write model tests**
- [ ] **2.2 Write API tests**
```

❌ **Wrong — separate test and implement tasks within a phase:**

```markdown
### **Phase 1:** User Model
- [ ] **1.1 Write tests for User model**  # DON'T DO THIS
- [ ] **1.2 Implement User model**        # Splits one concern into two tasks
```

Both patterns produce horizontal slicing — writing tests in bulk tests *imagined* behavior, not
actual behavior. Group test + implementation together so each test cycle informs the next.

---

## Complete Annotated Example

This example demonstrates all formatting elements in proper context:

```markdown
# Incidental: Config Validation Error Reporting

**Created:** 2025-10-29
**Branch:** `incidental/config-validation-errors`
**Base Branch:** `feature/plugin-system`
**Status:** In Progress

## Context

**Discovered:** Manual testing during Phase 3.6 (plugin loader implementation)

**Interrupts:** `tasks-plugin-system.md` at Phase 3.6, Task 3.6.2

**Problem:** Invalid configuration silently ignored instead of reporting clear errors.

**Why Now:** Blocks manual testing confidence and affects newly implemented plugin loading.

## Scope

### Will Do

- Fix error reporting for all configuration fields
- Add comprehensive validation tests
- Manual verification of error messages

### Won't Do

- Performance optimization (separate enhancement)
- Custom validation rules API (out of scope)

---

### **Phase 1:** Test Infrastructure

- [ ] **1.1 Create test fixtures for config scenarios**

    **Goal:** Reusable fixtures to test validation across configuration types.

    - [ ] **1.1.a Create fixture for valid configs in `test_helpers.py`**
        - Return mock config object with all required fields
        - Support partial overrides for test variations
        - Include nested config (plugin settings, environment overrides)

    - [ ] **1.1.b Create fixture for invalid configs**
        - Missing required fields, type mismatches, out-of-range values
        - Support combining multiple violations in one config

- [ ] **1.2 Verify fixture compatibility with existing tests**

    - [ ] **1.2.a Run existing test suite with new fixtures**
        - Ensure no regressions
        - All tests should still PASS

### **Phase 2:** Validation and Error Reporting

- [ ] **2.1 Field validation (`src/config/loader.py`, `src/config/parser.py`)**

    - [ ] **2.1.a Required field validation**
        - Collect all violations before reporting (don't fail on first)
        - Include field path in each error
        - File location: `src/config/loader.py:89-120`

        Build `test-first` (one behavior at a time):
        - Required fields report missing with field path
        - Empty config (all fields missing)

    - [ ] **2.1.b Type checking**
        - Handle nested configs recursively
        - File location: `src/config/parser.py:45-78`

        Build `test-first` (one behavior at a time):
        - Type mismatches report expected vs actual type
        - Range violations report allowed bounds
        - Deeply nested invalid fields
        - Multiple simultaneous violations

- [ ] **2.2 Error message formatting (`src/config/errors.py`)**

    **Goal:** Ensure error messages are actionable and include fix suggestions.

    - [ ] **2.2.a Error output format**
        - Collect errors into structured report, sort by field path

        Build `test-first` (one behavior at a time):
        - Errors include field path (e.g., `plugins.auth.timeout`)
        - Errors include expected type or value range
        - Multiple errors collected and reported together

    - [ ] **2.2.b Suggestion generation**

        Build `test-first` (one behavior at a time):
        - Typos suggest closest valid field name

### **Phase 4:** Quality Gates and Manual Verification

- [ ] **4.1 Automated quality checks**

    - [ ] **4.1.a Run full test suite**
        - Unit tests: All pass
        - Integration tests: All pass

    - [ ] **4.1.b Run linting and type checking**
        - Linter: 0 violations
        - Type checker: 0 errors

- [ ] **4.2 Manual testing**

    - [ ] **4.2.a Test missing field errors**
        - Remove required field → verify clear error message
        - Test with multiple missing fields

    - [ ] **4.2.b Test type mismatch errors**
        - String where int expected → verify helpful message

    - [ ] **4.2.c Test suggestion accuracy**
        - Typo in field name → verify closest match suggested

---

## Atomic Tasks — Config Validation Error Reporting

<!-- Off-plan work within this WU's domain, discovered during execution. Flat checkbox list — -->
<!-- no phase structure, no numbering hierarchy. Check off as completed; archives with this -->
<!-- task list. For work too large or outside this WU's domain, see manage-incidental-work.md. -->

---

## Success Criteria

- [ ] Required-field validation reports all missing fields with paths
- [ ] Type-mismatch validation reports expected vs actual types
- [ ] Multiple errors collected and reported in single pass
- [ ] All quality gates pass (tests, linting, type checking — 0 violations)
- [ ] Ready to resume interrupted work at Task 3.6.2
```

---

## Common Mistakes

Quick reference for frequent errors. Each element's detailed examples are in
[Format Elements Reference](#format-elements-reference) above.

1. **Headers instead of parent tasks** — Use `- [ ] **X.Y Description**` (checkbox + bold), not
   `### X.Y` (heading)
2. **Splitting test and implementation** — Group together by concern, not as separate tasks
3. **Pre-checked tasks** — All tasks start as `- [ ]` (unchecked), never `- [x]`
4. **Numbered detail bullets** — Implementation details use unnumbered bullets, not numbered subtasks
5. **Goal/Note at wrong indent** — Indent 4 spaces from margin (same level as subtasks), not at margin
6. **Missing backticks** — All technical identifiers need backticks: `ClassName`, `file.py`, `/api/path/`
7. **Vague descriptions** — Be specific: "Capture all query params before redirect", not "Fix the bug"
8. **Numeric third level** — Use letters (`1.1.a`) not numbers (`1.1.1`) — letters signal depth

---

## Decision Guidelines

### Subtask Granularity: Numbered vs Detail Bullets

**Core principle:** Number subtasks when tracking completion adds value; use detail bullets when numbering
creates noise.

#### Use Subtasks (X.Y.a) When

- **Independently completable** at different times/sessions
- **Clear checkpoint value** — marking complete signals progress
- **Could be assigned separately** or worked on by different people
- **Meaningful pause points** between steps

**Decision test:**

- Would you complete these at different times? → Subtasks
- Would you do them all in one sitting? → Detail bullets
- Does splitting add clarity or just noise? → If noise, use detail bullets

#### Use Detail Bullets When

Items are done in one sitting, too granular/coupled to track separately, or non-actionable
context/guidance. See [Unnumbered Implementation Bullets](#unnumbered-implementation-bullets)
for the two-purpose breakdown and formatting rules.

#### Avoid Parent Tasks with Single Subtask

**Anti-pattern:** Parent task with only 1 numbered subtask. Two options:

**Collapse** (most common): Remove subtask number, make parent task more specific.

- ❌ `1.1 Write tests` → `1.1.1 Create test file`
- ✅ `1.1 Create test file in test_navigation.ts`

**Split** (if subtask has multiple distinct actions):

- ❌ `2.3 Verify compatibility` → `2.3.a Review and test integration`
- ✅ `2.3 Verify compatibility` → `2.3.a Review integration` + `2.3.b Test integration`

### When to Add Goal/Note Lines

**Add when:** Parent task title is technical/terse, purpose needs clarification, or context helps
future readers. **Skip when:** Title is already descriptive, purpose is obvious, or it would repeat
the title. See [Goal/Note Lines](#goalnote-lines) for formatting rules.

### When to Add Blank Lines Between Subtasks

**Add when:** Parent has 3+ subtasks and each has 2+ detail bullets (visual chunking helps).
**Skip when:** Subtasks are simple/single-line or parent has only 1-2 subtasks.

---

## Verification Phase

**Required for all task lists.** Every task list ends with a verification phase as its final
phase. This phase marks the boundary between "doing the work" and "confirming the work is done."

**Standard format:**

```markdown
### **Phase N:** Verification

**Workflow:** [`verify-work-unit.md`][verify-work-unit] — load and follow for this phase.

- [ ] **N.1 Run Tier 3 quality gates**
- [ ] **N.2 Validate success criteria against PRD**
- [ ] **N.3 Verify all atomic tasks resolved**
```

The `**Workflow:**` line and `[verify-work-unit]` link reference are part of the template —
include them in every generated task list. The workflow contains the step-by-step procedure,
three-state success criteria model, and atomic task verification checklist.

---

## Atomic Tasks Section

**Present in all task lists.** Placed after the verification phase and before Success Criteria.
Empty by default — populated during execution as off-plan work is discovered.

**Purpose:** Captures small off-plan work **within this work unit's domain** — discoveries, fixes,
and quality improvements that weren't anticipated during planning but belong to the same functional
area. Items here archive with the task list, keeping all WU work in one place.

**Format:**

```markdown
---

## Atomic Tasks — {Work Unit Name}

<!-- Off-plan work within this WU's domain, discovered during execution. Flat checkbox list — -->
<!-- no phase structure, no numbering hierarchy. Check off as completed; archives with this -->
<!-- task list. For work too large or outside this WU's domain, see manage-incidental-work.md. -->

- [x] Fixed broken cross-reference in session-init.md (discovered during Task 3.2)
- [x] Updated .gitignore for new build artifacts (discovered during Task 4.1)
- [ ] Clarify error message in config loader (noticed during Task 5.3, deferred)
```

**Rules:**

- Section header: `## Atomic Tasks — {Work Unit Name}` (em dash, matches task list title)
- **Flat checkbox list** — no phase headers, no numbered tasks, no subtask hierarchy. Each item
  is a single checkbox with a brief description. This is deliberately simpler than the main task
  structure.
- **Parenthetical context** — note where/when the item was discovered (e.g., "discovered during
  Task 3.2") to preserve traceability without formal numbering
- **Scope guard — size** — if an item needs subtasks, phases, or more than ~30 minutes of work, it
  belongs in an [incidental task list][manage-incidental], not here
- **Scope guard — domain** — items must belong to this work unit's functional area. Discoveries
  outside the WU's domain don't go here — they go to your project's capture mechanism for
  standalone work (varies by PM mode: `ATOMIC-TASKS.md` in arc-in-git, external tracker in
  external mode, or a new task list / session note in core-only mode). The
  [leave-it-cleaner method][arc-methods-lic] applies if the fix is trivial and in a file you're
  already touching.
- **Empty by default** — the section exists in every task list from creation but starts with only
  the inline guidance comment. Don't remove the empty section — its presence signals that off-plan
  work has a home.
- Horizontal rule (`---`) separates Atomic Tasks from the verification phase above

**Structural note:** This section is a Core artifact — it exists in all task lists regardless of
Project Management mode. It replaces the need for a standalone `ATOMIC-TASKS.md` file during work
unit execution. The standalone file (in arc-in-git mode) remains the home for work that lives
between or alongside work units — not scoped to any single task list.

---

## Success Criteria Section

**Required for all task lists.** Placed at the bottom after Atomic Tasks, serves as outcome
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

## References

- [DEV-RULES.ARC](../../constitution/DEV-RULES.ARC.md) - Test-first assessment
- [2_generate-tasks.md][generate-tasks] - Planned work task generation
- [manage-incidental-work.md][manage-incidental] - Incidental work lifecycle
- [3_process-task-loop.md][process-task-loop] - Task execution workflow

---

[generate-tasks]: ../../../system/workflows/arc/2_generate-tasks.md
[manage-incidental]: ../../../system/workflows/arc/supplemental/manage-incidental-work.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[verify-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
[arc-methods-lic]: ../../../system/workflows/arc-methods.md#leave-it-cleaner
[arc-methods-tf]: ../../../system/workflows/arc-methods.md#test-first
