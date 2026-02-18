# Development Rules - {{PROJECT_NAME}}

**Version:** {{VERSION}} | **Updated:** {{DATE}} | **Hash:** `{{HASH}}`

Core development rules and quality standards for {{PROJECT_NAME}}. These rules are **non-negotiable** and must be
followed by all contributors, including AI assistants.

**For command patterns and environment context**, see [QUICK-REFERENCE.md](../QUICK-REFERENCE.md).
**For session initialization protocol**, see [session-init.md](../workflows/supplemental/session-init.md).

## Manual Commit Control

- **AI NEVER initiates commits** without explicit user approval or instruction
- **AI CAN execute commits** when user explicitly approves/instructs it
- **User approval required** for all git operations
- **NEVER use `--no-verify`** to bypass commit hooks - hooks exist to catch errors
- **Careful with file reverts**: Before running `git checkout -- <file>` or similar destructive operations,
  check `git diff <file>` to understand ALL uncommitted changes. Your changes may not be the only ones in
  that file - other tasks may have added uncommitted work that will be lost
- **MANDATORY:** Comprehensive task context analysis before any commit consideration (see atomic-commit workflow)
- **Task list accuracy required**: Before commit consideration, verify task documentation reflects completed work
  (parent task marked `[x]` if all subtasks complete)
- **Never commit stale task docs**: Task list updates must be saved and included in commits for completed work
- AI reports completion, then awaits commit instructions
- **Commit message format**: Use the `commit-format` skill for proper format (Context footer, subject length, etc.)

### Quality Gates

**Zero Tolerance Policy:** Whatever checks you run, they must pass. No ignoring failures, no exceptions.

**Tiered Approach:** Quality gates follow a tiered system. The tier determines *what* to run; zero tolerance
determines that it must *pass*. See [Quality Gates Strategy](../strategies/arc/strategy-quality-gates.md)
for complete guidance.

| Tier   | When                   | What to Run                                                   |
|--------|------------------------|---------------------------------------------------------------|
| Tier 1 | Per-task               | Type-check, lint, format, related unit tests (modified files) |
| Tier 2 | Parent task completion | Tier 1 (full project) + targeted E2E tests + build            |
| Tier 3 | Per-phase, pre-PR      | Full suite (everything below)                                 |

**Commits and quality gates:** Tiers are milestone-driven, not commit-driven. Work committed through
the task loop inherits the gates already run at each milestone. For work outside the task loop
(incidental fixes, atomic tasks), run at least Tier 1 before committing.

**Full Suite (Tier 3)** - Required for phase completion and pre-PR.
For specific commands, see [QUICK-REFERENCE.md](../QUICK-REFERENCE.md).

1. **Backend Tests**: 100% pass rate
   - Command: `{{BACKEND_TEST_CMD}}`
   - Requirements: {{BACKEND_TEST_REQUIREMENTS}}

2. **Frontend Tests**: 100% pass rate
   - Command: `{{FRONTEND_TEST_CMD}}`

3. **Backend Linting**: Zero violations
   - Command: `{{BACKEND_LINT_CMD}}`

4. **Frontend Linting**: Zero violations
   - Command: `{{FRONTEND_LINT_CMD}}`

5. **Type Checking**: Zero errors
   - Command: `{{TYPE_CHECK_CMD}}`

6. **Markdown Linting**
   - Use markdownlint-cli2 via npx with auto-fix
   - Config: `.markdownlint-cli2.jsonc` (MD034 bare URLs disabled only for temporal docs)
   - Gitignored files automatically excluded (notes/, archive/notes/, CURRENT-SESSION.md)

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
   - Deferred issues: Create task list in `.arc/active/incidental/tasks-incidental-*.md`
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

See [STRATEGY-INDEX.md](../strategies/STRATEGY-INDEX.md) for complete list of available strategies (read every session
during initialization).

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

1. Use atomic-commit workflow to commit all **complete** work
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
- About to run quality gate commands and uncertain which tool/path to use (Docker vs host? Which flags?)
- **About to run TypeScript type checks** - Verify exact command (NEVER use `npx tsc` directly, ALWAYS use `npm run type-check`)
- Working directory context feels uncertain or commands aren't working as expected

**DEVELOPMENT-RULES - Re-check when:**

