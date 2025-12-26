# Workflow: Task Processing Loop

## Purpose

This workflow defines the detailed process for executing tasks defined in ARC task lists (e.g., `.arc/active/*/tasks-*.md`).
It ensures consistent execution, quality control, and documentation of work.

## Task Implementation

- **One sub-task at a time:** Do **NOT** start the next sub‑task without user approval
- **Completion protocol:**

  1. When you finish a **single sub‑task**:
     - **First**: Run incremental quality checks on modified files (linting, type checking)
       - Task list specifies critical checkpoints, but use judgment: if changes warrant validation, run appropriate checks
       - When task list explicitly calls for quality gates, they are mandatory
     - **Second**: Mark subtask as `[x]` in task list file (task list reflects completed work when reporting)
       - Update task description to reflect actual work done (not just original plan)
       - Add "Completed" section with key findings/changes if work deviated from plan
       - **Streamline verbose planning details**: Task descriptions serve different purposes before vs. after completion.
         During planning, verbose details help guide execution. After completion, they become historical records.
         When marking a task complete, retain information useful for understanding what was done and why,
         but remove excessive planning scaffolding (detailed step-by-step instructions, pre-implementation
         considerations, etc.) that no longer serves a purpose. Keep: actual changes made, key decisions,
         architectural impact, anything needed to understand the implementation later.
     - **Third**: Verify completion before reporting (use pre-report checklist below)
     - **Fourth**: **REPORT** completed work to user with summary of changes
     - **Fifth**: ⛔ **MANDATORY STOP** - Wait for user approval before proceeding
     - **Sixth**: After approval, proceed to next subtask
     - **NEVER** continue to multiple subtasks without explicit user approval for each one

     **Pre-Report Checklist** (verify before generating completion report):

     ```
     - [ ] Quality checks passed (linting, type checking, tests as appropriate)
     - [ ] Task list markdown file edited and saved
     - [ ] Subtask marked [x] in task list
     - [ ] Task description updated to reflect actual work done
     - [ ] Ready to generate user-facing completion report
     ```

     If any item is unchecked, complete it before proceeding to report generation.

     **Note on implied permission:** User approval ("great!", "looks good", "proceed") implies permission to
     continue to the next subtask UNLESS explicitly stated otherwise (e.g., "that's done, but before moving on...").
     In such cases, address the concern before proceeding to the next task-list-documented subtask.

  2. If **all** subtasks underneath a parent task are now `[x]`, follow this sequence:

     - **First**: Mark the **parent task** as `[x]` in the task list file (ensures docs reflect completion)
     - **Second**: Ensure new code has appropriate test coverage (models, APIs, complex logic)
     - **Third**: Run the full quality gates (all tests, linting, type checks)
     - **Fourth**: Check if [PROJECT-STATUS](.arc/reference/constitution/PROJECT-STATUS.md) needs updates
       (feature progress, completed functionality, updated priorities)
     - **Fifth**: Verify completion before reporting (use pre-report checklist below)

  3. Report completion to user

     **Pre-Report Checklist for Parent Task Completion** (verify before reporting):

     ```
     - [ ] All subtasks under parent task marked [x] in task list
     - [ ] Parent task marked [x] in task list
     - [ ] Task list file edited and saved
     - [ ] Full test suite passed (backend + frontend)
     - [ ] All linting checks passed (backend + frontend + markdown)
     - [ ] PROJECT-STATUS checked and updated if needed
     - [ ] Ready to report completion to user
     ```

     If any item is unchecked, complete it before proceeding to report generation.

  4. Await user instructions on how to proceed.
     User may choose to commit changes (AI can execute only if explicitly approved) or request modifications.
     When committing, follow [Atomic Commit Workflow](supplemental/atomic-commit.md) guidelines.

## Incidental Work Management

### Quick Decision Guide

While working on feature tasks, you may discover quality improvements, refactoring, or tech debt that should be fixed
immediately. **Quick decision tree**:

**Create incidental task list when:**

- ✅ Multiple subtasks needed (>1 subtask)
- ✅ Non-trivial effort (>30 minutes estimated)
- ✅ Cross-cutting concern (affects multiple domains/files)
- ✅ Quality improvement discovered during feature work
- ✅ Worth documenting for handoffs

**Fix inline (no task list) when:**

- ❌ Simple fixes (<30 min, 1 subtask)
- ❌ Typos, formatting, trivial refactors
- ❌ Work already in main task list - add subtasks there
- ❌ Exploratory work - use notes files instead

### Complete Workflow

**For full incidental work lifecycle** (creation, execution, archival), see:
**→ [manage-incidental-work.md](manage-incidental-work.md)** ← Complete workflow documentation

## Task List Maintenance

### TodoWrite Tool vs Task List Files

**TodoWrite Tool** (session-only tracking):

- Used for organizing work during active implementation
- Ephemeral, not saved to git
- Helps AI break down current work into steps
- **NOT a substitute for task list markdown updates**

**Task List Markdown Files** (permanent record):

- Official project documentation (`.arc/active/*/tasks-*.md`)
- Committed to git with code changes
- Source of truth for completion status
- **MUST be updated when completing tasks** (before reporting to user)

Both tools serve different purposes - use TodoWrite for work-in-progress organization.
Always update task list markdown for permanent completion tracking.

#### TodoWrite Best Practice: Always Include Documentation Step

**IMPORTANT:** When creating TodoWrite items for a subtask, ALWAYS include a dedicated item for updating the task list markdown:

```json
[
  {"content": "Analyze the code/requirements", "status": "pending", ...},
  {"content": "Make technical changes", "status": "pending", ...},
  {"content": "Run quality checks", "status": "pending", ...},
  {"content": "Update task list markdown with [x] and details", "status": "pending", ...},
  {"content": "Report completion to user", "status": "pending", ...}
]
```

**Rationale:** This creates a forcing function to remember the task list update before generating
the completion report. The TodoWrite item serves as a checklist reminder.

**When to mark this item complete:**

- After editing the task list markdown file
- After marking the subtask `[x]`
- After adding any "Completed" details about actual work done
- BEFORE generating the user-facing completion report

### Updating Task Lists

1. **Update the task list as you work:**

   - Mark tasks and subtasks as completed (`[x]`) per the protocol above.
   - Add new tasks as they emerge.

2. **Track file changes via git:**
   - Git status and diffs provide the most accurate record of changes.
   - No need to manually maintain file lists - tools like `git status` and `git diff` are always current.
