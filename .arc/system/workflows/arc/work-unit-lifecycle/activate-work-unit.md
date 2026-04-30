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

The task list's `**PRD:**` field carries a bare filename — its path is derived from the task
list's directory, so the backlog → active rotation needs no field edit. (Existing task lists
authored under the prior path-form convention may still carry `.arc/{active|backlog}/...` values;
update those to bare filenames if encountered, otherwise leave the human-reference as-is.)

**Re-anchor backlog-sibling links.** Any relative-path link defs in the PRD, task list, or
atomic file that pointed at sibling artifacts still in `backlog/{category}/` (sibling plans,
`notes-*` files, cross-WU references) need a `../../backlog/{category}/` prefix from the
active location. The pre-commit markdown-link check catches misses.

### Step 4: Ensure Status File

The active status file may already exist when this workflow runs — [`activate-planning-branch.md`][activate-planning-branch]
Step 5 creates it during the planning-branch ceremony. Step 4 is idempotent: detect the existing file and
transition it, or create from template when absent. Both paths converge on the same end state: `State: In Progress`,
the task list pointer populated, and the first task ready to execute.

**Precondition check.** If `.arc/active/{category}/status-{name}.md` already exists, take the **transition path**
below; otherwise, take the **creation path**.

#### Creation path · no existing status file

Create `.arc/active/{category}/status-{name}.md` from [`template-status.md`][template-status]. This is the per-WU
project pointer — it travels with the branch and carries state until the work unit is archived.

Replace the template's title (`# Status: [Work Name]`) with the actual work unit name. Strip the HTML comment block
at the top of `## Active Work` — that's template scaffolding, not an instance carry-over (mirrors `template-prd.md`
precedent). Then fill in the initial field set:

1. **State** — `In Progress`
2. **Branch** — implementation branch name (e.g., `feature/{name}` or `technical/{name}`)
3. **Spec** — `prd-{name}.md` (PRD filename); URL under `pm.mode: external`
4. **Task List** — `tasks-{name}.md` (bare filename; path derives from this status file's directory)
5. **Sibling Work Unit(s)** — comma-separated `plan-{name}.md` or `prd-{name}.md` references when this WU is part
   of a larger logical whole split for sizing or sequencing; otherwise `[none]`
6. **Last Completed** — `Work unit activated`
7. **Next Task** — first task in triple-anchor format (e.g., "Task 1.1 — Setup scaffolding (line ~XX)")
8. **Blockers** — `[none]`
9. **Next Action** — describe first task action (e.g., "Begin Phase 1")

#### Transition path · status file exists from planning ceremony

The status file already carries planning-state field values from [`activate-planning-branch.md`][activate-planning-branch]
Step 5. Update the fields that change at activation:

1. **State** — `Planning` → `In Progress`
2. **Branch** — planning branch → implementation branch (e.g., `feature/{name}` or `technical/{name}`)
3. **Spec** — conditional rewrite:
    - `plan-{name}.md` filename → `prd-{name}.md` (the now-canonical artifact)
    - URL, external tracker reference, non-`plan-` `.md` filename, or `[none]` → leave unchanged (accommodates
      `pm.mode: external` Specs untouched)
4. **Task List** — `[none]` → `tasks-{name}.md` (bare filename)
5. **Last Completed** — `[none]` → `Work unit activated`
6. **Next Task** — `[none]` → first task in triple-anchor format (e.g., "Task 1.1 — Setup scaffolding (line ~XX)")
7. **Next Action** — replace planning-session prompt with first task action (e.g., "Begin Phase 1")

**Sibling Work Unit(s)** and **Blockers** retain their existing values from the planning session.

#### Both paths

**Remove pre-activation PRD metadata:** Remove `**State:**`, `**Related Work:**`, and `**Updated:**` lines from the
PRD header (see [`template-prd.md`][template-prd]). The PRD retains only `**Type:**` going forward.

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
- [ ] Status file ensured in `active/{category}/` — `State: In Progress` with Branch, Spec, Task List,
      Next Task populated (created from template, or transitioned from `Planning`)
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

[work-org-branches]: ../../../../reference/strategies/arc/strategy-work-organization.md#task-lists-and-branches
[arc-ext-post-activate]: ../../../extensions/post-work-unit-activate.md
[arc-config]: ../../../arc-config.yml
[deactivate]: deactivate-work-unit.md
[session-init]: ../session-lifecycle/session-init.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
[template-status]: ../../../../reference/templates/template-status.md
[template-prd]: ../../../../reference/templates/template-prd.md
[incidental]: ../supplemental/manage-incidental-work.md
[activate-planning-branch]: planning/activate-planning-branch.md
