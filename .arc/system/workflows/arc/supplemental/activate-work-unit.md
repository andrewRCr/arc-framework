# Workflow: Activate Work Unit

**Audience:** Collaborative — developer and agent transition planned work to active status.

## Purpose

Transition a planned work unit (PRD + task list) from backlog to active status, establishing the branch and
updating all tracking documents. This bridges the gap between task generation and task execution.

**When to use:** After generating a task list (`2_generate-tasks.md`) when ready to begin implementation.

## Prerequisites

- PRD exists in `.arc/backlog/{feature|technical}/prd-{name}.md`
- Task list exists in `.arc/backlog/{feature|technical}/tasks-{name}.md`
- Task list has `Status: Pending`
- Planning branch PR merged (artifacts now on base branch)
- Working tree is clean (all changes committed)
- Currently on base branch (typically `main` — see `.arc/system/arc-config.yml`)

> **Mode-specific:** In unprotected mode, planning branches are optional — artifacts may
> have been committed directly to the base branch. See
> [Branch Protection Modes][work-org-protection].

## Steps

### Step 1: Verify Planning Artifacts on Base Branch

Planning artifacts should already be on the base branch — merged via planning branch PR
(partially/fully protected mode) or committed directly (unprotected mode).

**If artifacts are not yet on the base branch** (unprotected mode, just-created artifacts):

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

### Step 3: Move Documents to Active

Use `git mv` to preserve history:

```bash
git mv .arc/backlog/{category}/prd-{name}.md .arc/active/{category}/
git mv .arc/backlog/{category}/tasks-{name}.md .arc/active/{category}/
```

### Step 4: Update Task List Status

Edit `.arc/active/{category}/tasks-{name}.md`:

1. Change `Status: Pending` → `Status: In Progress`
2. Update PRD path reference from `backlog` to `active`:

   ```
   **PRD:** `.arc/active/{category}/prd-{name}.md`
   ```

### Step 5: Update WORK-STATUS.md

Edit `.arc/active/WORK-STATUS.md`. This transitions the file from "no active work" defaults
(set during init or after archival) to active work unit values:

1. Update **Branch** to feature branch name
2. Update **Task List** path to active location
3. Update **Following Task List** to `Yes`
4. Update **Current Task** to first task in triple-anchor format (e.g., "Task 1.1 — Setup scaffolding (line ~XX)")
5. Update **Last Completed** to previous work or `—` if first work unit
6. Update **Next Action** to describe first task
7. Clear **Blockers** (set to `[none]`)

> **Team mode:** WORK-STATUS.md is shared in `active/` — one developer performs the activation,
> and the update applies to the whole branch. Other developers joining the work unit establish
> their session context via `team/{name}/SESSION-NOTES.md` during their first
> [session initialization][session-init]. See [Team Coordination Strategy][team-coordination]
> § Workflow Adaptations.

### Step 6: Post-Activation Extensions · `#post-work-unit-activate`

If [post-work-unit-activate extensions][arc-ext-post-activate] are configured, execute them now. This is the
primary interface for PM layers to update project management artifacts (PROJECT-STATUS, ROADMAP) at activation time.

See: [`arc-extensions.md` § post-work-unit-activate][arc-ext-post-activate]

### Step 7: Commit Activation

```bash
git add .arc/active/{category}/prd-{name}.md \
       .arc/active/{category}/tasks-{name}.md \
       .arc/active/WORK-STATUS.md
git commit -m "docs(arc): activate {work-name} work unit

- Move PRD and task list to active
- Update WORK-STATUS
- Status: In Progress

Context: {feature|technical}/{branch-name} / tasks-{name}.md"
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
- [ ] PRD and task list moved to `.arc/active/{category}/`
- [ ] Task list `Status` changed to `In Progress`
- [ ] Task list PRD path updated to active location
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
[session-init]: session-init.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
