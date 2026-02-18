# Atomic Commit Workflow

**Audience:** Agent-executed at developer's direction — agent NEVER initiates commits without explicit approval.
See DEVELOPMENT-RULES.md for complete protocols.

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

  **Step 1.5: Check for Multi-Session Uncommitted Work**
    - Read CURRENT-SESSION.md for "Uncommitted Work" or similar section
    - If present, this indicates changes spanning multiple sessions
    - Identify which uncommitted changes are from:
        - Previous session (documented in CURRENT-SESSION)
        - Current session (not yet documented)
    - **GOAL:** Separate commits for different work contexts (different sessions, tasks, or features)
    - **PRAGMATIC EXCEPTION:** If changes are truly intermingled in same file/function:
        - Using `git add -p` (interactive patch mode) may be overkill for minor overlap
        - Can commit together but document the overlap in commit body
        - Example: "Note: Also includes X from previous session (same file modified)"
    - **Don't combine:** Work from different tasks/contexts just because it's easier
    - Plan commits to respect original work boundaries and temporal context

  **Step 2: Find Relevant Task Documentation**
    - Check [active tasks](.arc/active/) for active task lists related to current work
        - Feature work: `.arc/active/feature/`
        - Technical work: `.arc/active/technical/`
        - Incidental work: `.arc/active/incidental/`
    - Also check [backlog tasks](.arc/backlog/) for additional relevant tasks
        - `.arc/backlog/feature/` and `.arc/backlog/technical/`
    - Look for task files that reference modified files or related functionality
    - Search `.arc/` for keywords related to your changes to find relevant task files
      (e.g., grep for "authentication", "pipeline", "api-layer", etc.)
    - This task list reference will be used in Context: footer of commit message

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

  **Step 5.5: Archive Completed Atomic Tasks**
    - If ATOMIC-TASKS.md contains completed `[x]` items, they must be archived before committing
    - Move completed tasks to `reference/archive/{year}-q{N}/completed-atomic-{year}-q{N}.md` (insert at top)
        - Example: `reference/archive/2025-q4/completed-atomic-2025-q4.md`
    - Add completion notes and branch info per ATOMIC-TASKS.md format
    - **Rationale:** ATOMIC-TASKS.md should only contain pending work; completed items are archived
    - **Exception:** If the atomic task is being completed in the current commit, archive it now

  **Step 6: Determine Context Footer**
    - Task list work: MUST use task list filename WITH parenthetical:
        - (Task X.Y) for specific task work
        - (incidental - discovered during Task X.Y) for incidental during task
        - (planning) for task list maintenance
    - Non-task-list work: MUST use boundary category WITH parenthetical:
        - (no associated task list) - for emergent work, quick fixes
        - (atomic / no associated task list) - for work from ATOMIC-TASKS.md or atomic emergent work
        - Boundary categories: planning, documentation, maintenance, refactor

- name: Plan Commits
  description: |
  Organize changes into logical groups:

  1. Core functionality (new features, major logic)
  2. Configuration/Infrastructure (settings, configs)
  3. Tests (test files, test configurations)
  4. Documentation - Task list updates (use task list Context:)
  5. Documentation - Boundary scenarios (use category Context: if no task list)
  6. Code formatting (linting fixes, style)
  7. Dependencies (package manifests, lock files)
  8. Cleanup (removals, refactoring)

  **Important: Documentation Overlap Scenario**

  When working on multiple numbered tasks (e.g., 6.1.d, 6.1.e, 6.1.f), the task list
  markdown will ALWAYS be updated by all tasks. Strategy docs and other documentation
  MAY also be updated by multiple tasks.

  In these cases, commit documentation LAST as a separate commit after all code commits:

  Example with tasks 3.1, 3.2, 3.3:
    - Commit 1: Task 3.1 code changes only
    - Commit 2: Task 3.2 code changes only
    - Commit 3: Task 3.3 code changes only
    - Commit 4: docs(arc): update task list and strategy doc for Tasks 3.1-3.3

  This avoids artificial coupling of unrelated code changes and maintains true atomicity.
  The documentation commit should reference all tasks it documents (Tasks X.Y-X.Z format).

