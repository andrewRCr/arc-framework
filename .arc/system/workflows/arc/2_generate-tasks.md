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

Check [STRATEGY-INDEX.md][strategy-index] for project-level strategies relevant to
this work (e.g., testing methodology, component patterns, service layer conventions). Read applicable
strategies before designing phases — they directly influence task structure and approach.

### Step 2: Design Phases

Identify 3-7 major phases that organize the work into logical, testable milestones. Present these
to the user for review before breaking down into sub-tasks.

**Principles:**

- Each phase should produce testable, verifiable progress
- Order phases to minimize dependencies and enable incremental delivery
- Place tests before or alongside implementation, not in a separate final phase
- **Always end with a verification phase** — two tasks: (1) run Tier 3 quality gates,
  (2) validate success criteria against PRD. See
  [task-list-formatting strategy][task-list-formatting] § Verification Phase for conventions

### Step 3: Break Down into Sub-Tasks

For each phase, define specific, actionable sub-tasks:

- Small enough to complete in a single work session (typically < 3 files modified)
- Include quality checkpoints at appropriate stages
  (see [Quality Gates Strategy][quality-gates] for tier guidance)
- Reference specific files, patterns, or approaches where helpful
- No time estimates — focus on clear scope and completion criteria

**Test-first ordering (critical):** For data models, API endpoints, business logic, and complex
algorithms — write test sub-tasks BEFORE implementation sub-tasks. See
[DEV-RULES.ARC][dev-rules-arc]
§ Test-first assessment for what requires test-first vs test-after.

**If your project has a testing methodology strategy** (e.g., `strategy-testing-methodology.md`),
consult it for project-specific test patterns and coverage expectations.

### Step 4: Write and Save Task List

Combine phases and sub-tasks into the final task list following the format described below.
Implementation notes, technical context, and design rationale belong in the dedicated notes
file (`notes-{name}.md`), not in the task list.

**Save to** (location depends on [`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git** (backlog pipeline): `.arc/backlog/{category}/tasks-{{WORK_NAME}}.md`
- **none / external** (no backlog): `.arc/active/{category}/tasks-{{WORK_NAME}}.md`

Name should match the PRD (e.g., `prd-api-modernization.md` → `tasks-api-modernization.md`).

See [Task Processing Loop](3_process-task-loop.md) for how task lists are executed.

---

## Task List Format

### Header

```markdown
# Task List: [Work Name]

**PRD:** `.arc/[location]/[category]/prd-[name].md`
**Created:** YYYY-MM-DD
**Branch:** `feature/[name]` or `technical/[name]`
**Base Branch:** base branch per `arc-config.yml` (typically `main`)
**Status:** Not Started
```

The PRD path should reflect the PRD's current location (matching the task list's save location).
In arc-in-git mode, [activation][activate-work-unit] updates both paths when documents move to
`active/`.

### Body

See [strategy-task-list-formatting.md][task-list-formatting] for
complete body structure (Overview, Scope, Tasks, Verification Phase, Success Criteria), formatting
rules, test-first patterns, and annotated examples. Use its Quick Format Checklist to verify
before saving.

---

## Next Step

When ready to begin implementation:

**→ [activate-work-unit.md](supplemental/activate-work-unit.md)** — Create branch, move docs to
active, update tracking

This can be deferred if planning ahead. Activate when implementation is about to begin.

---

[strategy-index]: ../../../reference/strategies/STRATEGY-INDEX.md
[quality-gates]: ../../../reference/strategies/arc/strategy-quality-gates.md
[dev-rules-arc]: ../../../reference/constitution/DEV-RULES.ARC.md
[task-list-formatting]: ../../../reference/strategies/arc/strategy-task-list-formatting.md
[arc-config]: ../../arc-config.yml
[activate-work-unit]: supplemental/activate-work-unit.md
