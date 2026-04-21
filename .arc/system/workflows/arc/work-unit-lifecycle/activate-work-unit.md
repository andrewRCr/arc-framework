---
purpose: Transition a work unit to active — establish the implementation branch and update all tracking documents.
audience: collaborative (human and agent)
arc:
  extensions:
    - post-work-unit-activate
---

# Workflow: Activate Work Unit

**When to use:** After generating a task list (`2_generate-tasks.md`) when ready to begin implementation.

> **Incidental activation that interrupts active work:** Pausing a parent WU to activate an incidental requires
> coordinated updates across both status files in the same commit — see [`manage-incidental-work.md`][incidental]
> § Coordinated Pause/Resume for the paired protocol. Normal (non-incidental) activation proceeds through the
> steps below unchanged.

## Mode Detection

Check [`arc-config.yml`][arc-config] → `pm.mode` to determine which activation path applies:

- **arc-in-git**: Documents live in `backlog/` and must be moved to `active/`. Steps 1 and 3 apply.
- **none / external**: Documents are already in `active/` (saved there by `2_generate-tasks.md`).
  Skip Steps 1 and 3.

The remaining steps (branch creation, status file creation, extensions, commit) apply
in all modes.

## Prerequisites

**All modes:**

- PRD and task list exist for this work unit
- Working tree is clean (all changes committed)
- Currently on base branch (typically `main` — see [`arc-config.yml`][arc-config])
- Planning artifacts are on the base branch — arrived via one of:
    - Planning branch PR (partially or fully protected)
    - Batch branch PR that included both archival and planning (fully protected)
    - Direct commit (partial protection, documented exception)

**arc-in-git mode (additional):**

- PRD exists in `.arc/backlog/{category}/prd-{name}.md`
- Task list exists in `.arc/backlog/{category}/tasks-{name}.md`

> **How artifacts reach the base branch** depends on `branch.protection`:
>
> - **Full protection:** Planning branch PR merged
>   ([integrate-planning-branch][integrate-planning-branch])
> - **Partial protection:** Planning branch PR merged, or committed directly to base branch
>   (documented exception for solo developers — see
>   [Branch Protection Modes][work-org-protection])

## Steps

### Step 1: Verify Planning Artifacts on Base Branch · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external` — documents are already in `active/`.

Planning artifacts should already be on the base branch — merged via planning branch PR
(partially/fully protected mode) or committed directly (partial protection, documented exception).

**If artifacts are not yet on the base branch** (partial protection, just-created artifacts):

```bash
git add .arc/backlog/{category}/prd-{name}.md .arc/backlog/{category}/tasks-{name}.md
git commit -m "docs(arc): create PRD and task list for {Work Name}

Context: planning (atomic / no associated task list)"
```

### Step 2: Create Implementation Branch

```bash
git checkout -b {feature|technical}/{branch-name}
```

This creates the primary implementation branch. Branch name typically matches the work unit
name (e.g., `feature/user-authentication`). Additional branches may be created during work
for stacked PRs or team sub-branches — see
[Task Lists and Branches][work-org-branches].

### Step 3: Move Documents to Active · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external` — documents are already in `active/`.

Ensure the target directory exists (directories are created on demand, not scaffolded at init),
then use `git mv` to preserve history:

```bash
mkdir -p .arc/active/{category}/
git mv .arc/backlog/{category}/prd-{name}.md .arc/active/{category}/
git mv .arc/backlog/{category}/tasks-{name}.md .arc/active/{category}/
git mv .arc/backlog/{category}/atomic-{name}.md .arc/active/{category}/
```

After the move, update the task list's PRD path reference from `backlog` to `active`:

```text
**PRD:** `.arc/active/{category}/prd-{name}.md`
```

### Step 4: Create Status File

Create `.arc/active/{category}/status-{name}.md` from [`template-status.md`][template-status]. This is the per-WU
project pointer — it travels with the branch and carries state until the work unit is archived.

Replace the template's title (`# Status: [Work Name]`) with the actual work unit name, then fill in the initial
field set:

1. **State** — `In Progress`
2. **Branch** — feature branch name (e.g., `feature/{name}` or `technical/{name}`)
3. **Task List** — active path (e.g., `.arc/active/{category}/tasks-{name}.md`)
4. **Next Task** — first task in triple-anchor format (e.g., "Task 1.1 — Setup scaffolding (line ~XX)")
5. **Last Completed** — `Work unit activated`
6. **Blockers** — `[none]` (standard empty-state marker)
7. **Next Action** — describe first task action (e.g., "Begin Phase 1")

Leave the optional pointer fields (`Interrupts:`, `Paused At:`, `Paused To:`) commented out — they apply only when
this WU is interrupted by an incidental (see [`manage-incidental-work.md`][incidental] § Coordinated Pause/Resume).

