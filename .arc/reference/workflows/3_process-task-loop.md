# Workflow: Task Processing Loop

## Purpose

This workflow defines the detailed process for executing tasks defined in ARC task lists (e.g., `.arc/active/*/tasks-*.md`).
It ensures consistent execution, quality control, and documentation of work.

## Task Implementation

- **One sub-task at a time:** Do **NOT** start the next sub‑task without user approval
- **Branch/task list coupling:** Task lists in `.arc/active/` correspond to git branches (branch exists ↔ task list
  active). Archive task list immediately when branch deleted after merge. See
  [Work Organization Strategy](../strategies/arc/strategy-work-organization.md) for details.
- **Completion protocol:**

  1. When you finish a **single sub‑task**:
     - **First**: Run incremental quality checks on modified files - **Tier 1** (linting, type checking, related unit tests)
       - See [Quality Gates Strategy](../strategies/arc/strategy-quality-gates.md) for the tiered approach
       - Task list specifies critical checkpoints, but use judgment: if changes warrant validation, run appropriate checks
       - When task list explicitly calls for quality gates (including E2E checkpoints), they are mandatory
     - **Second**: Mark subtask as `[x]` in task list file (task list reflects completed work when reporting)
       - Update task description to reflect actual work done (not just original plan)
       - Add completion notes with key findings/changes if work deviated from plan
       - **No inline dates**: Don't add completion dates to subtasks (e.g., "Completed: 2025-11-02"). Only the
         task list header `**Completed:**` field should have a date. Inline dates become temporal noise during archival.
       - **Streamline verbose planning details**: When marking complete, keep outcomes (actual changes,
         key decisions, architectural impact) but trim planning scaffolding (pre-implementation steps,
         detailed instructions) that no longer serves a purpose.
     - **Third**: Verify completion before reporting (use pre-report checklist below)
     - **Fourth**: **REPORT** completed work to user with summary of changes
     - **Fifth**: ⛔ **MANDATORY STOP** - Wait for user approval before proceeding

     **Pre-Report Checklist** (verify before generating completion report):

     ```
     - [ ] Quality checks passed (linting, type checking, tests as appropriate)
     - [ ] Task list markdown file edited and saved
     - [ ] Subtask marked [x] in task list
     - [ ] Task description updated to reflect actual work done
     - [ ] Ready to generate user-facing completion report
     ```

     If any item is unchecked, complete it before proceeding to report generation.

     **Note on implied permission:** User approval ("great!", "looks good", "proceed") implies permission to
     continue to the next subtask UNLESS explicitly stated otherwise (e.g., "that's done, but before moving on...").
     In such cases, address the concern before proceeding to the next task-list-documented subtask.

  2. If **all** subtasks underneath a parent task are now `[x]`, follow this sequence:

    - **First**: Mark the **parent task** as `[x]` in the task list file (ensures docs reflect completion)
    - **Second**: Ensure new code has appropriate test coverage for new or modified logic
    - **Third**: Run quality gates - **Tier 2** (full-project type-check, lint, format, unit tests, targeted E2E if
      applicable, build)
    - **Fourth**: Verify completion before reporting (use pre-report checklist below)

  3. Report completion to user

     **Pre-Report Checklist for Parent Task Completion** (verify before reporting):

     ```
     - [ ] All subtasks under parent task marked [x] in task list
     - [ ] Parent task marked [x] in task list
     - [ ] Task list file edited and saved
     - [ ] Tier 2 quality gates passed (full-project lint/type-check/format, unit tests, targeted E2E if applicable, build)
     - [ ] Ready to report completion to user
     ```

     If any item is unchecked, complete it before proceeding to report generation.

  4. Await user instructions on how to proceed.
     User may choose to commit changes (AI can execute only if explicitly approved) or request modifications.
     When committing, follow [Atomic Commit Workflow](supplemental/atomic-commit.md) guidelines.

## Incidental Work Management

### Quick Decision Guide

While working on tasks, you may discover quality improvements, refactoring, or tech debt that should be fixed
immediately. **Quick decision tree**:

**Suggest incidental task list when:**

- ✅ Multiple distinct phases with different goals (not just sequential steps)
- ✅ Scope likely to expand via discovery (investigation-heavy)
- ✅ Estimated 2+ hours OR requires research → design → implement cycle

**Suggest keeping as atomic task (or fixing inline) when:**

- ❌ Single coherent concern, even if complex (multiple files, 30-90 min)
- ❌ Sequential steps all serving one goal
- ❌ Scope is known/bounded after initial analysis

**Key distinction:** "Sequential steps toward one goal" = atomic. "Distinct phases with different objectives" = task list.

### Complete Workflow

**For full incidental work lifecycle** (creation, execution, archival), see:
**→ [manage-incidental-work.md](manage-incidental-work.md)** ← Complete workflow documentation

## Task List Maintenance

### Session-Scoped Tracking vs Task List Files

Many AI coding tools offer ephemeral task tracking (e.g., Claude Code's TodoWrite, or similar
features in other tools). These are useful for organizing work during a sub-task but are
**not a substitute for task list markdown updates**.

**Key distinction:**

- **Session tracking** — Ephemeral, not saved to git. Helps organize current work into steps.
- **Task list markdown** — Permanent record, committed to git. Source of truth for completion
  status. Must be updated before reporting to user.

**Best practice:** When using session tracking for a sub-task, always include a step for updating
the task list markdown. This creates a forcing function to remember the permanent update before
reporting completion.

### Updating Task Lists

- Add new tasks as they emerge during work
- Track file changes via git (no need to manually maintain file lists)

---

## Atomic Tasks

**For tasks tracked in:** `active/ATOMIC-TASKS.md`

Atomic tasks are small, one-off work items (fixes, chores, quick refactors) that don't require
formal task lists. The completion protocol (mark complete, archive, commit format) is documented in
the `ATOMIC-TASKS.md` header.

### When Atomic Tasks Grow

If an atomic task becomes more complex than expected:

1. **Stop** — don't continue as atomic work
2. **Flag to user** — propose creating an incidental task list for proper tracking
3. **If approved**: Remove from ATOMIC-TASKS.md, continue via incidental workflow

See [Incidental Work Management](#incidental-work-management) above.