- Uncertainty about quality standards (what's the zero-tolerance policy? which gates are required?)
- Approaching context limits (verify Session Context Management protocol and agent-specific guidance)
- Confusion about verification, strategy, or task management protocols

**Don't re-check for:**

- Operations with dedicated workflow docs (commit operations, session handoffs, etc; workflows are authoritative, not DEVELOPMENT-RULES)

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

**If unsure whether test-first applies, default to test-first.** Writing tests after implementation is harder and less effective.

**During task list creation:** Ensure test tasks appear BEFORE implementation tasks for test-first work.
This makes the protocol visible during execution.

## Testing Requirements

- **Test-first protocol**: See Task Management Protocol section above for when to write tests before vs. after implementation
- **Integration focus**: Prefer flow-level coverage over isolated units when practical
- **All tests must pass** before any commit discussion (see quality gates above)
- **Command patterns**: See [QUICK-REFERENCE.md](../QUICK-REFERENCE.md) for execution commands
- **Detailed guidance**: See [Testing Methodology Strategy](../strategies/project/strategy-testing-methodology.md)

## Code Quality Principles

Apply standard software engineering principles:

- **DRY** (don't repeat yourself)
- **SOLID** (single responsibility, open/closed, dependency inversion)
- **KISS** (keep it simple)
- **YAGNI** (you aren't gonna need it)

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

### Layered Architecture (Backend)

Backend uses strict layered architecture: API routes handle HTTP concerns only, Service layer contains ALL
business logic (filtering, calculations, presets, orchestration).

**Rule of thumb:** If an API route does more than extract params → call service → return response, the extra
logic likely belongs in Service layer.

### Component Styling Standards (Frontend)

Frontend uses semantic token system for all styling. Components MUST use semantic tokens, never hardcoded colors or
direct style values.

**Required practices:**

- Always use semantic tokens (e.g., `color="tertiary"`, `bg="layer-01"`)
- Never hardcode colors (`color="#4299e1"`, `bg="blue.500"`)
- Never use Chakra raw color tokens (`color="red.600"`, `colorScheme="blue"`)
- Use recipes and wrapper components for consistent patterns
- Reference strategy docs before implementing: [Color Token System](../strategies/project/style/strategy-color-tokens.md),
  [Component Styling Strategy](../strategies/project/style/strategy-component-styling.md)

**Rule of thumb:** If you're writing inline color/style values instead of semantic tokens, check the strategy
docs for the correct pattern.

### Import Standards (Frontend)

Use absolute imports (`@/`) for cross-directory references and relative imports (`./`) for same-directory references.

**Examples:**

- ✅ `import { foo } from "@/services/apiClient"` (from hooks/ to services/)
- ✅ `import { bar } from "./httpService"` (within services/)
- ❌ `import { foo } from "../services/apiClient"` (cross-directory relative)

**Why:** Absolute imports are resilient to file moves and make import paths self-documenting. The `@/` alias maps
to `src/`, configured in `tsconfig.json` and `vite.config.ts`.

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
  Examples: "Task 8.3 - `tasks-oauth-headless-migration.md`", "Phase 3 - `tasks-service-layer-modernization.md`"

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

**Format and guidance:** See [ADR Methodology Strategy](../strategies/arc/strategy-adr-methodology.md)
**Template:** See `.arc/reference/adr/adr-template.md`

ADRs are immutable once accepted - new decisions require new ADRs that supersede old ones.

## Reference Documentation

This document provides core rules and standards. See related documentation:

- [QUICK-REFERENCE.md](../QUICK-REFERENCE.md) - Environment context, command patterns, and tool usage
- [Task Processing Workflow](../workflows/3_process-task-loop.md) - Detailed task execution workflow
- [Atomic Commit Workflow](../workflows/supplemental/atomic-commit.md) - Enhanced commit workflow with task context analysis
- [AI Agent Reference Card](../agent/AGENTS.md) - Complete project context for AI
- [Technical Overview](TECHNICAL-OVERVIEW.md) - High-level system architecture and technology stack
- [ADR Methodology Strategy](../strategies/arc/strategy-adr-methodology.md) - Architecture decision record guidance
- [Type Safety Strategy](../strategies/project/strategy-type-safety.md) - Type checking approach and patterns
- [Testing Methodology Strategy](../strategies/project/strategy-testing-methodology.md) - Testing philosophy and practices
