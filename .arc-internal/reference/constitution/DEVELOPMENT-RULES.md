# Development Rules - ARC Agentic Development Framework

<!-- Version tracks project rule evolution, not the ARC framework version. -->
**Version:** 0.3.0-dev | **Updated:** 2025-12-26 | **Hash:** `8c5f2a91`

Core development rules and quality standards for the ARC framework. These rules are **non-negotiable** and must be followed
by all contributors, including AI assistants.

**For command patterns and environment context**, see [QUICK-REFERENCE.md](../QUICK-REFERENCE.md).
**For session initialization protocol**, see [session-init.md](../../system/workflows/arc/supplemental/session-init.md).

## Commit Standards

### Commit Control

- **AI NEVER initiates commits** without explicit user approval or instruction
- **AI CAN execute commits** when user explicitly approves/instructs it
- **User approval required** for all git operations
- **NEVER use `--no-verify`** to bypass commit hooks — hooks exist to catch errors
- **Careful with file reverts**: Before `git checkout -- <file>`, check `git diff <file>` — other
  tasks may have uncommitted work in the same file
- **Task list accuracy**: Before committing, verify task documentation reflects completed work
  (parent task marked `[x]` if all subtasks complete). Stage task list updates with the commit
- AI reports completion, then awaits commit instructions

**For complex commits** (multi-session accumulated work, interleaved concerns), see
[Commit Workflow](../../../.arc/system/workflows/arc/supplemental/atomic-commit.md).

### Commit Message Format

```text
<type>(scope): Brief description (50-72 chars, imperative mood)

- Key change or rationale (1-2 lines per bullet)
- Impact if significant

Context: [task-reference or category]
```

**Types:** `feat` `fix` `docs` `content` `style` `refactor` `test` `chore` `perf` `build` `ci` `config` `revert`

**Scope:** Lowercase functional area (e.g., `auth`, `api`, `tests`, `config`, `arc`, `deps`).

**Body:** 10-15 lines max (20-25 for milestones). Focus on WHY and IMPACT, not what changed.

**Context footer (required on every commit):**

With task list:

- `Context: tasks-[filename].md (Task X.Y)` — single task
- `Context: tasks-[filename].md (Tasks X.Y-X.Z)` — range
- `Context: tasks-[filename].md (Tasks X.Y, A.B)` — non-contiguous
- `Context: tasks-[filename].md (Tasks X.Y; planning)` — task completion + extra task list work
- `Context: tasks-[filename].md (incidental - discovered during Task X.Y)` — incidental fix
- `Context: tasks-[filename].md (planning)` — task list planning/creation
- `Context: tasks-[filename].md (activation)` — backlog to active transition
- `Context: tasks-[filename].md (archival)` — active to archive transition

Without task list:

- `Context: [category] (no associated task list)` — emergent work
- `Context: [category] (atomic / no associated task list)` — small one-off work

Categories: `planning`, `documentation`, `maintenance`, `refactor`.

**Atomicity:** One logical change per commit. When multiple tasks completed between commits, separate
code changes by task; commit shared documentation (task list updates) last.

**Enforcement:** Git hooks validate format automatically. See `.arc/system/githooks/README.md` for setup.

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

If quality gates fail after task completion:

1. **Report the failure** with specific details
2. **Identify suspected causes** and investigation areas
3. **Ask for guidance** on whether to fix immediately or defer
4. **Never proceed** to next task until resolved or user approves

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

## Verification Protocol

**Principle:** Wrong information is worse than no information - it wastes time and breaks trust.

**When uncertain about implementation details, file locations, or existing content:**

1. **Search first:** Use Grep/Glob/Read to verify from source
2. **Ask clarifying questions:** When you understand the request but design decisions need input
3. **Stop and ask:** If still unclear after searching

**Never generate or assume:**

- File paths or directory structure (use Glob)
- What code "probably does" (read the actual implementation)
- Task phase content or summaries (read the task list)
- Implementation approaches without understanding requirements

