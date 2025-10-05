<!--
Derived from: https://github.com/snarktank/ai-dev-tasks/process-task-list.md
Original work licensed under Apache License 2.0
Modifications: Enhanced for ARC framework with quality gates integration,
feature branch management, and comprehensive task completion protocols
-->

# Workflow: Process Tasks

Guidelines for managing task lists in markdown files to track progress on completing a PRD.

## Task Implementation

- **One sub-task at a time:** Do **NOT** start the next sub-task until you ask the user for permission
  and they say "yes" or "y"
- **Test-first approach:** For new functionality and complex logic, write tests before implementation
- **Incremental quality checks:** Run linting and type checking on modified files after each
  sub-task
- **Immediate documentation:** Update the task list file immediately after completing each subtask
- **Completion protocol:**

  1. When you finish a **single sub-task**:
     - **First**: Immediately mark it as completed by changing `[ ]` to `[x]` in the task list file
     - **Second**: Update the "Relevant Files" section if new files were created or modified
     - **Third**: **MANDATORY STOP** - Pause and ask for user review/approval of the subtask completion
     - **Fourth**: Only proceed to next subtask with explicit user permission ("proceed to X.Y" or "y")
     - **NEVER** continue to multiple subtasks without explicit user approval for each one

  2. If **all** subtasks underneath a parent task are now `[x]`, follow this sequence:

  - **First**: Ensure new functionality has appropriate test coverage
  - **Second**: Run the full test suite per {{BACKEND_TEST_CMD}}, {{FRONTEND_TEST_CMD}}
- **Third**: Run all linting checks per {{BACKEND_LINT_CMD}}, {{FRONTEND_LINT_CMD}},
  {{TS_TYPECHECK_CMD}}, {{MARKDOWN_LINT_CMD}}
- **Fourth**: Check if PROJECT-STATUS needs updates (feature progress, completed functionality,
  updated priorities)

  1. Generate standardized readiness report (see DEVELOPMENT-RULES.md for format) and await user instructions
     on how to proceed. User may choose to commit changes (AI can execute only if explicitly approved to do so)
     or review first. When committing, follow atomic-commit workflow guidelines:

  - Uses conventional commit format (`feat:`, `fix:`, `refactor:`, etc.)
  - Summarizes what was accomplished in the parent task
  - Lists key changes and additions
    - **Accurately references the specific task number being completed** (e.g., "Complete task {TASK_ID}"
      where {TASK_ID} is the actual subtask like "4.2.3")
  - References the PRD context and current branch {{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}
  - **Formats the message as a single-line command using `-m` flags**, replacing placeholders with real values:

      ```
      git commit -m "feat({{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}): add validation logic" -m "- Validates input parameters" -m "- Adds unit tests for edge cases" -m "Complete task {TASK_ID}" -m "Related to {{FEATURE_NAME}} PRD"
      ```

  1. Once the user commits changes, mark the **parent task** as completed in task documentation.
  2. **Verify task documentation accuracy** - ensure task status matches what was actually completed.

### Incremental Quality Checks

After each sub-task, run relevant quality checks on modified files only:

**Use commands from DEVELOPMENT-RULES.md:**

- {{BACKEND_LINT_CMD}} on modified backend files
- {{FRONTEND_LINT_CMD}} on modified frontend files
- {{TS_TYPECHECK_CMD}} for TypeScript validation
- {{MARKDOWN_LINT_CMD}} for documentation

**Fix issues immediately** - don't accumulate technical debt across sub-tasks.

### Feature Branch Management

#### Starting Feature Work

- **Ensure correct branch**: Verify you're on the feature branch (e.g., `{{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}`)
- **Check branch status**: `git status` should show the feature branch as current
- **If not on feature branch**: `git checkout {{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}`

#### During Task Execution

- **All commits go to feature branch**: Normal atomic commit workflow applies within the branch
- **Stay on feature branch**: Don't switch branches during active task work
- **Branch context in handoffs**: Include current branch in any AI context handoffs

#### Feature Completion

When all parent tasks are complete and ready for integration:

1. **Final quality gates**: All tests pass, zero linting violations, zero type errors
2. **Generate completion report**: Use standardized format from DEVELOPMENT-RULES.md
3. **Await user approval**: User decides when to merge to {{DEFAULT_BRANCH}}
4. **Merge process** (user executes):

   ```bash
   git checkout {{DEFAULT_BRANCH}}
   git merge {{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}  # Preserve commit history
   git branch -d {{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}  # Clean up feature branch
   ```

5. **Update PROJECT-STATUS**: Move feature from "In Progress" to "Completed"

### PROJECT-STATUS Maintenance

- **After each sub-task**: Update task documentation only
- **After each parent task**: Check if PROJECT-STATUS needs updates:
  - Feature progress milestones reached
  - Newly completed functionality to highlight
  - Updated timelines or priorities
  - Dependencies that are now resolved
  - Any other work completed outside the current task list

- **Stop after each individual sub-task and wait for the user's go-ahead**
- **Never complete multiple subtasks in one implementation cycle** - each subtask represents a discrete
  deliverable that requires individual review
- **Each subtask should be documented and approved before moving forward**

## Task List Maintenance

1. **Update the task list as you work:**

   - Mark tasks and subtasks as completed (`[x]`) per the protocol above.
   - Add new tasks as they emerge.

2. **Maintain the "Relevant Files" section:**
   - List every file created or modified.
   - Give each file a one-line description of its purpose.

## AI Instructions

When working with task lists, the AI must:

1. Regularly update the task list file after finishing any significant work.
2. Follow the completion protocol:
   - Mark each finished **sub-task** `[x]`.
   - Mark the **parent task** `[x]` once **all** its subtasks are `[x]`.
   - **Verify parent task completion happens in documentation commits**.
3. Add newly discovered tasks.
4. Keep "Relevant Files" accurate and up to date.
5. Before starting work, check which **single sub-task** is next.
6. **Complete only ONE subtask at a time** - never bundle multiple subtasks together.
7. After implementing a **single sub-task**:
   - **Run incremental quality checks** on modified files (linting, type checking)
   - **Do not mark the subtask [x] until all checks pass (0 errors)**
   - **Fix any issues immediately** before marking complete
   - Update the task list file immediately (mark subtask as [x])
   - Update "Relevant Files" section if applicable
   - Pause and request user review/approval of the specific subtask completion
   - Wait for explicit permission before starting the next subtask
8. **Generate standardized readiness reports** using format from DEVELOPMENT-RULES.md
9. **Never initiate commits** without explicit user approval - await commit instructions
10. **Never assume subtasks can be grouped** - each represents an individual deliverable requiring separate approval.
