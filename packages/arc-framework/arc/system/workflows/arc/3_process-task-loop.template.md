---
purpose: Execute tasks from ARC task lists — completion protocol, quality gates, stops, and incidental work routing.
audience: agent
arc:
  methods:
    - issue-triage
    - quality-gate-commands
    - test-first
  extensions:
    - post-task-quality
    - post-unit-quality
    - post-task-completion
---

# Workflow: Task Processing Loop

## Task Implementation

- **One task at a time:** Each checkbox in the task list is one review increment — a bounded chunk of
  autonomous execution between human review points. Complete one, mark it `[x]`, report, and **stop**
  for user approval.

  <!-- arc:if team.mode == true -->

  In team mode, this applies per developer-agent pair — concurrent pairs may work different tasks.

  **Before starting a task**, check `(@name)` ownership markers in the task list:

    - If the task has your `(@identity)` marker → proceed
    - If the task is unowned (no `(@name)` marker) → claim it by adding your marker, then proceed
    - If the task is owned by someone else → skip to your next owned or unowned task

  See [Team Coordination Strategy][team-coordination] § Task Ownership for the full convention.

  <!-- arc:endif -->

- **Branch/task list coupling:** A task list may span one or more branches (stacked PRs, team
  sub-branches, phased delivery). Archive when all tasks are marked complete — branch cleanup
  happens independently as PRs merge. When creating additional branches for an existing task list,
  update the `**Branch(es):**` header field to include the new branch name. For intermediate merges,
  see [rotate-branch][rotate-branch]. See [Work Organization Strategy][work-org] for the full
  relationship model.

