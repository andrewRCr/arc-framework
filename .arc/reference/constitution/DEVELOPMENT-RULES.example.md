# Development Rules - {{PROJECT_NAME}}

<!--
Copy this file and customize the quality gate commands for your technology stack.
Replace {{PLACEHOLDERS}} with your actual values.
This structure is battle-tested - follow the sections and adapt commands to your environment.
-->

**Version:** {{VERSION}} | **Updated:** {{DATE}} | **Hash:** `{{HASH}}`

Core development rules and quality standards for {{PROJECT_NAME}}. These rules are **non-negotiable** and must be followed
by all contributors, including AI assistants.

**For command patterns and environment context**, see [QUICK-REFERENCE.md](../QUICK-REFERENCE.md).
**For session initialization protocol**, see [session-init.md](../workflows/supplemental/session-init.md).

## Manual Commit Control

- **AI NEVER initiates commits** without explicit user approval or instruction
- **AI CAN execute commits** when user explicitly approves/instructs it
- **User approval required** for all git operations
- **MANDATORY:** Comprehensive task context analysis before any commit consideration (see atomic-commit workflow)
- **Task list accuracy required**: Before commit consideration, verify task documentation reflects completed work
  (parent task marked `[x]` if all subtasks complete)
- **Never commit stale task docs**: Task list updates must be saved and included in commits for completed work
- AI reports completion, then awaits commit instructions

### Quality Gates (Zero Tolerance)

Before any commit consideration, ALL of the following must pass with **zero exceptions**.
For specific commands, see [QUICK-REFERENCE.md](../QUICK-REFERENCE.md).

**Zero Tolerance Policy:** All errors, violations, and failures must be fixed. No exceptions.

1. **Backend Tests**: 100% pass rate
   - Command: `{{BACKEND_TEST_COMMAND}}`
   - Example: `pytest backend/` or `docker compose exec backend pytest`

2. **Frontend Tests**: 100% pass rate
   - Command: `{{FRONTEND_TEST_COMMAND}}`
   - Example: `npm test` or `docker compose exec frontend npm test`

3. **Backend Linting**: Zero violations
   - Command: `{{BACKEND_LINT_COMMAND}}`
   - Example: `ruff check .` or `flake8 backend/`

4. **Frontend Linting**: Zero violations
   - Command: `{{FRONTEND_LINT_COMMAND}}`
   - Example: `npm run lint` or `eslint src/`

5. **Type Checking**: Zero errors
   - Command: `{{TYPE_CHECK_COMMAND}}`
   - Example: `npx pyright` or `npm run type-check` or `mypy .`

6. **Markdown Linting**: Zero violations
   - Command: `npx --yes markdownlint-cli2 "**/*.md"`
   - Auto-fix: `npx --yes markdownlint-cli2 --fix "**/*.md"`
   - Config: `.markdownlint-cli2.jsonc`

### Quality Gate Failure Protocol

If quality gates fail after sub-task completion:

1. **Report the failure** with specific details
2. **Identify suspected causes** and investigation areas
3. **Ask for guidance** on whether to fix immediately or defer
4. **Never proceed** to next sub-task until resolved or user approves

### Leave It Cleaner: Pre-existing Issue Protocol

**Principle:** When touching any file, leave it cleaner than you found it.
Quality issues discovered during work should be addressed, not ignored.

**When quality checks reveal pre-existing issues in files you're modifying:**

1. **Assess severity and scope:**
   - **Minor issues** (< 5 minutes): Fix immediately without asking
   - **Moderate issues** (5-15 minutes): Fix immediately, document in commit
   - **Major issues** (> 15 minutes): Ask for direction before proceeding

2. **Required actions (choose one):**
   - ✅ **Fix immediately** - Preferred for all issues < 15 minutes
   - ✅ **Document and defer** - Create incidental task list with:
     - Clear description of issue found
     - Why it's being deferred (time/scope constraints)
     - Estimated effort to fix
     - Link to relevant files/line numbers
   - ❌ **Ignore silently** - NEVER acceptable

3. **Documentation requirements:**
   - Fixed issues: Note in commit message ("Also fixed X pre-existing issues")
   - Deferred issues: Create task list in `.arc/active/incidental/tasks-incidental-*.md`
   - Never: Leave issues undocumented or unaddressed

## Session Documentation Control

### CURRENT-SESSION.md Update Protocol

- **AI NEVER updates CURRENT-SESSION.md** without explicit user instruction
- CURRENT-SESSION.md is a handoff document only updated at session end when instructed
- AI should report changes and progress, but user decides when/how session docs are updated

## Task Management Protocol

### One Sub-Task Rule

- **Complete ONE sub-task at a time** - never bundle multiple deliverables
- **Mark complete immediately** when work is done (tests pass, quality checks pass)
- **Mandatory stop** after reporting completion for user approval to proceed
- **Implied permission**: User approval implies permission to proceed UNLESS explicitly stated otherwise
  (e.g., "that's done, but before moving on..."). Address such concerns before proceeding to next subtask.

### Sub-Task Granularity Guidelines

Break down a sub-task if it requires:

- More than 3 files to be modified
- More than 50 lines of core logic changes
- Multiple interdependent changes
- Complex debugging/investigation

### Test-First Protocol

**BEFORE implementing any sub-task, assess test-first requirement:**

**Requires test-first** (write tests BEFORE implementation):

- New models (data schemas, ORM models)
- New API endpoints or endpoint modifications
- New service classes or business logic
- Complex algorithms or data transformations
- Non-trivial validation or processing logic

**Test-after acceptable**:

- Simple CRUD operations with no custom logic
- Presentational UI components
- Configuration file changes
- Trivial refactoring (renaming, moving files)
- Documentation-only changes

**If unsure whether test-first applies, default to test-first.** Writing tests after implementation is harder and less effective.

**During task list creation:** Ensure test sub-tasks appear BEFORE implementation sub-tasks for test-first work.
This makes the protocol visible during execution.

## Testing Requirements

- **Test-first protocol**: See Task Management Protocol section above for when to write tests before vs. after implementation
- **Integration focus**: Prefer flow-level coverage over isolated units when practical
- **All tests must pass** before any commit discussion (see quality gates above)
- **Command patterns**: See [QUICK-REFERENCE.md](../QUICK-REFERENCE.md) for execution commands

## Code Quality Principles

Apply standard software engineering principles:

- **DRY** (don't repeat yourself)
- **SOLID** (single responsibility, open/closed, dependency inversion)
- **KISS** (keep it simple)
- **YAGNI** (you aren't gonna need it)

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

## Reference Documentation

This document provides core rules and standards. See related documentation:

- [QUICK-REFERENCE.md](../QUICK-REFERENCE.md) - Environment context, command patterns, and tool usage
- [Task Processing Workflow](../workflows/3-process-task-loop.md) - Detailed task execution workflow
- [Atomic Commit Workflow](../workflows/supplemental/atomic-commit.md) - Enhanced commit workflow with task context analysis
- [AI Agent Reference Card](../ai-instructions/AGENTS.md) - Complete project context for AI
- [Technical Architecture](TECHNICAL-ARCHITECTURE.md) - Architecture and methodology details
