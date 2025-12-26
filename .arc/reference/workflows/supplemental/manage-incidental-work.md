# Workflow: Manage Incidental Work

**Purpose**: Guidelines for creating and managing incidental task lists—
quality improvements, refactoring, or tech debt discovered during feature or technical work—
that should be addressed immediately.

**When to use**: During feature or technical work when discovering issues requiring multiple subtasks (>30 min effort)
that block or significantly impact current work.

**Related**: [3_process-task-loop.md](../3_process-task-loop.md), [archive-completed.md](archive-completed.md)

---

## Overview

Incidental work is **reactive** (discovered during implementation) vs **proactive** (planned work with PRDs).
This workflow covers what makes incidental work unique—execution follows standard task loop,
archival follows standard archive workflow.

---

## When to Create Incidental Task Lists

### The Key Distinction

**Task lists are for work with distinct phases**, not just complex work.

- **"Sequential steps toward one goal"** → Atomic task (even if 60-90 min, multiple files)
- **"Distinct phases with different objectives"** → Task list

Example: "Clean up auth tech debt" with 5 ordered steps touching 7 files is **one coherent concern** - stays atomic.

Example: "Investigate performance issue" requiring profiling → analysis → design → implementation is
**multiple phases** - needs task list.

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

### Why This Matters

Task lists add overhead: file creation, phase structure, branch lifecycle, archival process. This overhead pays off
when work genuinely has distinct phases that benefit from independent tracking. It's wasted ceremony for focused
refactors that happen to touch multiple files.

**Session duration is not a factor**: Well-structured atomic tasks with subtask checkboxes track progress across
sessions just as effectively as task lists. Don't escalate to task list just because work might span sessions.

---

## Creating Incidental Task Lists

### 1. Verify Need

Before creating:

- **Confirm distinct phases**: Does this work have research/design/implement stages, or just sequential steps?
- **Assess scope certainty**: Is scope bounded, or likely to expand during investigation?
- **Estimate effort**: Is this 2+ hours, or <2 hours of focused execution?
- **Check urgency**: Why fix now vs defer?

**If work is <2 hours with known scope and sequential steps** → Use atomic task instead (see criteria above).

If uncertain, ask for guidance on whether task list overhead is justified.

### 2. Create Task File

**Location**: `.arc/active/incidental/tasks-{brief-slug}.md`

**Naming**: `tasks-{brief-descriptive-slug}.md` (no `incidental-` prefix - directory name provides that context)

Examples:

- `tasks-filter-integration-testing.md`
- `tasks-api-type-safety.md`
- `tasks-security-updates.md`

**Template structure** (same as feature/technical work):