**On clarifying questions:**
When you mostly understand a request but see ambiguities, edge cases, or design alternatives that need decisions - ask.
Examples: "Should this handle empty states?" "Do we want this cached?" "Which takes precedence if both conditions are
true?" These questions improve outcomes for both code and documentation work.

**Why this matters:** Made-up content in documentation misleads future work. Assumed behavior in code wastes debugging
time. Verification takes seconds; fixing wrong assumptions takes hours.

## Strategy Document Protocol

**Before implementing work in codified domains, consult the relevant strategy document.**

See [STRATEGY-INDEX.md](../../.arc/reference/strategies/STRATEGY-INDEX.md) for complete list of available strategies
(read every session during initialization).

**Process:**

1. Identify if your work touches a domain with codified guidance (theming, auth, testing, layout, etc.)
2. Grep the strategy doc for your specific topic (e.g., `grep -i "button patterns" strategy-component-styling.md`)
3. Read relevant section(s) before implementing
4. Follow documented patterns and token usage

**When uncertain if strategy applies:** Ask. "Does this work touch [domain] where we have strategy guidance?"

**For large multi-topic strategies** (e.g., `strategy-component-styling.md`): Search for specific component/pattern
rather than reading entire document.

**Why this matters:** Strategy docs codify decisions, patterns, and token systems. Following them ensures consistency and
prevents rework when non-standard approaches are caught in review.

## Session Context Management

**Principle:** Work quality must never be compromised due to context/resource limitations. Session handoffs are
managed by the user.

**Core Protocol:**

