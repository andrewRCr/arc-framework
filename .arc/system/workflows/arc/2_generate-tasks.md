# Workflow: Generate Task List

**Audience:** Collaborative — developer and agent work through this together.

**Purpose**: Transform a PRD into an executable task list — a step-by-step implementation plan
with phases, sub-tasks, quality checkpoints, and test-first ordering.

**When to use**: After a PRD has been created and reviewed, when work is ready for implementation
planning.

---

## Process

Before starting, read the PRD thoroughly. If the PRD has dependency metadata (Status and Related
Work fields), remove them — dependencies are resolved if you're generating tasks.

### Step 1: Assess Codebase and Relevant Strategies

Review the existing codebase to understand what you're working with:

- Existing patterns and architecture to leverage
- Components or modules related to the PRD requirements
- Files that will need modification
- Testing patterns and quality standards in use

Check [STRATEGY-INDEX.md](../../../reference/strategies/STRATEGY-INDEX.md) for project-level strategies relevant to
this work (e.g., testing methodology, component patterns, service layer conventions). Read applicable
strategies before designing phases — they directly influence task structure and approach.

### Step 2: Design Phases

Identify 3-7 major phases that organize the work into logical, testable milestones. Present these
to the user for review before breaking down into sub-tasks.

**Principles:**

- Each phase should produce testable, verifiable progress
- Order phases to minimize dependencies and enable incremental delivery
- Place tests before or alongside implementation, not in a separate final phase

### Step 3: Break Down into Sub-Tasks

For each phase, define specific, actionable sub-tasks:

- Small enough to complete in a single work session (typically < 3 files modified)
- Include quality checkpoints at appropriate stages
  (see [Quality Gates Strategy](../../../reference/strategies/arc/strategy-quality-gates.md) for tier guidance)
- Reference specific files, patterns, or approaches where helpful
- No time estimates — focus on clear scope and completion criteria

**Test-first ordering (critical):** For data models, API endpoints, business logic, and complex
algorithms — write test sub-tasks BEFORE implementation sub-tasks. See
[Development Methodology Strategy](../../../reference/strategies/arc/strategy-development-methodology.md)
Test-First Protocol for what requires test-first vs test-after.

**If your project has a testing methodology strategy** (e.g., `strategy-testing-methodology.md`),
consult it for project-specific test patterns and coverage expectations.

### Step 4: Write and Save Task List

Combine phases, sub-tasks, and any implementation notes into the final task list following the
format described below.

**Save to:**

- Feature: `.arc/backlog/feature/tasks-{{FEATURE_NAME}}.md`
- Technical: `.arc/backlog/technical/tasks-{{FEATURE_NAME}}.md`

Name should match the PRD (e.g., `prd-api-modernization.md` → `tasks-api-modernization.md`).

See [Task Processing Loop](3_process-task-loop.md) for how task lists are executed.

---

## Task List Format

### Header

```markdown
# Task List: [Work Name]

**PRD:** `.arc/backlog/[category]/prd-[name].md`
**Created:** YYYY-MM-DD
**Branch:** `feature/[name]` or `technical/[name]`
**Base Branch:** base branch per `arc-config.yml` (typically `main`)
**Status:** Not Started
```

### Body

See [strategy-task-list-formatting.md](../../../reference/strategies/arc/strategy-task-list-formatting.md) for
complete body structure (Overview, Scope, Tasks, Implementation Notes), formatting rules, test-first
patterns, and annotated examples. Use its Quick Format Checklist to verify before saving.

---

## Next Step

When ready to begin implementation:

**→ [activate-work-unit.md](supplemental/activate-work-unit.md)** — Create branch, move docs to
active, update tracking

This can be deferred if planning ahead. Activate when implementation is about to begin.
