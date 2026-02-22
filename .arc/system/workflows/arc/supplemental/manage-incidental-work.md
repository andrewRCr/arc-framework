# Workflow: Manage Incidental Work

**Audience:** Shared context — referenced by both developer and agent when discovered work arises.

**Purpose**: Guidelines for creating and managing incidental task lists—
quality improvements, refactoring, or tech debt discovered during feature or technical work—
that should be addressed immediately.

**When to use**: During feature or technical work when discovering issues requiring multiple subtasks (>30 min effort)
that block or significantly impact current work.

**Related**: [3_process-task-loop.md](../3_process-task-loop.md), [archive-completed.md](archive-completed.md)

---

## Overview

Incidental work is **reactive** (discovered during implementation) vs **proactive** (planned work with PRDs).
This workflow covers what makes incidental work unique—execution follows standard task loop,
archival follows standard archive workflow.

---

## When to Create Incidental Task Lists

### The Key Distinction

**Task lists are for work with distinct phases**, not just complex work.

- **"Sequential steps toward one goal"** → Atomic task (even if 60-90 min, multiple files)
- **"Distinct phases with different objectives"** → Task list

Example: "Clean up auth tech debt" with 5 ordered steps touching 7 files is **one coherent concern** - stays atomic.

Example: "Investigate performance issue" requiring profiling → analysis → design → implementation is
**multiple phases** - needs task list.

### Create Task List When

- ✅ Multiple distinct phases with different goals (research, design, implement are separate stages)
- ✅ Scope likely to expand via discovery (investigation-heavy, unknown boundaries)
- ✅ Estimated 2+ hours of work
- ✅ Requires research → design → implement cycle (each phase produces different artifacts)
- ✅ Would benefit from independent commits/reviews per phase

### Keep as Atomic Task When

- ❌ Single coherent concern, even if complex (multiple files, 30-90 min)
- ❌ Sequential steps all serving one goal (ordered execution, not distinct phases)
- ❌ Scope is known/bounded after initial analysis
- ❌ Could be described as "do X" rather than "figure out X, then design Y, then implement Z"

### Why This Matters

Task lists add overhead: file creation, phase structure, branch lifecycle, archival process. This overhead pays off
when work genuinely has distinct phases that benefit from independent tracking. It's wasted ceremony for focused
refactors that happen to touch multiple files.

**Session duration is not a factor**: Well-structured atomic tasks with subtask checkboxes track progress across
sessions just as effectively as task lists. Don't escalate to task list just because work might span sessions.

---

## Creating Incidental Task Lists

### 1. Create Task File

Before creating, verify the work meets the criteria above. If uncertain, ask for guidance.

**Location**: `.arc/active/incidental/tasks-{brief-slug}.md`

**Naming**: `tasks-{brief-descriptive-slug}.md` (no `incidental-` prefix - directory name provides that context)

Examples:

- `tasks-filter-integration-testing.md`
- `tasks-api-type-safety.md`
- `tasks-security-updates.md`

**Template structure** (same as feature/technical work):

- Context section explaining discovery and why now
- Scope section (will do / won't do)
- Phased task breakdown with standardized format
- Implementation notes as work proceeds

**Formatting standards**: Follow
[strategy-task-list-formatting.md][task-list-formatting] for task list
structure, format, and examples. If your project has a testing methodology strategy, apply test-first
protocol for bug fixes and business logic refactoring.

### 2. Track Creation with Commit

**Guidance**: Lint and commit the new task list immediately for visibility and audit trail.

**Pre-commit check:**

```bash
# Run markdown linting with auto-fix on new task list
npx --yes markdownlint-cli2 --fix --no-globs ".arc/active/incidental/tasks-{slug}.md"
```

**Commit message format**:

```
docs({current-branch}): create {brief-slug} incidental task list

Triggered by {discovery context during current feature/technical work}.
Pausing {current work task} to address {critical issue}.

Related to: .arc/active/{feature|technical}/tasks-{main-work-name}.md
```

**Example**:

```
docs(api-modernization): create auth-error-handling incidental task list

Triggered by Task 3.2 investigation revealing unhandled edge cases in token refresh.
Pausing API modernization to address authentication error handling.

Related to: .arc/active/technical/tasks-api-modernization.md
```

---

## Git Branch for Incidental Work

Incidental work with a dedicated task list gets its own branch. Atomic tasks and inline fixes stay on the
current branch.

**Conventions:**

- **Branch naming**: `incidental/<name>` (matches task list slug — e.g., `incidental/auth-error-handling`)
- **PR against parent branch**: `gh pr create --base parent-branch` (not main)
- **Archive immediately** after branch merge — task list in `.arc/active/` ↔ branch exists

See [Work Organization Strategy][work-org] for complete stacked
branch workflow, merge strategy, and handling branch updates.

---

## Execution, Completion, and Archival

Incidental work follows standard workflows with no special procedures:

- **Execution**: [3_process-task-loop.md](../3_process-task-loop.md) (one task at a time, same quality gates)
- **Commits**: [strategy-development-methodology.md][dev-methodology] § Commit Standards (same standards as
  feature/technical work)
- **Archival**: [archive-completed.md](archive-completed.md) (archive immediately when branch deleted after merge)

---

[dev-methodology]: ../../../../reference/strategies/arc/strategy-development-methodology.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