- Context section explaining discovery and why now
- Scope section (will do / won't do)
- Phased task breakdown with standardized format
- Implementation notes as work proceeds

**Formatting standards**: Before creating the task list, review:

**→ [strategy-task-list-formatting.md](../../strategies/arc/strategy-task-list-formatting.md)** ← **Required reading**

This strategy document defines:

- Exact format for all task list elements (phase headers, parent tasks, subtasks)
- Test-first task structure patterns (CRITICAL for incidental work)
- Complete annotated examples
- Common mistakes to avoid
- Decision guidelines

**Test-first protocol applies**: Incidental work fixing bugs or refactoring business logic MUST follow
test-first approach. Write failing tests before implementation. See [strategy-testing-methodology.md](../../strategies/project/strategy-testing-methodology.md)
and [DEVELOPMENT-RULES.md](../../constitution/DEVELOPMENT-RULES.md) Test-First Protocol section.

The [strategy-task-list-formatting.md](../../strategies/arc/strategy-task-list-formatting.md) document includes comprehensive
test-first examples and patterns.

**Key difference**: Incidental task lists get **completion notes appended at bottom** when finished
(feature/technical work uses separate completion metadata files).

### 3. Track Creation with Commit

**Guidance**: Lint and commit the new task list immediately for visibility and audit trail.

**Pre-commit check:**

```bash
# Run markdown linting with auto-fix on new task list
npx markdownlint-cli2 --fix --no-globs ".arc/active/incidental/tasks-{slug}.md"
```

Markdown linting enforces line length limits, consistent formatting, and catches structural issues before committing.

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

## Git Branch Creation for Incidental Work

Incidental work that meets task list criteria gets its own git branch using a stacked branch workflow.
See [Work Organization Strategy](../../strategies/arc/strategy-work-organization.md) for complete rationale.

### When to Create a Branch

**Create separate branch when incidental work:**

- ✅ Requires dedicated task list (meets criteria in "When to Create" section above)
- ✅ Is semantically distinct from current branch's work
- ✅ Benefits from independent merge/review capability

**Stay on current branch when:**

- ❌ Atomic task or inline fix (single coherent concern, <2 hours)
- ❌ Work directly continues current branch's theme
- ❌ No separate task list justified

### Branch Naming and Lifecycle

**Branch naming**: `incidental/<name>` (matches task list name without `tasks-` prefix)

Example:

- Task list: `.arc/active/incidental/tasks-pagination-buffer-tracking.md`
- Branch: `incidental/pagination-buffer-tracking`

**Branch lifecycle**:

1. Discover work needing task list (distinct phases, 2+ hours, or scope uncertainty)
2. Create branch off current: `git checkout -b incidental/<name>`
3. Create task list: `.arc/active/incidental/tasks-<name>.md`
4. Work on branch, commit with task references
5. Complete work (all tasks done, quality gates pass)
6. Run code review (local or two-pass)
7. Create PR against parent branch: `gh pr create --base parent-branch`
8. Merge PR (child → parent)
9. Delete merged branch: `git branch -d incidental/<name>`
10. Archive task list immediately: `mv` to `.arc/reference/archive/incidental/`
11. Return to parent branch and continue work

**Key rule**: Task list in `.arc/active/` ↔ Git branch exists

See [Work Organization Strategy](../../strategies/arc/strategy-work-organization.md) for complete stacked
branch workflow details, merge strategy (depth-first), and handling branch updates.

---

## Executing Incidental Work

**Follow standard workflows** - incidental work has no special execution procedures:

1. **Task execution**: Follow [3_process-task-loop.md](../3_process-task-loop.md)
   - One subtask at a time
   - Quality checks after each subtask
   - Mark `[x]` immediately on completion

2. **Commits**: Follow [atomic-commit.md](atomic-commit.md)
   - Include task reference: `Complete incidental task {X.Y}`
   - Include relationship: `Related to: .arc/active/incidental/tasks-{slug}.md`

3. **Quality gates**: Same zero-tolerance standards as feature/technical work

4. **Branch context**: If incidental work has its own branch, commits stay on that branch until merge

---

## Completing Incidental Work

### Branch Cleanup and Archiving

**If incidental work has its own branch:**

1. Complete all tasks (quality gates pass)
2. Run code review (local or two-pass as appropriate)
3. Create PR against parent branch
4. Merge PR (child → parent)
5. Delete merged branch: `git branch -d incidental/<name>`
6. Archive task list **immediately** after branch deletion
7. Return to parent branch and continue work

**If incidental work was on parent branch** (no separate branch):

1. Complete all tasks (quality gates pass)
2. Archive when all work complete (standard timing)

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
- **Archive timing**: Immediately when branch deleted (after merge) if work had separate branch
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

---

**Version**: 3.1 (2025-12-04) - Refined task list vs atomic task criteria

**Changelog**:

- v3.1: Revised "When to Create" criteria - focus on distinct phases vs sequential steps,
  raised time threshold from 30min to 2hrs, emphasized scope certainty as key factor. Removed overly
  trigger-happy criteria (">1 subtask", ">30min") that caused unnecessary task list overhead.
- v3.0: Added git branch creation guidance, stacked branch workflow, updated completion/archival
  to reflect branch lifecycle
- v2.0: Streamlined to focus on unique aspects of incidental work
- v1.0: Initial version
