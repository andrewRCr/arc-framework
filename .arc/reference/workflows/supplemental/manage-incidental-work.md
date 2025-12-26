# Workflow: Manage Incidental Work

**Purpose**: Guidelines for creating and managing incidental task lists—
quality improvements, refactoring, or tech debt discovered during feature or technical work—
that should be addressed immediately.

**When to use**: During feature or technical work when discovering issues requiring multiple subtasks (>30 min effort)
that block or significantly impact current work.

**Related**: [3-process-task-loop.md](../3-process-task-loop.md), [archive-completed.md](archive-completed.md)

---

## Overview

Incidental work is **reactive** (discovered during implementation) vs **proactive** (planned work with PRDs).
This workflow covers what makes incidental work unique—execution follows standard task loop,
archival follows standard archive workflow.

---

## When to Create Incidental Task Lists

### Create When

- ✅ Multiple subtasks needed (>1 subtask)
- ✅ Non-trivial effort (>30 minutes estimated)
- ✅ Cross-cutting concern (affects multiple domains/files)
- ✅ Blocks or significantly impacts current feature/technical work
- ✅ Worth documenting for future reference

### Fix Inline When

- ❌ Simple fixes (<30 min, 1 subtask)
- ❌ Typos, formatting, trivial refactors
- ❌ Work already in main task list (add subtasks there instead)
- ❌ Exploratory work (use notes files instead)

---

## Creating Incidental Task Lists

### 1. Verify Need

Before creating:

- **Confirm urgency**: Why fix now vs defer?
- **Estimate effort**: Is this >30 minutes with multiple subtasks?
- **Assess impact**: Does this block current work?
- **Check scope**: Is this truly incidental or should it be planned feature/technical work?

If uncertain, ask for guidance on whether to address now or defer.

### 2. Create Task File

**Location**: `.arc/active/incidental/tasks-{brief-slug}.md`

**Naming**: `tasks-{brief-descriptive-slug}.md` (no `incidental-` prefix - directory name provides that context)

Examples:

- `tasks-filter-integration-testing.md`
- `tasks-backend-type-safety.md`
- `tasks-security-updates.md`

**Template**: Use same template as feature/technical work (see [2-generate-tasks.md](../2-generate-tasks.md)):

- Context section explaining discovery and why now
- Scope section (will do / won't do)
- Phased task breakdown
- Implementation notes as work proceeds

**Key difference**: Incidental task lists get **completion notes appended at bottom** when finished
(feature/technical work uses separate completion metadata files).

### 3. Track Creation with Commit

**Guidance**: Commit the new task list immediately for visibility and audit trail.

**Purpose**:

- Git log shows when/why work was paused
- Session handoffs have full context
- Team visibility into priority shifts

**Commit message format**:

```
docs({current-branch}): create {brief-slug} incidental task list

Triggered by {discovery context during current feature/technical work}.
Pausing {current work task} to address {critical issue}.

Related to: .arc/active/{feature|technical}/tasks-{main-work-name}.md
```

**Example**:

```
docs(service-layer-modernization): create filter integration testing incidental task list

Triggered by Task 3.5.2.3 investigation revealing critical test coverage gaps.
Pausing service layer work to establish comprehensive filter testing.

Related to: .arc/active/technical/tasks-service-layer-modernization.md
```

---

## Executing Incidental Work

**Follow standard workflows** - incidental work has no special execution procedures:

1. **Task execution**: Follow [3-process-task-loop.md](../3-process-task-loop.md)
   - One subtask at a time
   - Quality checks after each subtask
   - Mark `[x]` immediately on completion

2. **Commits**: Follow [atomic-commit.md](atomic-commit.md)
   - Include task reference: `Complete incidental task {X.Y}`
   - Include relationship: `Related to: .arc/active/incidental/tasks-{slug}.md`

3. **Quality gates**: Same zero-tolerance standards as feature/technical work

**Only unique aspect**: Commit messages should reference both the incidental task list AND the paused
feature/technical work for traceability.

---

## Completing Incidental Work

### Add Completion Notes

**Before archiving**, append completion section to bottom of task list:

```markdown
## Completion Notes

**Completion Date**: {YYYY-MM-DD}

**Summary**:
- {1-2 sentences summarizing accomplishments}
- {Key outcomes or improvements}

**Files Changed**: {Count and key files}

**Follow-Up Work** (if any):
- `.arc/active/incidental/tasks-{follow-up-slug}.md` - {description}

**Next Steps**:
1. Resume {paused work} at Task {X.Y}
```

### Archive and Resume

Follow [archive-completed.md](archive-completed.md) for archival procedure:

- Archive to `.arc/reference/archive/incidental/`
- Update PROJECT-STATUS.md if applicable
- Update CURRENT-SESSION.md to resume paused work
- Commit with summary of completed incidental work

---

## Common Patterns

### Nested Incidental Work

If incidental work spawns MORE incidental work:

1. **Assess criticality**: Is new issue blocking current incidental work?
2. **Get approval**: Don't auto-create nested incidental work
3. **Document relationship**: Link nested task list to parent
4. **Track in CURRENT-SESSION**: Show full dependency chain

Example hierarchy:

- Main work: API Layer Modernization (feature/technical)
    - Incidental: Filter Integration Testing (discovered during main work)
        - Nested: Type Safety Tooling Fix (discovered during incidental work - rare but valid)

### Scope Management

- **Start small**: Defer non-critical improvements to future work
- **Document deferrals**: Create follow-up task lists for discovered work outside current scope
- **Time-box**: If effort exceeds 2x estimate, stop and reassess

---

**Version**: 2.0 (2025-10-24) - Streamlined to focus on unique aspects of incidental work
