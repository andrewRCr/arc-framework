---
purpose: Create and manage incidental task lists for work discovered during implementation.
audience: collaborative (human and agent)
---

# Workflow: Manage Incidental Work

**When to use**: During feature or technical work when discovering issues requiring multiple subtasks (>30 min effort)
that block or significantly impact current work.

**Related**: [3_process-task-loop.md](../3_process-task-loop.md),
[integrate-work-unit.md](../work-unit-lifecycle/integrate-work-unit.md), [archive-work-unit.md](../work-unit-lifecycle/archive-work-unit.md)

---

## When to Create Incidental Task Lists

### The Key Distinction

**Task lists are for work with distinct phases**, not just complex work.

- **"Sequential steps toward one goal"** → Atomic task (even if 60-90 min, multiple files)
- **"Distinct phases with different objectives"** → Task list

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

**Session duration is not a factor**: Well-structured atomic tasks with subtask checkboxes track progress across
sessions just as effectively as task lists. Don't escalate to task list just because work might span sessions.

---

## Creating Incidental Task Lists

### 1. Create Task File

Before creating, verify the work meets the criteria above. If uncertain, ask for guidance.

**Location**: `.arc/active/incidental/tasks-{brief-slug}.md`

**Naming**: `tasks-{brief-descriptive-slug}.md` (no `incidental-` prefix — directory name provides that context;
e.g., `tasks-auth-error-handling.md`)

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

---

## Git Branch for Incidental Work

Incidental work with a dedicated task list gets its own branch. Atomic tasks and inline fixes
typically stay on the current branch.

**Exception — fully protected repositories:** Under `branch.protection: full`, all changes require
branches. An atomic task unrelated to the current branch's scope needs its own branch even without
a task list. This is a **branch without a work unit** — no task list, no PRD, no archive ceremony:

- Create a branch (`incidental/<brief-slug>` or `fix/<brief-slug>`)
- Commit the fix with a descriptive message and `Context:` footer
- PR against the parent branch, merge, delete the branch
- No archival workflow — there are no work unit artifacts to archive

**Conventions (task list branches):**

- **Branch naming**: `incidental/<name>` (matches task list slug — e.g., `incidental/auth-error-handling`)
- **PR against parent branch**: `gh pr create --base parent-branch` (not main)
- **Archive when all tasks complete** — branch cleanup happens independently as PRs merge.
  See [integrate-work-unit.md](../work-unit-lifecycle/integrate-work-unit.md) for the integration workflow

See [Work Organization Strategy][work-org] for complete stacked
branch workflow, merge strategy, and handling branch updates.

---

## Coordinated Pause/Resume

Interrupt coordination is symmetric — every pause has a corresponding resume, and both meta files flip in the
same commit as the triggering lifecycle event. The task list carries structural metadata only; dynamic interrupt
state (`State`, `Interrupts`, `Paused At`, `Paused To`) lives in meta files.

**Atomic-commit requirement:** The parent meta file update and the incidental artifact change (create, archive,
or delete) must land in a single commit. A split would leave the repo with a paused parent whose pointer resolves
to nothing, or an incidental with a dangling `Interrupts:` pointer.

### Activation — incidental interrupts active WU

Triggered during [activate-work-unit.md](../work-unit-lifecycle/activate-work-unit.md). The pause/resume protocol
layers on top of the standard activation flow — the incidental activates normally (branch, meta file, task list
status), with the parent paused as a paired operation.

1. Create `.arc/active/incidental/meta-{incidental-name}.md` from [`template-meta.md`][template-status].
2. On the incidental meta file, set the `**Interrupts:**` pointer to the parent WU:

    ```markdown
    **Interrupts:** {parent-category}/{parent-name}
    ```

3. Update the parent meta file (`.arc/active/{parent-category}/status-{parent-name}.md`):
    - `**State:**` → `Paused (YYYY-MM-DD) — interrupted by incidental/{incidental-name}`
    - Add `**Paused At:** Task X.Y` — the task where parent work stopped
    - Add `**Paused To:** incidental/{incidental-name}`

### Completion — incidental archives cleanly

Triggered during [archive-work-unit.md](../work-unit-lifecycle/archive-work-unit.md) when all incidental tasks are
complete. Archival `git rm`s `meta-{incidental-name}.md` — the parent flips back to active in the same commit.

1. Archive the incidental via the standard archive workflow (deletes `meta-{incidental-name}.md`).
2. Update the parent meta file:
    - `**State:**` → `In Progress`
    - Remove `**Paused At:**` and `**Paused To:**` entirely

The parent's `**Next Task:**` and `**Next Action:**` may also need refreshing if the incidental changed the
landscape — update alongside the state flip.

### Abandonment — incidental deactivates without work executed

Triggered during [deactivate-work-unit.md](../work-unit-lifecycle/deactivate-work-unit.md) (Case A) when the
incidental was activated but work never proceeded — false alarm, scope disagreement, or reclassified as a
different kind of work.

1. Deactivate via the deactivation workflow. If `meta-{incidental-name}.md` was already created, deactivation
   deletes it; if never created, nothing to delete.
2. Update the parent meta file — same flip as completion:
    - `**State:**` → `In Progress`
    - Remove `**Paused At:**` and `**Paused To:**`

---

## Execution, Completion, and Archival

Incidental work follows standard workflows with no special procedures:

- **Execution**: [3_process-task-loop.md](../3_process-task-loop.md) (one task at a time, same quality gates)
- **Commits**: [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline (same standards as
  feature/technical work)
- **Integration**: [integrate-work-unit.md](../work-unit-lifecycle/integrate-work-unit.md) (doc prep, review, PR,
  merge when all tasks complete)
- **Archival**: [archive-work-unit.md](../work-unit-lifecycle/archive-work-unit.md) (post-merge archive)

---

[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[template-status]: ../../../../reference/templates/template-meta.md
[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
