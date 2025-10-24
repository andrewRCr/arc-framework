# Atomic Commit Workflow

**Note**: This workflow is for AI execution when explicitly instructed by the user.
AI should NEVER initiate this workflow without user approval.  See DEVELOPMENT-RULES.md for complete protocols.

Break changes into logical, atomic commits with clear messages.

steps:

- name: Check Status
  command: git status
  description: Review all pending changes and verify current branch

- name: Review Changes
  command: git --no-pager diff --stat
  description: Get overview of changed files and line counts

- name: Comprehensive Task Context Analysis
  description: |
  **MANDATORY**: Before committing, perform comprehensive analysis of ALL uncommitted changes
  in the context of current task documentation:

  **Step 1: Identify All Changes**

    - Run `git status` and `git --no-pager diff --name-only` to see all modified files
    - Examine changes that might not be immediately obvious (config files, documentation, etc.)
    - Look for task documentation files that may have been updated

  **Step 2: Find Relevant Task Documentation**

    - Check [active tasks](.arc/active/) for active task lists related to current work
        - Feature work: `.arc/active/feature/`
        - Technical work: `.arc/active/technical/`
        - Incidental work: `.arc/active/incidental/`
    - Also check [upcoming tasks](.arc/upcoming/) for additional relevant tasks
        - Feature: `.arc/upcoming/feature/`
        - Technical: `.arc/upcoming/technical/`
    - Look for task files that reference modified files or related functionality
    - Use `find .arc -name "*.md" -exec grep -l "user-auth" {} \;` to find related tasks
    (replace "user-auth" with your actual feature name, e.g., "payment-integration", "movie-api", etc.)

  **Step 3: Analyze Task Progress Context**

    - Compare actual work completed against task documentation
    - Identify which specific subtasks were completed by your changes
    - Check if completing subtasks makes any parent tasks complete
    - Verify that task status in documentation matches actual implementation

  **Step 4: Validate Milestone Context**

    - Determine if changes complete major milestones (e.g., "Backend PoC Complete")
    - Check if this is partial progress toward a larger goal vs. completion of a phase
    - Identify remaining work required for full phase/milestone completion

  **Step 5: Update Task Documentation**

    - Mark completed subtasks as [x] in task files
    - Mark parent tasks as [x] ONLY if ALL subtasks are complete
    - Update any progress notes or status indicators
    - Add any new tasks that were discovered during implementation

  **Common Scenarios to Check:**

    - Code quality improvements (linting, formatting) often accompany feature completion
    - Documentation updates may signal completion of analysis or design phases
    - Test file changes may indicate testing milestones reached
    - Configuration changes may be part of larger feature enablement

- name: Plan Commits
  description: |
  Organize changes into logical groups:

  1. Core functionality (new features, major logic)
  2. Configuration/Infrastructure (settings, configs)
  3. Tests (test files, test configurations)
  4. Documentation (README, docs, task updates)
  5. Code formatting (linting fixes, style)
  6. Dependencies (package.json, requirements)
  7. Cleanup (removals, refactoring)

- name: Create Atomic Commits
  description: |
  For each logical group:

  1. git add [specific files for this group]
  2. git commit -m "[type](feature-scope): Brief description

     - Detailed change 1
     - Detailed change 2
     - Impact or rationale"

  Commit types:

    - feat: new features
    - fix: bug fixes
    - docs: documentation (including task status updates)
    - style: code formatting
    - refactor: code restructuring
    - test: adding/fixing tests
    - config: configuration changes
    - chore: maintenance tasks

  Scope Guidelines (Feature Context):

    - Use feature/system name for multi-task features (e.g., "logging-system", "user-auth", "movie-api")
    - Use specific component for single changes (e.g., "middleware", "database", "frontend")
    - Examples: feat(logging-system), config(user-auth), docs(movie-api)
    - Provides context for related commits across multiple tasks

  Task Documentation Guidelines:

    - **Always examine task context BEFORE writing commit messages**
    - Reference specific task numbers with feature context (e.g., "Complete logging-system task 2.0")
    - Include parent feature name when completing sub-tasks
    - When all subtasks are done, mark parent task complete in same commit
    - **Distinguish between partial progress and milestone completion**
        - "Complete backend portion of Feature X" (when frontend remains)
        - "Complete Feature X Phase 1" (only when entire phase is done)
    - **Identify remaining work clearly** in commit messages
    - Commit messages should match actual task progress, not aspirational goals
    - Always check [active tasks](.arc/active/) and [upcoming tasks](.arc/upcoming/) files before committing docs changes
    - **Review multiple task files** - work often spans multiple task lists

  Example Commit Messages with Proper Task Context:

  ```
  # Milestone completion with proper context
  feat(backend): Complete backend portion of API Layer Modernization Phase 1

  ✅ **BACKEND MILESTONE: Backend PoC Complete - Ready for Frontend Integration**

  **Completed Tasks:**
  - ✅ 4.0 Testing and Validation - All movie app tests passing with Django Ninja
  - ✅ 4.4 Type Safety Compliance - Zero type errors with strict type checking
  - ✅ 4.4.5 Documentation - Testing standards documented for future migrations

  **Remaining for Phase 1 Completion:** Frontend Integration (Tasks 5.0-5.6)

  Related to: API Layer Modernization PRD - Backend portion of Phase 1 PoC

  # Feature branch commits with task context
  feat(user-profile): Implement profile editing form component (Task 2.1)
  config(user-profile): Add validation schema for profile updates (Task 2.3)
  test(user-profile): Add comprehensive profile editing tests (Task 2.5)
  docs(user-profile): Complete Task 2.0 - Profile Editing UI

  # Quality improvements that accompany feature work
  style(backend): Fix flake8 violations for code compliance

  - Resolve line length and complexity violations across movie app
  - Support completion of API modernization quality gates
  - Enable successful completion of Task 4.4 (Type Safety Compliance)

  Related to: API Layer Modernization PRD - Quality standards requirement
  ```

- name: Verify Commits
  command: git log --oneline -10
  description: Review recent commit messages for clarity

- name: Final Check
  command: git status
  description: Ensure all changes are committed and verify branch state

notes: |
Good atomic commit practices:

- Each commit should be a single logical change
- Commits should be independently buildable/testable
- Use descriptive commit messages with context
- Group related changes together
- Separate formatting from functional changes
- Keep commits focused and purposeful

Feature Branch Practices:

- Always verify you're on the correct feature branch before committing
- All feature work commits should happen on the feature branch
- Use feature context in commit scopes (e.g., feat(user-profile))
- Preserve commit history when merging (no squash merge)
- Clean up feature branches after successful merge

Task Documentation Consistency:

- **MANDATORY**: Perform comprehensive task context analysis before every commit
- Always verify task status matches commit content across ALL relevant task files
- Mark parent tasks [x] when all subtasks are [x], but ONLY then
- Reference correct task numbers in commit messages with full context
- **Distinguish clearly** between partial progress and complete milestones
- Include task status updates in documentation commits
- **Check multiple task files** - work often affects multiple task lists
- **Analyze the full scope** of uncommitted changes, not just obvious files
- Follow [Task Processing Workflow](../3-process-task-loop.md) completion protocol

**Key Principle**: Commit messages should accurately reflect WHERE the project stands after the commit,
not just what was changed. This includes identifying remaining work and providing proper milestone context.