- Work at full specification throughout the session
- When approaching context limits (agent-specific thresholds in agent files like CLAUDE.md):
  1. Complete current work item (don't stop mid-edit)
  2. Evaluate remaining work scope
  3. **Stop and ask user** how to proceed with summary of completed/remaining work
  4. User decides: continue, commit completed work then continue, or begin handoff
- **Never** degrade work quality or change approach due to context/resource pressure
- **Never** make "efficiency" tradeoffs based on context window size

**Ideal end-of-session workflow:**

1. Commit all **complete** work (see [Commit Workflow](../../../.arc/system/workflows/arc/supplemental/atomic-commit.md)
   for complex scenarios)
2. Leave any **partial** work uncommitted
3. Perform session handoff documenting partial work state

**Backup workflow** (when insufficient resources remain for commits):

- Session handoff captures commit-message-level notes
- Next session executes commits from documented state
- Less ideal but functional fallback

**Why this matters:** Incomplete work done properly with good handoff is better than complete work done sloppily.
Context management is user responsibility - AI focuses on maintaining work quality standards.

**Agent-specific details:** See agent-specific files (CLAUDE.md, GEMINI.md, etc.) for context window thresholds
and monitoring protocols.

## Core Document Reference Protocol

Core documents (QUICK-REFERENCE, DEVELOPMENT-RULES) are read each session but should be re-checked when triggered.

**QUICK-REFERENCE - Re-check when:**

- Bash command fails with path/environment errors (ENOENT, "no such file or directory", "config not found")
- About to run quality gate commands and uncertain which tool/path to use
- Working directory context feels uncertain or commands aren't working as expected

**DEVELOPMENT-RULES - Re-check when:**

- Uncertainty about quality standards (what's the zero-tolerance policy? which gates are required?)
- Approaching context limits (verify Session Context Management protocol and agent-specific guidance)
- Confusion about verification, strategy, or task management protocols

**Don't re-check for:**

- Operations with dedicated workflow docs (commit operations, session handoffs, etc; workflows are authoritative)

**Why this matters:** Session-start reading establishes baseline context. Trigger-based re-checking ensures accuracy
when specific patterns/commands are needed. Active verification beats passive recall, especially later in long sessions.

## Task Management Protocol

### One Task at a Time

Each checkbox in the task list is one work unit — whether it's a standalone task or a subtask under
a parent. The checkpoint is always at the checkbox level.

- **Complete ONE task at a time** — never bundle multiple deliverables
- **Mark complete immediately** when work is done (tests pass, quality checks pass)
- **Mandatory stop** after reporting completion for user approval to proceed
- **Implied permission**: User approval implies permission to proceed UNLESS explicitly stated otherwise
  (e.g., "that's done, but before moving on..."). Address such concerns before proceeding to the next task.

### Task Granularity Guidelines

Break down a task into subtasks if it requires:

- More than 3 files to be modified
- More than 50 lines of core logic changes
- Multiple interdependent changes
- Complex debugging/investigation

### Test-First Protocol

**N/A for documentation-only framework** - no code to test. See below for the general protocol that applies to
code-based projects.

**General Protocol (for code-based projects):**

**BEFORE implementing any task, assess test-first requirement:**

**Requires test-first** (write tests BEFORE implementation):

- New models (Django models, data schemas)
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

**If unsure whether test-first applies, default to test-first.** Writing tests after implementation is harder and
less effective.

**During task list creation:** Ensure test tasks appear BEFORE implementation tasks for test-first work.
This makes the protocol visible during execution.

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
- Templates clearly marked as `.template.md` and copy-ready
- READMEs required for each directory
- ALWAYS run markdown linting after updating any documentation files

### File Organization

- `.arc/` = the deployable template system (permanent, versioned)
- `.arc-internal/` = framework development workspace (internal use only)
- Template-first documents in `.arc/reference/constitution/`, `.arc/system/agent/`
- Core workflows in `.arc/system/workflows/`

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

### Code Documentation Standards

- **No meta-project references in codebase**: Never reference task IDs, phase numbers, or `.arc/`
  documentation in production code (comments, docstrings, variable names). Meta-project information
  belongs only in `.arc/` documentation. Code should explain "what" and "why" independently of
  project management context.

- **Task references in `.arc/` documentation**: When referencing tasks in `.arc/` documentation,
  always include both the task/phase identifier AND the task list filename in backticks. Format:
  "Task X.Y - `tasks-name.md`" or "Phase X - `tasks-name.md`". Use only the filename (no path),
  as task lists move between active/, backlog/, and archive/ directories. This ensures references
  are searchable and provide clear context about which work the task belongs to.
  Examples: "Task 8.3 - `tasks-oauth-migration.md`", "Phase 3 - `tasks-service-layer.md`"

- **Collaborative voice in documentation**: Commits, task lists, and project docs should read
  naturally from an author or team perspective. Avoid third-person references to collaborators;
  write as the work's author would.

## Architecture Documentation

### Architecture Decision Records (ADRs)

Document significant architectural decisions in ADRs (`.arc/reference/adr/`). ADRs capture the context,
decision, and consequences of important design choices, serving as historical record and reference for
understanding system constraints.

**Write an ADR when:**

- Decision affects system structure or external contracts
- Multiple alternatives were considered
- Decision driven by external constraint (API limitations, regulatory requirements)
- Future developers will ask "why did we do it this way?"
- Decision could be reversed later (context needed for reversal)

**Don't write an ADR for:**

- Purely tactical implementation choices (variable names, loop constructs)
- Decisions obvious from reading code (standard CRUD, framework conventions)
- Temporary or experimental choices

**Format and guidance:** See [ADR Methodology Strategy](../../../.arc/reference/strategies/arc/strategy-adr-methodology.md)

ADRs are immutable once accepted - new decisions require new ADRs that supersede old ones.

## Reference Documentation

This document provides core rules and standards. See related documentation:

- [QUICK-REFERENCE.md](../QUICK-REFERENCE.md) - Environment context, command patterns, and tool usage
- [Task Processing Workflow](../../../.arc/system/workflows/arc/3_process-task-loop.md) - Detailed task execution workflow
- [Commit Workflow](../../../.arc/system/workflows/arc/supplemental/atomic-commit.md) - Complex commit scenarios,
  atomicity analysis
- [AI Agent Reference Card](../../system/agent/AGENTS.md) - Complete project context for AI
- [ADR Methodology Strategy](../../../.arc/reference/strategies/arc/strategy-adr-methodology.md) - ADR guidance
