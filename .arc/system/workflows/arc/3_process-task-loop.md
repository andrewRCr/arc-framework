# Workflow: Task Processing Loop

**Audience:** Agent-executed — your agent follows this protocol during task execution.

## Purpose

This workflow defines the detailed process for executing tasks defined in ARC task lists (e.g., `.arc/active/*/tasks-*.md`).
It ensures consistent execution, quality control, and documentation of work.

## Task Implementation

- **One task at a time:** Each checkbox in the task list is one work unit — whether it's a standalone
  task or a subtask under a parent. Complete one, mark it `[x]`, report, and **stop** for user approval.
  In team mode, this applies per developer-agent pair — concurrent pairs may work different tasks.
- **Branch/task list coupling:** A task list may span one or more branches (stacked PRs, team
  sub-branches, phased delivery). Archive when all tasks are marked complete — branch cleanup
  happens independently as PRs merge. When creating additional branches for an existing task list,
  update the `**Branch(es):**` header field to include the new branch name. For intermediate merges,
  see [rotate-branch][rotate-branch]. See [Work Organization Strategy][work-org] for the full
  relationship model.
- **Co-development awareness:** The developer may be working alongside you — editing files, running
  commands, or making commits while you execute tasks. This is a normal part of the ARC workflow:
  single-threaded, small-scope tasks keep the developer close enough to the work to contribute
  directly. Treat parallel changes as expected context, not interruptions. If changes conflict with
  your current task, flag the conflict and ask how to proceed.
- **Test-first assessment:** Before implementing, assess whether tests should be written first per the
  [test-first method][arc-methods-tf]. This informs task ordering — test tasks precede implementation
  when test-first applies.
- **Quality issue triage:** When you encounter pre-existing quality issues in files you're modifying,
  follow the [leave-it-cleaner method][arc-methods-lic] for severity triage and fix-vs-defer decisions.
