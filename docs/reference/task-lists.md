# Task Lists

Task lists are ARC's execution layer — the document that an agent reads to understand what to
build, in what order, and to what standard. They break planned work into phases and individually
completable tasks, each one a bounded review increment between you and the agent.

This page covers the design reasoning, structural guidance, and common pitfalls for writing
effective task lists. For the complete formatting specification (field-level rules, indentation,
examples for every element), see `strategy-task-list-formatting.md` in your
`.arc/reference/strategies/` directory.

## What's Required vs What's Flexible

Not all formatting guidance carries equal weight. Some elements are **structural** — git hooks,
workflows, and session initialization depend on them. Others are **style conventions** that
produce better task lists but aren't mechanically enforced. Knowing the boundary lets you relax
conventions that don't fit your team without breaking anything.

**Structural (tooling depends on these):**

- Checkbox syntax: `- [ ]` / `- [x]` / `- [~]` — workflows track completion state
- Task numbering pattern: `X.Y` (parent), `X.Y.a` (subtask) — git hooks validate letter
  numbering at the third level
- Phase header format: `### **Phase X:** Description` — used by workflows for navigation
- Header metadata fields: `**Status:**`, `**Branch(es):**`, `**PRD:**` — parsed by workflows
  and session initialization
- File naming: `tasks-{name}.md` in `active/` (or `backlog/` with the arc-in-git planning module)
- Success criteria markers: `[x]`, `[ ]`, `[~]` — used by the verification workflow

**Style (adjust to taste):**

- Bold formatting on task descriptions
- Goal/Note line placement
- Blank lines between subtasks with detail bullets
- Backticks on technical terms
- Indentation depth (4-space convention)
- Emoji policy

## The Format at a Glance

A task list has a header (metadata, purpose, scope), then phased tasks, and ends with a
verification phase and success criteria.

```markdown
# Task List: Config Validation

**PRD:** `.arc/active/technical/prd-config-validation.md`
**Created:** 2025-10-29
**Branch(es):** `technical/config-validation`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Add comprehensive validation and error reporting for configuration files.

## Scope

### Will Do

- Field validation with actionable error messages
- Collect and report all violations in a single pass

### Won't Do

- Custom validation rules API (future work)

---

## Tasks

### **Phase 1:** Validation

- [ ] **1.1 Field validation (`config/loader.py`)**

    - [ ] **1.1.a Required field validation**
        - Collect all violations before reporting
        - Include field path in each error

        Build `test-first` (one behavior at a time):
        - Required fields report missing with field path
        - Empty config reports all fields missing

    - [ ] **1.1.b Type checking**

        Build `test-first` (one behavior at a time):
        - Type mismatches report expected vs actual type
        - Range violations report allowed bounds

- [ ] **1.2 Error message formatting (`config/errors.py`)**

    **Goal:** Actionable error messages with fix suggestions.

    Build `test-first` (one behavior at a time):
    - Errors include field path
    - Multiple errors collected and reported together

### **Phase 2:** Verification

**Workflow:** `verify-work-unit.md` — load and follow for this phase.

- [ ] **2.1 Run Tier 3 quality gates** — begin `verify-work-unit.md`
- [ ] **2.2 Validate success criteria against PRD**
- [ ] **2.3 Verify all atomic tasks resolved** (`atomic-config-validation.md`)

---

## Success Criteria

- [ ] Required-field validation reports all missing fields with paths
- [ ] Type-mismatch validation reports expected vs actual types
- [ ] Multiple errors collected and reported in single pass
- [ ] All quality gates pass (tests, linting, type checking)
```

Key elements to notice:

- **Phase headers** use `### **Phase X:** Description` — the bold wraps the number and colon
- **Parent tasks** have checkboxes and bold descriptions: `- [ ] **X.Y Description**`
- **Subtasks use letters**: `X.Y.a`, `X.Y.b` — letters at the third level signal depth and
  break up number sequences
- **`Build \`test-first\``** is the execution marker — it tells the agent to use red-green-refactor
  discipline. Its absence means test-after is acceptable.
- **Detail bullets** (no checkbox, no number) provide implementation guidance or group coupled
  sub-actions that don't warrant individual tracking
- **Goal lines** clarify purpose when the task title is terse
- **Verification phase** is always the final phase, referencing the verification workflow

## Grouping Test and Implementation

When test-first applies, group test and implementation together by concern — not as separate
activities. The task is named for the *module*, not the activity.

```markdown
✅ - [ ] **1.1 `User` model**
      Build `test-first` (one behavior at a time):
      - Email format validation
      - Username uniqueness constraint
```

```markdown
❌ - [ ] **1.1 Write tests for User model**    ← splits one concern
  - [ ] **1.2 Implement User model**           ← into two tasks
```

Splitting test and implementation creates horizontal slicing — writing tests in bulk tests
*imagined* behavior, not actual behavior. Grouping them together means each test cycle informs
the next.

## The Atomic Companion File

Every task list gets a companion file: `atomic-{name}.md` in the same directory. It's empty by
default and fills up during execution as off-plan work is discovered — a typo you noticed, a
missing test, a documentation gap.

Items in the companion file are small, self-contained tasks you choose to handle alongside the
planned work. They're tracked separately because they don't fit in the dependency sequence and
you need to access them at unpredictable times during execution. In a large task list, hunting
for an inline section means losing your place in the phased work.

??? info "Why not an inline section in the task list?"

    Three practical reasons: **access pattern** (atomic tasks are captured and worked on at any
    point, not sequentially — in 500+ line task lists, a separate file avoids context-switching
    between planned and off-plan work), **staging hygiene** (committing an atomic task doesn't
    require surgical staging of the main task list), and **commit traceability**
    (`Context: atomic-{name}.md` is a clean file reference).

## Common Mistakes

1. **Splitting test and implementation** — Group by concern, not activity. One task covers both
   the test and the code that makes it pass.
2. **Numeric third level** — Use letters (`1.1.a`) not numbers (`1.1.1`). Letters signal depth.
3. **Headers instead of parent tasks** — Use `- [ ] **X.Y Description**` (checkbox + bold),
   not `### X.Y` (heading).
4. **Numbered detail bullets** — Implementation details use unnumbered bullets, not numbered
   subtasks. Number only when tracking completion adds value.
5. **Pre-checked tasks** — All tasks start as `- [ ]`. Mark `[x]` only when work is done.
6. **Vague descriptions** — Be specific: "Capture all query params before redirect", not
   "Fix the bug".
7. **Missing backticks** — Technical identifiers need backticks: `ClassName`, `file.py`,
   `/api/path/`.

## Decision Guidelines

### Subtasks vs detail bullets

Number subtasks when tracking completion adds value. Use detail bullets when numbering creates
noise.

- **Would you complete these at different times or sessions?** → Subtasks (`X.Y.a`, `X.Y.b`)
- **Would you do them all in one sitting?** → Detail bullets
- **Does splitting add clarity, or just noise?** → If noise, detail bullets

Avoid parent tasks with only one subtask — either collapse the subtask into a more specific
parent, or split into two meaningful subtasks.

### When to add Goal/Note lines

Add a Goal line when the parent task title is technical or terse and needs purpose clarification.
Skip when the title is already descriptive — a Goal line that repeats the title adds nothing.

### When to add blank lines between subtasks

Add when the parent has 3+ subtasks and each has detail bullets beneath (visual chunking helps
readability). Skip when subtasks are simple one-liners.
