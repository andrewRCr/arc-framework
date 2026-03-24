# Workflow: Task Processing Loop

**Audience:** Agent-executed — your agent follows this protocol during task execution.

## Purpose

This workflow defines the detailed process for executing tasks defined in ARC task lists (e.g., `.arc/active/*/tasks-*.md`).
It ensures consistent execution, quality control, and documentation of work.

## Task Implementation

**Method dependencies (load on first reference):** This workflow references three arc-methods. When first
encountered, load the relevant section of [`arc-methods.md`][arc-methods] — check `.override` first; use
`.default` if no override is configured.

- [issue-triage][arc-methods-it] — severity triage for pre-existing issues (the "leave it cleaner" rule)
- [quality-gate-commands][arc-methods-qg] — project quality gate definitions
- [test-first][arc-methods-tf] — decision tree (only when task has `Build \`test-first\`` marker)

- **One task at a time:** Each checkbox in the task list is one review increment — a bounded chunk of
  autonomous execution between human review points. Complete one, mark it `[x]`, report, and **stop**
  for user approval. In team mode, this applies per developer-agent pair — concurrent pairs may work
  different tasks.

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

- **Test-first execution:** When a task has a `Build \`test-first\` (one behavior at a time):` marker
  (per the [test-first method][arc-methods-tf]), execute as vertical slices — one behavior at a time:
    1. **RED:** Write one test for one behavior listed in the task → run it → confirm it fails
    2. **GREEN:** Write minimal code to make it pass
    3. **REFACTOR:** Review the code you just wrote. If you see duplication, unclear naming, or an
       abstraction emerging — refactor now (all tests must stay green). If the code is clean, move on.
    4. Next behavior → repeat from RED

  Test cases listed in the task are behaviors to cover, not an execution sequence — let each cycle
  inform the next. If your project has a testing methodology strategy, consult it for project-specific
  TDD details (mocking rules, fixture conventions, tier boundaries).

  **Batching judgment:** When behaviors are tightly coupled (single function, shared setup, no
  independent discovery value), batching tests before implementing is a pragmatic alternative to
  strict one-at-a-time slicing. When you batch rather than slice, note the rationale briefly in
  your completion report (e.g., "behaviors tightly coupled, single-pass implementation"). This
  makes the decision visible — silent compliance and silent deviation should not look identical.

- **Issue triage:** When you encounter pre-existing issues in files you're modifying,
  follow the [issue-triage method][arc-methods-it] for severity assessment and fix-vs-defer decisions.

- **Completion protocol:**

  1. When you finish a **single task** (one checkbox item):
     - **First**: Run incremental quality checks on modified files — **Tier 1** — using the
       [quality-gate-commands method][arc-methods-qg]
       - **Tier definitions:** Tier 1 (per-task): quality-gate-commands on modified files only ·
         Tier 2 (coherent unit): full-project Tier 1 + targeted integration/E2E + build ·
         Tier 3 (phase/pre-PR): all checks, all configurations, full suite.
         See [Quality Gates Strategy][quality-gates] for boundaries and escalation.
       - Task list may specify additional checkpoints (including E2E) — those are mandatory; otherwise
         use judgment on whether changes warrant extra validation
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

     If any item is unchecked, complete it before proceeding. For quality gate failures: fix
     obvious issues (lint, type errors) and re-run; report non-obvious failures in your
     completion summary — you're about to stop for review anyway.

     **Note on implied permission:** User approval ("great!", "looks good", "proceed") implies permission to
     continue to the next task UNLESS explicitly stated otherwise (e.g., "that's done, but before moving on...").
     In such cases, address the concern before proceeding to the next task.

     **Deferred review:** When the user explicitly requests continuation through a specific set
     of tasks (e.g., "work through tasks 5.2-5.4 while I'm away"), the mandatory stop between
     those tasks is deferred. The user defines the scope — the agent never self-invokes this.
     Complete only the specified work — update the task list and run quality gates after each
     task, but continue to the next without waiting for approval. Leave the task list updated,
     quality gates passing, and changes uncommitted (user decides commit boundaries when they
     return).

     Stop when the specified scope is complete, or earlier if a stop condition is met:

     - **Must stop:** quality gate failure that can't be auto-fixed, blocking dependency on
       another task or external input, unanticipated design decision that needs user input,
       or scope significantly exceeding expectations for the task
     - **Continue with note:** auto-fixable lint issues (fix and note), task taking longer
       than expected but progressing, minor deviation from plan that doesn't change outcomes

  2. **Coherent unit completion:** If the task you just finished completes a coherent unit of work —
     the last subtask under a parent (all subtasks now `[x]`), or a standalone task that modifies
     cross-cutting code (shared services, middleware, configuration, API contracts) — follow this
     additional sequence. Note: phase headers are
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
     When committing, follow [Commit Guide](supplemental/prepare-commits.md) guidelines.

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
completion protocol applies, but the verification tasks (Tier 3 gates, success criteria
validation, atomic task resolution) follow a specific protocol.

