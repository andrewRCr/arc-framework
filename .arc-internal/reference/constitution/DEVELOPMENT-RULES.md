# Development Rules - ARC Agentic Development Framework

**Version:** 0.2.0-dev | **Updated:** 2025-10-24 | **Hash:** `4b3d89f2`

Core development rules and quality standards for the ARC framework. These rules are **non-negotiable** and must be followed
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

1. **Markdown Linting**: Zero violations
   - Command: `npx --yes markdownlint-cli2 "**/*.md"`
   - Auto-fix: `npx --yes markdownlint-cli2 --fix "**/*.md"`
   - Config: `.markdownlint-cli2.jsonc`

2. **CI Validation**: All checks pass
   - GitHub Actions runs automatically on push/PR
   - Markdown linting (zero violations policy)
   - Template structure validation
   - Internal link checking

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
   - Deferred issues: Create task list in `.arc-internal/active/incidental/tasks-incidental-*.md`
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

**N/A for documentation-only framework** - no code to test

## Testing Requirements

**N/A for documentation-only framework** - markdown linting serves as primary quality gate

## Code Quality Principles

Apply standard software engineering principles:

- **DRY** (don't repeat yourself)
- **SOLID** (single responsibility, open/closed, dependency inversion)
- **KISS** (keep it simple)
- **YAGNI** (you aren't gonna need it)

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

## Framework-Specific Rules

### Documentation Standards

- All `.md` files must be well-formed Markdown (zero tolerance for linting failures)
- Template-first documents with comprehensive inline guidance and framework defaults
- Examples clearly marked as `.example.md` and copy-ready
- READMEs required for each directory
- ALWAYS run markdown linting after updating any documentation files

### File Organization

- `.arc/` = the deployable template system (permanent, versioned)
- `.arc-internal/` = framework development workspace (internal use only)
- Template-first documents in `.arc/reference/constitution/`, `.arc/reference/agent/`
- Core workflows in `.arc/reference/workflows/`

### Commit Standards

- **Pre-commit checks**: Run markdown linting before committing (zero tolerance)
- **Reference META-PRD context** and task documentation in commit messages
- **Use conventional commit format**: Required (feat:, docs:, fix:, refactor:, etc.)
- **Atomic commits** for single logical changes
- **Multi-line commits**: If `git commit -m` causes interactive editor issues, use file approach:

  ```bash
  # Create commit message file
  cat > /tmp/commit_msg.txt << 'EOF'
  type(scope): Brief description

  - Detailed change 1
  - Detailed change 2
  - Impact/rationale
  EOF

  # Commit using file
  git commit -F /tmp/commit_msg.txt
  rm /tmp/commit_msg.txt
  ```

- **Never commit if**:
    - Documentation is inconsistent
    - Markdown linting fails
    - CI checks would fail
    - Task documentation doesn't align with changes

## Reference Documentation

This document provides core rules and standards. See related documentation:

- [QUICK-REFERENCE.md](../QUICK-REFERENCE.md) - Environment context, command patterns, and tool usage
- [Task Processing Workflow](../../.arc/reference/workflows/3_process-task-loop.md) - Detailed task execution workflow
- [Atomic Commit Workflow](../../.arc/reference/workflows/supplemental/atomic-commit.md) - Enhanced commit workflow
- [AI Agent Reference Card](../agent/AGENTS.md) - Complete project context for AI