- **Co-development awareness:** The developer may be editing files or making commits alongside you.
  Treat parallel changes as expected context, not interruptions. If changes conflict with your
  current task, flag the conflict and ask how to proceed.

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
  your completion report to the user (e.g., "behaviors tightly coupled, single-pass
  implementation") — not in task list completion notes. This makes the decision visible during
  review without bloating the persistent record.

- **Issue triage:** When you encounter pre-existing issues in files you're modifying,
  follow the [issue-triage method][arc-methods-it] for severity assessment and fix-vs-defer decisions.

- **Completion protocol:**

  1. When you finish a **single task** (one checkbox item):
     - **First**: Run incremental quality checks on modified files — **Tier 1** — using the
       [quality-gate-commands method][arc-methods-qg]
       - **Tier boundaries:** See [Quality Gates Strategy][quality-gates].
       - Task list may specify additional checkpoints (including E2E) — those are mandatory; otherwise
         use judgment on whether changes warrant extra validation
     - **Extensions** · `#post-task-quality`: If `post-task-quality` appears in the active-extensions list
       (established at session init), load and execute its [`.actions`][arc-ext-task-quality]. Otherwise, skip.
     - **Second**: Mark task as `[x]` in task list file (task list reflects completed work when reporting)
       - Update task description to reflect actual work done (not just original plan)
       - **No inline dates**: Don't add completion dates to individual tasks (e.g., "Completed: 2025-11-02"). Inline
         dates become temporal noise during archival. WU-level completion date lives on the completion doc's
         `**Completed:**` field; no task list or per-task date stamp is expected.
       - **Completion notes — content discipline.** At task completion, **replace** pre-completion descriptors
         (Goal, Note, Rationale, Approach, Context, Design decisions) with a single outcome record. Don't
         accumulate plan AND outcome — the historical record needs only what was done. Outcome content is
         optional when the task title carries the work; not every `[x]` requires a notes block.

         **Include:** what changed (key files/symbols when not obvious from the title); decisions worth
         preserving — only when the choice would surprise a reader; cross-references to the commit, ADR, or
         `notes-{name}.md` for deeper context.

         **Exclude:** quality-gate outcomes (`[x]` already implies they passed; metrics like "840/840 tests"
         or "Tier 2 clean" are noise); per-decision rationale already in the commit body or `notes-{name}.md`
         (link, don't restate); test-batching / sequencing narrative (mention only if deviating from project
         default); process narration (what was tried, debugging steps, mid-task discoveries); forward planning
         (belongs in next task entry or Next Action).

         **Soft cap:** ~3 lines for atomic subtasks, ~6 lines for parent tasks summarizing rolled-up scope.
         Longer content belongs in `notes-{name}.md`.

         **Per-subtask outcome content:** the indented description bullet under each subtask shifts from plan
         to outcome at `[x]`. Same shape, no label change — the indent under a `[x]` already signals "what
         got done."
       - **Deferred or superseded tasks**: When a task is intentionally skipped — deferred to a later work
         unit, made irrelevant by a design decision, or superseded by a different approach — mark it `[~]`
         instead of `[x]`. Add a brief outcome note explaining why (e.g., "Deferred to WU3", "Superseded by
         ADR-011"). This distinguishes deliberate deferrals from incomplete work (`[ ]`).
       - **Do not update `status-{name}.md` at this step.** See [DEV-RULES.ARC][dev-rules-arc]
         § Status-file timing.
     - **Extensions** · `#post-task-completion`: If `post-task-completion` appears in the active-extensions
       list (established at session init), load and execute its [`.actions`][arc-ext-task-completion].
       Otherwise, skip. Teams using external trackers (Jira, Linear, GitHub Issues) use this extension to
       sync task completion status — see [Team Coordination Strategy][team-coordination] § External Tracker
       Integration.
     - **Third**: Verify completion before reporting (use pre-report checklist below)
     - **Fourth**: **REPORT** completed work to user with summary of changes
     - **Fifth**: ⛔ **MANDATORY STOP** - Wait for user approval before proceeding
       - **Structured prompt** — end the completion report with `<Prefix> <Target>?`:
           - **Prefix:** `Proceed` (default — manual-commit) or `Commit and proceed` (when
             `session.autonomy` permits auto-commit).
           - **Target:** `to Task X.Y` (next task in phase) · `to Phase N+1, Task N+1.1` (current
             task ends the phase) · `to integrate-work-unit` (verification complete — WU end).
       - **Response semantics:** Short affirmative as first word ("y", "yes", "ok") advances.
         Redirect syntax preserved — `y, also <X>` and `y; <redirect>` advance while folding in
         the addendum.
       - **Implied permission:** User approval ("looks good", "proceed") implies permission to
         continue to the next task UNLESS explicitly stated otherwise. Address any stated concerns
         before moving on.

     **Pre-Report Checklist** (verify before generating completion report):

     ```
     - [ ] Quality checks passed (linting, type checking, tests as appropriate)
     - [ ] Task list markdown file edited and saved
     - [ ] Task marked [x] in task list
     - [ ] Task description updated to reflect actual work done
     - [ ] Ready to generate user-facing completion report
     ```

     If any item is unchecked, complete it before proceeding. For quality gate failures: fix
     obvious issues (lint, type errors) and re-run; for non-obvious failures, end the completion
     report with the structured-prompt variant `Quality gates failed: <details>. Investigate?
     (y / iterate)` — first-word `y` enters investigation; `iterate` retries the gates after a
     fix.

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

     Stop conditions are not suspended by deferred review — a non-auto-fixable gate failure
     ends the deferred scope early and surfaces the issue to the user.

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
    - **Extensions** · `#post-unit-quality`: If `post-unit-quality` appears in the active-extensions list
      (established at session init), load and execute its [`.actions`][arc-ext-unit-quality]. Otherwise, skip.
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
     User may choose to commit changes or request modifications. Commit authority follows
     `session.autonomy`: under `manual-commit`, the structured prompt's `Commit and proceed`
     branch is gated behind explicit user approval (the affirmative response IS the approval);
     under `auto-commit` / `auto-push`, the commit-interlock releases on task approval per
     [Configurability Architecture Strategy][config-arch] § Session autonomy.
     When committing, follow the [prepare-commits workflow](supplemental/prepare-commits.md).

     <!-- arc:if team.mode == true -->

     **Shared branch concurrency:** When multiple developers commit to the same branch, pull
     before committing to reduce merge conflicts on the status file and the task list. If a
     conflict occurs, resolve the status file by updating it to reflect the current combined
     state (not either side's version). Task list conflicts are resolved by accepting both
     sides' checkbox changes.

     <!-- arc:endif -->

     **Atomicity check (before staging):** Do all changes serve one logical concern? When in
     doubt, split and ask. See [Commit Discipline][dev-rules-arc].

## Verification Phase

Every task list ends with a verification phase — a single task that points to the
verification workflow. Load the workflow and follow it; the task description is a pointer,
not a standalone instruction.

**→ [verify-work-unit.md](work-unit-lifecycle/verify-work-unit.md)** ← Load and follow for the verification task

## Next Step

When all tasks are marked complete and the verification phase has passed, proceed to integration:

**→ [integrate-work-unit.md](work-unit-lifecycle/integrate-work-unit.md)** — Documentation cleanup, code review, PR,
and merge

## Incidental Work Management

### Quick Decision Guide

When work surfaces that should be fixed, decide atomic vs. task list:

- **Atomic task** (or fix inline): single coherent concern; sequential steps toward one goal; bounded scope.
- **Incidental task list**: multiple distinct phases with different goals; discovery-heavy scope; 2+ hours.

For the full decision tree, see [manage-incidental-work.md][manage-incidental].

### Where to Capture Atomic Tasks

Routing depends on lifecycle intent — "during this WU" goes to the atomic companion file
(`atomic-{name}.md`); "for later" depends on PM mode. See [DEV-RULES.ARC][dev-rules-arc]
§ Leave it cleaner for the full routing table.

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

Ephemeral task tracking tools (e.g., TodoWrite) are **not a substitute for task list markdown
updates**. Always update the task list file before reporting completion.

### Updating Task Lists

- Add new tasks as they emerge during work
- Track file changes via git (no need to manually maintain file lists)

---

[work-org]: ../../../reference/strategies/arc/strategy-work-organization.md
[quality-gates]: ../../../reference/strategies/arc/strategy-quality-gates.md
[config-arch]: ../../../reference/strategies/arc/strategy-configurability-architecture.md
[dev-rules-arc]: ../../../reference/constitution/DEV-RULES.ARC.md
[rotate-branch]: work-unit-lifecycle/rotate-branch.md
[manage-incidental]: supplemental/manage-incidental-work.md
[arc-ext-task-quality]: ../../extensions/post-task-quality.md
[arc-ext-task-completion]: ../../extensions/post-task-completion.md
[arc-ext-unit-quality]: ../../extensions/post-unit-quality.md
[arc-methods-tf]: ../../methods/test-first.md
[arc-methods-it]: ../../methods/issue-triage.md
[arc-methods-qg]: ../../methods/quality-gate-commands.md
[team-coordination]: ../../../reference/strategies/arc/strategy-team-coordination.md
