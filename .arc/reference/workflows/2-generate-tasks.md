<!--
Derived from: https://github.com/snarktank/ai-dev-tasks/generate-tasks.md
Original work licensed under Apache License 2.0
Modifications: Enhanced for ARC framework with PROJECT-STATUS integration,
feature branch workflow, and atomic commit protocols
-->

# Workflow: Generate Tasks

## Goal

To guide an AI assistant in creating a detailed, step-by-step task list in Markdown format based on an
existing PRD (feature-level Product Requirements Document). The task list should guide a developer
through implementation.

## Output

- **Format:** Markdown (`.md`)
- **Location:** `/_docs/tasks/`
- **Filename:** `tasks-{{FEATURE_NAME}}.md` (e.g., `tasks-user-profile-editing.md`)

## Process

1. **Receive PRD Reference:** The user points the AI to a specific PRD file
2. **Review Context:** Read the META-PRD (`/_docs/META-PRD.md`) and PROJECT-STATUS
   (`/_docs/PROJECT-STATUS.md`) to understand the overall product vision and current state
3. **Analyze PRD:** The AI reads and analyzes the functional requirements, user stories, and other
   sections of the specified PRD.
4. **Assess Current State:** Review the existing codebase to understand existing infrastructure,
   architectural patterns and conventions. Also, identify any existing components or features that already
   exist and could be relevant to the PRD requirements. Then, identify existing related files,
   components, and utilities that can be leveraged or need modification.
5. **Phase 1: Generate Parent Tasks:** Based on the PRD analysis and current state assessment, create
   the file and generate the main, high-level tasks required to implement the feature. Use your judgement on
   how many high-level tasks to use (likely 5-8). Present these tasks to the user in the
   specified format (without sub-tasks yet). Inform the user: "I have generated the high-level tasks based
   on the PRD. Ready to generate the sub-tasks? Respond with 'Go' to proceed."
6. **Wait for Confirmation:** Pause and wait for the user to respond with "Go".
7. **Phase 2: Generate Sub-Tasks:** Once the user confirms, break down each parent task into smaller,
   actionable sub-tasks necessary to complete the parent task. Ensure sub-tasks logically follow from the
   parent task, cover the implementation details implied by the PRD, and consider existing codebase
   patterns where relevant without being constrained by them.
8. **Identify Relevant Files:** Based on the tasks and PRD, identify potential files that will need to
   be created or modified. List these under the `Relevant Files` section, including corresponding test files
   if applicable.
9. **Generate Final Output:** Combine the parent tasks, sub-tasks, relevant files, and notes into the
   final Markdown structure.
10. **Save Task List:** Save the generated document in the `/_docs/tasks/` directory with the filename
    `tasks-{{FEATURE_NAME}}.md`, where `{{FEATURE_NAME}}` matches the base name of the input PRD file
    (e.g., if the input was `prd-user-profile-editing.md`, the output is
    `tasks-user-profile-editing.md`).
11. **Create Feature Branch:** Create a new feature branch with the naming convention
    `{{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}` (e.g., `feature/user-profile-editing`). Use the command:
    `git checkout -b {{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}`
12. **Update PROJECT-STATUS:** Add the new feature to the "Upcoming Priorities" section with status
    "(In Planning - Branch: {{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}})" and brief description of key
    deliverables.
13. **Stage Initial Documentation:** Stage the new PRD, the new task list, and the updated
    PROJECT-STATUS.md file using `git add`.
14. **Propose Initial Commit:** Present the staged files to the user and propose a commit message for
    the initial documentation. Await explicit user approval before executing the commit, in accordance
    with DEVELOPMENT-RULES.md.

    **Safety Note:** Before committing, you can:
    - Preview staged changes: `git diff --staged`
    - Unstage files if needed: `git restore --staged <files>` (or `git reset HEAD <files>`)
    - Review what will be committed: `git status`

## Interaction Model

The process explicitly requires a pause after generating parent tasks to get user confirmation ("Go")
before proceeding to generate the detailed sub-tasks. This ensures the high-level plan aligns with user
expectations before diving into details.

## Target Audience

Assume the primary reader of the task list is a **junior developer** who will implement the feature
with awareness of the existing codebase context and the broader product vision from the META-PRD.

## Output Format

The generated task list _must_ follow this structure:

```markdown
## Relevant Files

- `path/to/potential/file1.{{FILE_EXT}}` - Brief description of why this file is relevant (e.g., Contains the main component for this feature).
- `path/to/file1.test.{{FILE_EXT}}` - Unit tests for `file1.{{FILE_EXT}}`.
- `path/to/another/file.{{FILE_EXT}}` - Brief description (e.g., API route handler for data submission).
- `path/to/another/file.test.{{FILE_EXT}}` - Unit tests for `another/file.{{FILE_EXT}}`.
- `lib/utils/helpers.{{FILE_EXT}}` - Brief description (e.g., Utility functions needed for calculations).
- `lib/utils/helpers.test.{{FILE_EXT}}` - Unit tests for `helpers.{{FILE_EXT}}`.

## Tasks

- [ ] 1.0 Parent Task Title
  - [ ] 1.1 [Sub-task description 1.1]
  - [ ] 1.2 [Sub-task description 1.2]
- [ ] 2.0 Parent Task Title
  - [ ] 2.1 [Sub-task description 2.1]
- [ ] 3.0 Parent Task Title (may not require sub-tasks if purely structural or configuration)
```