**→ [verify-work-unit.md](work-unit-lifecycle/verify-work-unit.md)** ← Full verification protocol

## Next Step

When all tasks are marked complete and the verification phase has passed, proceed to integration:

**→ [integrate-work-unit.md](work-unit-lifecycle/integrate-work-unit.md)** — Documentation cleanup, code review, PR,
and merge

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

### Where to Capture Atomic Tasks

Once you've decided something is an atomic task (not an incidental task list), route it based
on **lifecycle intent** — when you intend to handle it, not what domain it's in:

- **Will do during this work unit** → add to the **atomic companion file** (`atomic-{name}.md`
  in the same directory as the task list). All task lists have a companion file.
- **For later** (won't do during this WU) → depends on PM mode:
    <!-- arc:if pm.mode == arc-in-git -->
    - `arc-in-git`: add to **ATOMIC-INBOX.md** in `user/{identity}/` (personal, gitignored,
      branch-agnostic — persists across work unit boundaries)
    <!-- arc:endif -->
    <!-- arc:if pm.mode != arc-in-git -->
    - `none` / `external`: per project convention (DEV-RULES.PROJECT) — default: ask user
    <!-- arc:endif -->

### Atomic Task Completion

When you complete an atomic task (in the companion file or ATOMIC-INBOX), follow this protocol:

1. **Mark `[x]`** and update the description — trim planning scaffolding (problem statement,
   research steps, options to evaluate) to outcomes (what was done, key decisions, files changed).
   Same principle as task list completion notes.
2. **Reorder** — move the completed task below all incomplete tasks (`[ ]`). Among completed tasks,
   maintain completion order: oldest completed first, most recently completed last. This keeps
   pending work immediately visible when the file is opened.
3. **Verify ordering** — incomplete tasks at the top, then a visual gap (blank line), then
   completed tasks in chronological completion order.

### Complete Workflow

**For full incidental work lifecycle** (creation, execution, archival), see:
**→ [manage-incidental-work.md](supplemental/manage-incidental-work.md)** ← Complete workflow documentation

## Task List Maintenance

### Session-Scoped Tracking vs Task List Files

Ephemeral task tracking tools (e.g., Claude Code's TodoWrite) help organize work within a
session but are **not a substitute for task list markdown updates**. The task list file is the
permanent record committed to git — always update it before reporting completion.

### Updating Task Lists

- Add new tasks as they emerge during work
- Track file changes via git (no need to manually maintain file lists)

---

[work-org]: ../../../reference/strategies/arc/strategy-work-organization.md
[quality-gates]: ../../../reference/strategies/arc/strategy-quality-gates.md
[dev-rules-arc]: ../../../reference/constitution/DEV-RULES.ARC.md
[rotate-branch]: work-unit-lifecycle/rotate-branch.md
[arc-ext-task-quality]: ../arc-extensions.md#post-task-quality
[arc-ext-task-completion]: ../arc-extensions.md#post-task-completion
[arc-ext-unit-quality]: ../arc-extensions.md#post-unit-quality
[arc-methods]: ../arc-methods.md
[arc-methods-tf]: ../arc-methods.md#test-first
[arc-methods-it]: ../arc-methods.md#issue-triage
[arc-methods-qg]: ../arc-methods.md#quality-gate-commands
[team-coordination]: ../../../reference/strategies/arc/strategy-team-coordination.md
