# Workflow: Activate Work Unit

**Audience:** Collaborative — developer and agent transition planned work to active status.

## Purpose

Transition a work unit (PRD + task list) to active status, establishing the implementation branch and
updating all tracking documents. This bridges the gap between task generation and task execution.

**When to use:** After generating a task list (`2_generate-tasks.md`) when ready to begin implementation.

## Mode Detection

Check [`arc-config.yml`][arc-config] → `pm.mode` to determine which activation path applies:

- **arc-in-git**: Documents live in `backlog/` and must be moved to `active/`. Steps 1 and 3 apply.
- **none / external**: Documents are already in `active/` (saved there by `2_generate-tasks.md`).
  Skip Steps 1 and 3.

The remaining steps (branch creation, status update, WORK-STATUS, extensions, commit) apply in all modes.

## Prerequisites

**All modes:**

- PRD and task list exist for this work unit
- Task list has `Status: Not Started`
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

### Step 4: Update Task List Status

Edit `.arc/active/{category}/tasks-{name}.md`:

1. Change `Status: Not Started` → `Status: In Progress`
2. **(arc-in-git only)** Update PRD path reference from `backlog` to `active`:

   ```
   **PRD:** `.arc/active/{category}/prd-{name}.md`
   ```

### Step 5: Update WORK-STATUS.md

Edit `.arc/active/WORK-STATUS.md`. This transitions the file from "no active work" defaults
(set during init or after archival) to active work unit values:

1. Update **Branch** to feature branch name
2. Update **Task List** path to active location
3. Update **Following Task List** to `Yes`
4. Update **Next Task** to first task in triple-anchor format (e.g., "Task 1.1 — Setup scaffolding (line ~XX)")
5. Update **Last Completed** to previous work or `—` if first work unit
6. Update **Next Action** to describe first task
7. Clear **Blockers** (set to literal text `[none]` — the standard empty-state marker in WORK-STATUS)

> **Team mode:** WORK-STATUS.md is shared in `active/` — one developer performs the activation,
> and the update applies to the whole branch. Other developers joining the work unit establish
> their session context via `user/{identity}/SESSION-NOTES.md` during their first
> [session initialization][session-init]. See [Team Coordination Strategy][team-coordination]
> § Workflow Adaptations.

### Step 6: Post-Activation Extensions · `#post-work-unit-activate`

If [post-work-unit-activate extensions][arc-ext-post-activate] are configured, execute them now. This is the
primary interface for PM layers to update project management artifacts (PROJECT-STATUS, ROADMAP) at activation time.

> **`pm.mode` awareness:** Extension behavior depends on the project's PM mode
> (`arc-config.yml` → `pm.mode`). With `arc-in-git`, extensions typically update
> PROJECT-STATUS.md and ROADMAP.md. With `external`, extensions may update an external
> tracker. With `none`, no PM extensions are expected — the workflow proceeds naturally.

See: [`arc-extensions.md` § post-work-unit-activate][arc-ext-post-activate]

### Step 7: Commit Activation

Stage the activation files and commit. The exact set depends on pm.mode:

```bash
# arc-in-git: moved files + status updates
git add .arc/active/{category}/prd-{name}.md \
       .arc/active/{category}/tasks-{name}.md \
       .arc/active/{category}/atomic-{name}.md \
       .arc/active/WORK-STATUS.md

# none / external: status updates only (files already in active/)
git add .arc/active/{category}/tasks-{name}.md \
       .arc/active/{category}/atomic-{name}.md \
       .arc/active/WORK-STATUS.md

git commit -m "docs(arc): activate {work-name} work unit

- Update WORK-STATUS and task list status
- Status: In Progress

Context: tasks-{name}.md (activation)"
```

**Note:** Stage only the files actually modified. If [post-work-unit-activate extensions][arc-ext-post-activate]
produced additional changes (e.g., PM layer artifacts), stage those as well.

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
- [ ] Task list `Status` changed to `In Progress`
- [ ] WORK-STATUS.md updated (branch, task list, current task)
- [ ] All changes committed on feature branch

---

## Next Step

With the work unit activated, proceed to task execution:

**→ [3_process-task-loop.md](../3_process-task-loop.md)** - Execute tasks one at a time with quality gates

---

[work-org-protection]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-org-branches]: ../../../../reference/strategies/arc/strategy-work-organization.md#5-task-lists-and-branches
[arc-ext-post-activate]: ../../arc-extensions.md#post-work-unit-activate
[arc-config]: ../../../arc-config.yml
[integrate-planning-branch]: planning/integrate-planning-branch.md
[session-init]: ../session-lifecycle/session-init.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
