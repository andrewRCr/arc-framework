# Workflow: Activate Work Unit

## Purpose

Transition a planned work unit (PRD + task list) from backlog to active status, establishing the branch and
updating all tracking documents. This bridges the gap between task generation and task execution.

**When to use:** After generating a task list (`2_generate-tasks.md`) when ready to begin implementation.

## Prerequisites

- PRD exists in `.arc/backlog/{feature|technical}/prd-{name}.md`
- Task list exists in `.arc/backlog/{feature|technical}/tasks-{name}.md`
- Task list has `Status: Pending`
- Working tree is clean (all changes committed)
- Currently on `main` branch

## Steps

### Step 1: Commit Planning Artifacts (if uncommitted)

If PRD and task list were just created and not yet committed:

```bash
git add .arc/backlog/{category}/prd-{name}.md .arc/backlog/{category}/tasks-{name}.md
git commit -m "docs(arc): create PRD and task list for {Work Name}

Context: planning (atomic / no associated task list)"
git push origin main
```

### Step 2: Create Feature Branch

```bash
git checkout -b {feature|technical}/{branch-name}
```

Branch name should match the work unit name (e.g., `feature/content-polish-p2`).

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

### Step 5: Update PROJECT-STATUS.md

Edit `.arc/reference/constitution/PROJECT-STATUS.md`:

1. Update **Currently Active** section:

   ```markdown
   **Currently Active:**

   - {Work Name} (feature|technical) - Brief description
     - Task list: `.arc/active/{category}/tasks-{name}.md`
     - Branch: `{feature|technical}/{branch-name}`
   ```

2. Update **Next Priority** section (remove the now-active item, promote next item if applicable)

### Step 6: Update ROADMAP.md (if tracked)

Edit `.arc/backlog/ROADMAP.md`:

1. Update the work unit entry to indicate active status
2. Update any plan file references to point to active task list
3. Add "In Progress" indicator or similar

### Step 7: Update CURRENT-SESSION.md

Edit `.arc/active/CURRENT-SESSION.md`:

1. Update **Branch** to feature branch name
2. Update **Task List** path to active location
3. Update **Following Task List** to `Yes`
4. Update **Current Task** to first task (e.g., "Task 1.1 (line XX)")
5. Update **Next Action** to describe first task
6. Clear or update session context as appropriate

### Step 8: Commit Activation

```bash
git add -A
git commit -m "docs(arc): activate {work-name} work unit

- Move PRD and task list to active
- Update PROJECT-STATUS, ROADMAP, CURRENT-SESSION
- Status: In Progress

Context: {feature|technical}/{branch-name} / tasks-{name}.md"
```

### Step 9: Push Feature Branch (Optional)

Set upstream for the feature branch:

```bash
git push -u origin {feature|technical}/{branch-name}
```

This is optional but recommended - establishes remote tracking early.

---

## Checklist Summary

Before proceeding to task execution, verify:

- [ ] Feature branch created and checked out
- [ ] PRD and task list moved to `.arc/active/{category}/`
- [ ] Task list `Status` changed to `In Progress`
- [ ] Task list PRD path updated to active location
- [ ] PROJECT-STATUS.md updated (Currently Active, Next Priority)
- [ ] ROADMAP.md updated (if work unit tracked there)
- [ ] CURRENT-SESSION.md updated (branch, task list, current task)
- [ ] All changes committed on feature branch

---

## Next Step

With the work unit activated, proceed to task execution:

**→ [3_process-task-loop.md](../3_process-task-loop.md)** - Execute tasks one at a time with quality gates

---

**Version:** 2026-01-19