**Remove pre-activation PRD metadata:** Remove `**State:**`, `**Related Work:**`, and `**Updated:**` lines from the
PRD header (see [`template-prd.md`][template-prd]). These fields serve pre-activation staleness/dependency tracking
only — once the status file is created, its `**State:**` field is the sole source of truth for WU lifecycle, and
git history tracks post-activation edits. The PRD retains only `**Type:**` going forward.

> **Team mode:** The per-WU status file is tracked in `active/{category}/` — one developer performs the activation,
> and the file applies to the whole branch. Other developers joining the work unit establish their session context
> via `user/{identity}/SESSION-NOTES.md` during their first [session initialization][session-init].
>
> **Team branch setup:** If the team will use personal sub-branches (rather than committing directly to the shared
> branch), create the integration branch in Step 2, then have each developer create their sub-branch from it.
> Update the task list's `**Branch(es):**` header to list all branches. Assign initial task ownership via `(@name)`
> markers in the task list. See [Team Coordination Strategy][team-coordination] § Team Branching Patterns for
> pattern options.

### Step 5: Update PM Artifacts · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external`.

Update project management documents to reflect the newly active work unit:

**PROJECT-STATUS.md** (`.arc/reference/PROJECT-STATUS.md`):

- Update **Currently Active** to the new work unit (name, category, description, task list path, branch)
- Update **Next Priority** to the next queued item from ROADMAP.md (or remove if nothing is queued)

**ROADMAP.md** (`.arc/backlog/ROADMAP.md`):

- Update the work unit's status from its previous state (e.g., "Planning" → "In Progress")

### Step 6: Post-Activation Extensions · `#post-work-unit-activate`

If `post-work-unit-activate` appears in the active-extensions list (established at session init), load
and execute its [`.actions`][arc-ext-post-activate]. Otherwise, skip.

### Step 7: Commit Activation

Stage the activation files and commit. The exact set depends on pm.mode:

```bash
# arc-in-git: moved files + new status file + task list update
git add .arc/active/{category}/prd-{name}.md \
       .arc/active/{category}/tasks-{name}.md \
       .arc/active/{category}/atomic-{name}.md \
       .arc/active/{category}/status-{name}.md

# none / external: new status file + task list/PRD edits (other files already in active/)
git add .arc/active/{category}/prd-{name}.md \
       .arc/active/{category}/tasks-{name}.md \
       .arc/active/{category}/atomic-{name}.md \
       .arc/active/{category}/status-{name}.md

git commit -m "docs(arc): activate {work-name} work unit

- Create status file with State: In Progress
- Move planning artifacts to active/ (arc-in-git)

Context: tasks-{name}.md (activation)"
```

**Note:** Stage only the files actually modified. With `arc-in-git`, also stage PROJECT-STATUS.md and
ROADMAP.md if updated in Step 5. If [post-work-unit-activate extensions][arc-ext-post-activate]
produced additional changes, stage those as well.

### Step 8: Push Feature Branch (Optional)

Set upstream for the feature branch:

```bash
git push -u origin {feature|technical}/{branch-name}
```

This is optional but recommended - establishes remote tracking early.

---

## Checklist Summary

Before proceeding to task execution, verify:

- [ ] Implementation branch created and checked out
- [ ] PRD, task list, and atomic companion file in `.arc/active/{category}/` (moved from backlog if arc-in-git)
- [ ] Status file created in `active/{category}/` (State, Branch, Task List, Next Task)
- [ ] PRD `**State:**` / `**Related Work:**` / `**Updated:**` pre-activation metadata removed (if present)
- [ ] PROJECT-STATUS.md and ROADMAP.md updated (arc-in-git only)
- [ ] All changes committed on feature branch

---

## Next Step

With the work unit activated, proceed to task execution:

**→ [3_process-task-loop.md](../3_process-task-loop.md)** - Execute tasks one at a time with quality gates

## Related Workflows

- [`deactivate-work-unit.md`][deactivate] — reverse an activation when the WU is cancelled before any task
  work (Case A); routing for cases with work or merged state

---

[work-org-protection]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-org-branches]: ../../../../reference/strategies/arc/strategy-work-organization.md#task-lists-and-branches
[arc-ext-post-activate]: ../../arc-extensions.md#post-work-unit-activate
[arc-config]: ../../../arc-config.yml
[deactivate]: deactivate-work-unit.md
[integrate-planning-branch]: planning/integrate-planning-branch.md
[session-init]: ../session-lifecycle/session-init.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
[template-status]: ../../../../reference/templates/template-status.md
[template-prd]: ../../../../reference/templates/template-prd.md
[incidental]: ../supplemental/manage-incidental-work.md