- **Completion protocol:**

  1. When you finish a **single task** (one checkbox item):
     - **First**: Run incremental quality checks on modified files — **Tier 1** — using the
       [quality-gate-commands method][arc-methods-qg]
       - See [Quality Gates Strategy][quality-gates] for the tiered approach
       - Task list specifies critical checkpoints, but use judgment: if changes warrant validation, run appropriate checks
       - When task list explicitly calls for quality gates (including E2E checkpoints), they are mandatory
     - **Extensions** · `#post-task-quality`: If [post-task-quality extensions][arc-ext-task-quality] are configured,
       execute them before proceeding. See [`arc-extensions.md` § post-task-quality][arc-ext-task-quality]
     - **Second**: Mark task as `[x]` in task list file (task list reflects completed work when reporting)
       - Update task description to reflect actual work done (not just original plan)
       - Add completion notes with key findings/changes if work deviated from plan
       - **No inline dates**: Don't add completion dates to individual tasks (e.g., "Completed: 2025-11-02"). Only the
         task list header `**Completed:**` field should have a date. Inline dates become temporal noise during archival.
       - **Streamline verbose planning details**: When marking complete, keep outcomes (actual changes,
         key decisions, architectural impact) but trim planning scaffolding (pre-implementation steps,
         detailed instructions) that no longer serves a purpose.
       - **Deferred or superseded tasks**: When a task is intentionally skipped — deferred to a later work
         unit, made irrelevant by a design decision, or superseded by a different approach — mark it `[~]`
         instead of `[x]`. Add a brief note explaining why (e.g., "Deferred to WU3", "Superseded by
         ADR-011"). This distinguishes deliberate deferrals from incomplete work (`[ ]`).
     - **Extensions** · `#post-task-completion`: If [post-task-completion extensions][arc-ext-task-completion] are
       configured, execute them now. Teams using external trackers (Jira, Linear, GitHub Issues) use this
       extension to sync task completion status — see [Team Coordination Strategy][team-coordination]
       § External Tracker Integration. See [`arc-extensions.md` § post-task-completion][arc-ext-task-completion]
     - **Third**: Verify completion before reporting (use pre-report checklist below)
     - **Fourth**: **REPORT** completed work to user with summary of changes
     - **Fifth**: ⛔ **MANDATORY STOP** - Wait for user approval before proceeding

     **Pre-Report Checklist** (verify before generating completion report):

     ```
     - [ ] Quality checks passed (linting, type checking, tests as appropriate)
     - [ ] Task list markdown file edited and saved
     - [ ] Task marked [x] in task list
     - [ ] Task description updated to reflect actual work done
     - [ ] Ready to generate user-facing completion report
     ```

     If any item is unchecked, complete it before proceeding to report generation.

     **Note on implied permission:** User approval ("great!", "looks good", "proceed") implies permission to
     continue to the next task UNLESS explicitly stated otherwise (e.g., "that's done, but before moving on...").
     In such cases, address the concern before proceeding to the next task.

     **Deferred review:** When the user explicitly requests continuation through a specific set
     of tasks (e.g., "work through tasks 5.2-5.4 while I'm away"), the mandatory stop between
     those tasks is deferred. The user defines the scope — the agent never self-invokes this.
     Complete only the specified work — update the task list and run quality gates after each
     task, but continue to the next without waiting for approval. Leave sufficient context for
     the user to review, iterate, commit, and hand off when they return.

     Stop when the specified scope is complete, or earlier if a stop condition is met:

     - **Must stop:** quality gate failure that can't be auto-fixed, blocking dependency on
       another task or external input, unanticipated design decision that needs user input,
       or scope significantly exceeding expectations for the task
     - **Continue with note:** auto-fixable lint issues (fix and note), task taking longer
       than expected but progressing, minor deviation from plan that doesn't change outcomes

  2. **Coherent unit completion:** If the task you just finished completes a coherent unit of work —
     the last subtask under a parent (all subtasks now `[x]`), or a standalone task that touches
     integration-tested code — follow this additional sequence. Note: phase headers are
     organizational groupings, not trackable items — phase completion is implicit when all tasks
     within the phase are complete.

    - **First**: Mark the **parent task** as `[x]` in the task list file if it has subtasks (ensures docs
      reflect completion)
    - **Second**: Ensure new code has appropriate test coverage for new or modified logic
    - **Third**: Run quality gates — **Tier 2** — using the [quality-gate-commands method][arc-methods-qg]
    - **Extensions** · `#post-unit-quality`: If [post-unit-quality extensions][arc-ext-unit-quality] are configured,
      execute them before proceeding. See [`arc-extensions.md` § post-unit-quality][arc-ext-unit-quality]
    - **Fourth**: Verify completion before reporting (use pre-report checklist below)

  3. Report completion to user

     **Pre-Report Checklist for Coherent Unit Completion** (verify before reporting):

     ```
     - [ ] All subtasks marked [x] (if parent task with subtasks) or standalone task marked [x]
     - [ ] Parent task marked [x] in task list (if it has subtasks — phase headers don't get checkboxes)
     - [ ] Task list file edited and saved
     - [ ] Tier 2 quality gates passed (per quality-gate-commands method)
     - [ ] Ready to report completion to user
     ```

     If any item is unchecked, complete it before proceeding to report generation.

  4. Await user instructions on how to proceed.
     User may choose to commit changes (AI can execute only if explicitly approved) or request modifications.
     When committing, follow [Commit Guide](supplemental/commit-guide.md) guidelines.

     **WORK-STATUS.md (stage with every task commit):** Before staging, update WORK-STATUS.md —
     advance Next Task, Last Completed, and Next Action to reflect the post-commit state. Stage
     it alongside the task list changes. This is the primary update mechanism; session handoff is
     only a fallback. See [Commit Discipline][dev-rules-arc] § Work status accuracy.

     **Atomicity check (before staging):** Do all changes serve one logical concern? Common
     splits to watch for: task work vs. unrelated tooling/config fixes, code changes vs. task
     list tracking updates (when they can stand alone), multiple completed tasks that touched
     independent areas. When in doubt, smaller commits are better — split and ask. See
     [Commit Discipline][dev-rules-arc] for the full atomicity principle.

## Verification Phase

Every task list ends with a verification phase as its final phase. The standard task-by-task
completion protocol applies, but the two verification tasks (Tier 3 gates + success criteria
validation) follow a specific protocol.

**→ [verify-completion.md](supplemental/verify-completion.md)** ← Full verification protocol

## Next Step

When all tasks are marked complete and the verification phase has passed, proceed to integration:

**→ [integrate-work-unit.md](supplemental/integrate-work-unit.md)** — Documentation cleanup, code review, PR, and merge

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
**→ [manage-incidental-work.md](supplemental/manage-incidental-work.md)** ← Complete workflow documentation

## Task List Maintenance

### Session-Scoped Tracking vs Task List Files

Many AI coding tools offer ephemeral task tracking (e.g., Claude Code's TodoWrite, or similar
features in other tools). These are useful for organizing work during a task but are
**not a substitute for task list markdown updates**.

**Key distinction:**

- **Session tracking** — Ephemeral, not saved to git. Helps organize current work into steps.
- **Task list markdown** — Permanent record, committed to git. Source of truth for completion
  status. Must be updated before reporting to user.

**Best practice:** When using session tracking for a task, always include a step for updating
the task list markdown. This creates a forcing function to remember the permanent update before
reporting completion.

### Updating Task Lists

- Add new tasks as they emerge during work
- Track file changes via git (no need to manually maintain file lists)

---

[work-org]: ../../../reference/strategies/arc/strategy-work-organization.md
[quality-gates]: ../../../reference/strategies/arc/strategy-quality-gates.md
[dev-rules-arc]: ../../../reference/constitution/DEV-RULES.ARC.md
[rotate-branch]: supplemental/rotate-branch.md
[arc-ext-task-quality]: ../arc-extensions.md#post-task-quality
[arc-ext-task-completion]: ../arc-extensions.md#post-task-completion
[arc-ext-unit-quality]: ../arc-extensions.md#post-unit-quality
[arc-methods-tf]: ../arc-methods.md#test-first
[arc-methods-lic]: ../arc-methods.md#leave-it-cleaner
[arc-methods-qg]: ../arc-methods.md#quality-gate-commands
[team-coordination]: ../../../reference/strategies/arc/strategy-team-coordination.md