- name: Create Atomic Commits
  description: |

  ## Commit Message Standard

  All commits must follow this format:

  ```
  <type>(scope): Brief description (50-72 chars)

  - Key change (1-2 lines)
  - Rationale (1-2 lines)
  - Impact if significant (1-2 lines)

  Context: [task-reference or category]
  ```

  **Body limits:** 10-15 lines (20-25 for milestones), 1-2 lines per bullet

  **Types:** `feat` `fix` `docs` `style` `refactor` `test` `chore` `perf` `config`

  **Scope:** Functional area (e.g., auth, api, tests, types, config, docs, arc, deps)

  ## Context Footer Format

  **With task list (most common):**

  ```bash
  Context: tasks-[exact-filename].md (Task X.Y)              # Single task
  Context: tasks-[exact-filename].md (Tasks X.Y-X.Z)         # Sequential range
  Context: tasks-[exact-filename].md (Tasks X.Y, A.B, C.D)   # Non-contiguous
  Context: tasks-[exact-filename].md (planning)              # Task list maintenance only
  ```

  **Task completion with extra task list work:**

  Use when completing tasks AND doing additional planning/maintenance work on the task list itself:

  ```bash
  Context: tasks-[exact-filename].md (Tasks X.Y, A.B; planning)      # Task completion + added new subtasks
  Context: tasks-[exact-filename].md (Tasks X.Y-X.Z; maintenance)    # Task completion + restructured phases
  ```

  **When to use qualifiers:**
    - **planning**: Completing tasks AND adding NEW tasks/subtasks that weren't there before
    - **maintenance**: Completing tasks AND restructuring/enhancing/removing existing task content

  **When NOT to use qualifiers:**
    - Just marking completed tasks `[x]` - that's implicit in task completion (no qualifier needed)
    - Code changes beyond the listed tasks - commit those separately (atomic commits principle)

  **IMPORTANT:** If using a qualifier, the commit body MUST describe what the extra planning/maintenance work was.
  The qualifier is a flag that says "there's more here," but the body provides the details.

  **Incidental - discovered during task work:**

  ```bash
  Context: tasks-[parent-filename].md (incidental - discovered during Task X.Y)
  ```

  **Incidental - discovered during code review:**

  ```bash
  Context: tasks-[exact-filename].md (incidental - discovered during code review)
  ```

  Use for fixes/improvements discovered during local or PR code review (pre-merge refinements).

  **Task list planning/maintenance:**

  ```bash
  Context: tasks-[exact-filename].md (planning)      # Adding/updating tasks in existing list
  ```

  **No associated task list (boundary scenarios):**

  ```bash
  # Standard pattern (emergent work, not pre-documented)
  Context: planning (no associated task list)        # PRD creation, NEW task list generation
  Context: documentation (no associated task list)   # PROJECT-STATUS, README, ARC framework updates
  Context: maintenance (no associated task list)     # Dependencies, tooling, configuration
  Context: refactor (no associated task list)        # Quality improvements, cleanup discovered during reviews

  # Atomic pattern (from ATOMIC-TASKS.md or atomic emergent work)
  Context: maintenance (atomic / no associated task list)     # Quick fixes, chores, routine upkeep
  Context: refactor (atomic / no associated task list)        # Small code restructuring, helper extraction
  Context: documentation (atomic / no associated task list)   # Quick doc updates
  Context: planning (atomic / no associated task list)        # Small planning/strategy updates
  ```

  **Note:** Both patterns valid. Use "atomic / no associated task list" for:
    - Work from `active/ATOMIC-TASKS.md`
    - Emergent atomic work (small, one-off tasks)
    - Emphasizes atomic nature vs complex task list work

  **Parent task completion:**
  Add single line before Context: footer:

  ```bash
  Completes parent task X.0: [Parent Task Name]
  ```

  ## Mandatory Rules

  **Required:**

    - ✅ Conventional Commits format: `<type>(scope): description`
    - ✅ Subject 50-72 characters
    - ✅ Context: footer with REQUIRED parenthetical (task reference OR boundary category)
    - ✅ Task numbers: "Task 3.6" NOT "Phase 3.6"
    - ✅ Body: 10-15 lines (20-25 max for milestones)

  **Prohibited:**

    - ❌ PRD references (use task list instead)
    - ❌ Display names (use exact filenames: "tasks-auth-system.md" NOT "auth feature")
    - ❌ Generic descriptions when referencing task lists ("auth system" → "tasks-auth-system.md")
    - ❌ Checkbox lists in body
    - ❌ Implementation details (code shows what, commits show why)
    - ❌ "Phase X.Y" when referring to tasks

  ## Complete Examples

  ### Standard Single Task

  ```
  fix(auth): resolve token refresh race condition

  - Refresh now acquires lock before checking expiry
  - Prevents duplicate refresh requests on concurrent API calls
  - Adds exponential backoff for retry attempts

  Context: tasks-auth-system.md (Task 2.1)
  ```

  ### Multiple Tasks

  ```
  refactor(api): extract service layer for data operations

  - Extracted DataService class with business logic from handlers
  - Updated CRUD endpoints to use service layer
  - Added comprehensive service layer test coverage

  Context: tasks-api-modernization.md (Tasks 3.1-3.4)
  ```

  ### Parent Task Completion

  ```
  test(pipeline): verify data transformation accuracy across formats

  - Tested CSV, JSON, and Parquet input formats
  - Verified schema validation catches malformed records
  - All integration tests passing

  Completes parent task 3.0: Data Validation Phase

  Context: tasks-pipeline-validation.md (Task 3.6)
  ```

  ### Incidental - Discovered During Task

  ```
  style(config): fix variable naming convention

  - Changed MAX_RETRY_COUNT to max_retry_count
  - Resolves linter naming convention violation

  Context: tasks-auth-system.md (incidental - discovered during Task 2.1)
  ```

  ### Incidental - Discovered During Code Review

  ```
  fix(docs): correct API endpoint documentation

  - Fixed route path in authentication section (was /auth, now /api/v2/auth)
  - Added missing rate limit header to response examples
  - Added TODO for WebSocket endpoint documentation

  Context: tasks-api-documentation.md (incidental - discovered during code review)
  ```

  ### Planning Work - New Task List

  ```
  docs(arc): create PRD for caching layer implementation

  - Analyzed current performance bottlenecks
  - Defined cache invalidation strategy
  - Generated initial task breakdown (5 phases)

  Context: planning (no associated task list)
  ```

  ### Planning Work - Updating Existing Task List

  ```
  docs(arc): add Task 3.7 for connection pool monitoring

  - Discovered during tasks-data-pipeline.md (Task 3.3)
  - Pool exhaustion under load not covered by existing tasks
  - Task 3.7 adds health check endpoint and alerting
  - Follows implementation-then-test structure

  Context: tasks-data-pipeline.md (planning)
  ```

  ### Task Completion with Extra Task List Work

  ```
  docs(arc): complete Phase 4 and restructure Phase 5 scope

  - Marked Task 4.3 complete (retry logic with backoff)
  - Marked parent Tasks 4.1, 4.2, and Phase 4 complete
  - Removed unnecessary Task 4.2.e (Phase 6 integration test covers this)
  - Restructured Phase 5: sequential steps → parallel workstreams
  - Expanded acceptance criteria for monitoring tasks

  Rationale: Parallel structure enables independent progress on
  logging and metrics without blocking each other.

  Context: tasks-data-pipeline.md (Tasks 4.1-4.3; maintenance)
  ```

  ### Repository Maintenance (Atomic)

  ```
  chore(deps): update framework to security patch version

  - Updated [framework] from X.Y.Z to X.Y.Z+1
  - Addresses CVE-YYYY-XXXXX
  - All tests passing post-update

  Context: maintenance (atomic / no associated task list)
  ```

  ### Quick Documentation Update (Atomic)

  ```
  docs(arc): update AGENTS.md with backlog structure

  - Added backlog organization section
  - Clarified TASK-INBOX.md and ATOMIC-TASKS.md purpose
  - Updated discovery mechanism description

  Context: documentation (atomic / no associated task list)
  ```

  ## Commit Message Guidelines

  **Focus on WHY and IMPACT:**

    - ✅ "Prevents duplicate requests on concurrent API calls" (impact)
    - ✅ "Improves query performance by 40%" (measurable)
    - ❌ "Changed function name" (code shows this)

  **Provide context for future readers:**

    - What problem existed?
    - What solution was chosen?
    - What impact does this have?

  **Keep it scannable:**

    - One idea per bullet
    - 1-2 lines max per bullet
    - Active voice

  **Use exact filenames everywhere:**

    - ✅ "Discovered during Phase 4.1.c audit (tasks-data-pipeline.md)"
    - ❌ "Discovered during pipeline audit" (too vague)
    - ✅ "Implements pattern from tasks-api-modernization.md (Task 3.2)"
    - ❌ "Implements API modernization pattern" (missing filename)
    - **Why:** Enables easy `git log --grep` searches and unambiguous traceability

  **Remember:** Commit messages should accurately reflect WHERE the project stands after the commit.
  All commits should be independently understandable without extensive archaeology.

- name: Verify Commits
  command: git log --oneline -10
  description: Review recent commit messages for clarity

- name: Final Check
  command: git status
  description: Ensure all changes are committed and verify branch state

notes: |

## Planned Work Branch Practices

- Verify you're on the correct feature/technical branch before committing
- Branch naming: `feature/[name]` for user-facing work, `technical/[name]` for infrastructure
- Incidental work commits to feature/technical branch (no separate branches)
- Preserve commit history when merging (no squash merge)
- Clean up branches after successful merge

## Task Documentation Requirements

- **MANDATORY**: Perform comprehensive task context analysis before every commit
- Always include Context: footer with exact task list filename or boundary category
- Mark parent tasks [x] when all subtasks complete, in same commit as final subtask
- Verify task status in files matches actual implementation
- Follow [Task Processing Workflow](../3_process-task-loop.md) completion protocol
- See [Work Organization Strategy](../../strategies/arc/strategy-work-organization.md) for branch naming

---

Commit messages should accurately reflect WHERE the project stands after the commit,
not just what changed. This includes identifying remaining work and providing proper milestone context.
