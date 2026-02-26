# Strategy: Development Methodology

**Purpose:** Codify the framework-universal operational rules that govern how AI agents and human
developers work together. These behavioral constraints are consistent across all ARC projects regardless
of technology stack.

**Scope:** Agent behavior, commit discipline, session management, verification standards, and task
execution protocols. Project-specific content (quality gate commands, testing requirements, architecture
rules) belongs in DEVELOPMENT-RULES and project strategies.

**Relationship to DEVELOPMENT-RULES:** DEVELOPMENT-RULES is the project's constitutional document —
it references this strategy for methodology and adds project-specific configuration (quality gate
commands, testing requirements, architecture subsections). This strategy is the authoritative source
for *how to work*; DEVELOPMENT-RULES is the authoritative source for *what standards apply to this
project*.

---

## Contents

- [Commit Standards](#commit-standards) — control, message format, atomicity
- [Quality Gate Failure Protocol](#quality-gate-failure-protocol) — handling failures
- [Leave It Cleaner Protocol](#leave-it-cleaner-pre-existing-issue-protocol) — pre-existing issues
- [Session Documentation Control](#session-documentation-control) — CURRENT-SESSION.md protocol
- [Verification Protocol](#verification-protocol) — verify before assuming
- [Strategy Document Protocol](#strategy-document-protocol) — consulting strategy docs
- [Session Context Management](#session-context-management) — context limits, handoffs
- [Core Document Reference Protocol](#core-document-reference-protocol) — when to re-check docs
- [Task Management Protocol](#task-management-protocol) — one task at a time, granularity
- [Test-First Protocol](#test-first-protocol) — when to write tests first
- [Code Documentation Standards](#code-documentation-standards) — voice, references, boundaries

---

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
the atomic-commit workflow in `system/workflows/arc/supplemental/`.

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
- `Context: tasks-[filename].md (planning)` — task list metadata only
- `Context: tasks-[filename].md (activation)` — backlog to active transition
- `Context: tasks-[filename].md (archival)` — active to archive transition

Without task list:

- `Context: [category] (no associated task list)` — emergent work
- `Context: [category] (atomic / no associated task list)` — small one-off work

Categories: `planning`, `documentation`, `maintenance`, `refactor`.

**Atomicity:** One logical change per commit. When multiple tasks completed between commits, separate
code changes by task; commit shared documentation (task list updates) last.

**Enforcement:** Git hooks validate format automatically. See `system/githooks/README.md` for setup.

---

## Quality Gate Failure Protocol

If quality gates fail after task completion:

1. **Report the failure** with specific details
2. **Identify suspected causes** and investigation areas
3. **Ask for guidance** on whether to fix immediately or defer
4. **Never proceed** to next task until resolved or user approves

---

## Leave It Cleaner: Pre-existing Issue Protocol

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
   - Deferred issues: Create incidental task list in the active work directory
   - Never: Leave issues undocumented or unaddressed

---

## Session Documentation Control

### CURRENT-SESSION.md Update Protocol

- **AI NEVER updates CURRENT-SESSION.md** without explicit user instruction
- CURRENT-SESSION.md is a handoff document only updated at session end when instructed
- AI should report changes and progress, but user decides when/how session docs are updated

---

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
When you mostly understand a request but see ambiguities, edge cases, or design alternatives that
need decisions - ask. Examples: "Should this handle empty states?" "Do we want this cached?" "Which
takes precedence if both conditions are true?" These questions improve outcomes for both code and
documentation work.

**Why this matters:** Made-up content in documentation misleads future work. Assumed behavior in code
wastes debugging time. Verification takes seconds; fixing wrong assumptions takes hours.

---

## Strategy Document Protocol

**Before implementing work in codified domains, consult the relevant strategy document.**

See STRATEGY-INDEX.md for the complete list of available strategies (read every session during
initialization).

**Process:**

1. Identify if your work touches a domain with codified guidance
2. Check STRATEGY-INDEX.md for relevant strategies
3. Read relevant section(s) before implementing
4. Follow documented patterns and token usage

**When uncertain if strategy applies:** Ask. "Does this work touch a domain where we have strategy
guidance?"

**For large multi-topic strategies**: Search for the specific topic rather than reading the entire
document.

**Why this matters:** Strategy docs codify decisions, patterns, and token systems. Following them
ensures consistency and prevents rework when non-standard approaches are caught in review.

---

## Session Context Management

**Principle:** Work quality must never be compromised due to context/resource limitations. Session
handoffs are managed by the user.

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

1. Commit all **complete** work (see atomic-commit workflow for complex scenarios)
2. Leave any **partial** work uncommitted
3. Perform session handoff documenting partial work state

**Backup workflow** (when insufficient resources remain for commits):

- Session handoff captures commit-message-level notes
- Next session executes commits from documented state
- Less ideal but functional fallback

**Why this matters:** Incomplete work done properly with good handoff is better than complete work
done sloppily. Context management is user responsibility - AI focuses on maintaining work quality
standards.

**Agent-specific details:** See agent-specific files (CLAUDE.md, GEMINI.md, etc.) for context window
thresholds and monitoring protocols.

---

## Core Document Reference Protocol

Core documents (QUICK-REFERENCE, DEVELOPMENT-RULES) are read each session but should be re-checked
when triggered.

**QUICK-REFERENCE - Re-check when:**

- Bash command fails with path/environment errors (ENOENT, "no such file or directory", "config not found")
- About to run quality gate commands and uncertain which tool/path to use
- Working directory context feels uncertain or commands aren't working as expected

**DEVELOPMENT-RULES - Re-check when:**

- Uncertainty about quality standards (what's the zero-tolerance policy? which gates are required?)
- Approaching context limits (verify Session Context Management protocol and agent-specific guidance)
- Confusion about verification, strategy, or task management protocols

**Don't re-check for:**

- Operations with dedicated workflow docs (commit operations, session handoffs, etc; workflows are
  authoritative, not DEVELOPMENT-RULES)

**Why this matters:** Session-start reading establishes baseline context. Trigger-based re-checking
ensures accuracy when specific patterns/commands are needed. Active verification beats passive recall,
especially later in long sessions.

---

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

---

## Test-First Protocol

**BEFORE implementing any task, assess test-first requirement:**

**Requires test-first** (write tests BEFORE implementation):

- New data models or schemas
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

**If unsure whether test-first applies, default to test-first.** Writing tests after implementation
is harder and less effective.

**During task list creation:** Ensure test tasks appear BEFORE implementation tasks for test-first
work. This makes the protocol visible during execution.

---

## Code Documentation Standards

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

- **Collaborative voice**: Commits, task lists, and project docs should read naturally from an
  author or team perspective — not as a transcript of the human-AI interaction. Write as the
  work's author would.\
  ❌ "The user approved the approach", "Pending user review", "User requested we defer this"\
  ✅ "Approved after review", "Pending review", "Decided to defer this to next phase"

- **Link style**: Prefer reference-style links for cross-file references. Collect link
  definitions at the end of the file after a `---` separator. The separator doubles as a
  consistent EOF indicator — link definitions are invisible in rendered output, so the
  horizontal rule is the last visible element.

  ```markdown
  See [DEVELOPMENT-RULES][dev-rules] for quality standards and the
  [work organization strategy][work-org] for branching guidance.

  ---

  [dev-rules]: ../../reference/constitution/DEVELOPMENT-RULES.md
  [work-org]: ../../reference/strategies/arc/strategy-work-organization.md
  ```

  **Conventions:**
    - Reference names: lowercase, descriptive, hyphenated (e.g., `[dev-rules]`, `[process-loop]`)
    - One `---` + link block per file, always at the very end
    - Short links (same directory or one level up) may remain inline at author discretion

---

## Relationship to Other Documentation

- **DEVELOPMENT-RULES:** The project's constitutional document. References this strategy for
  methodology; adds project-specific quality gate commands, testing requirements, and architecture
  rules.

- **3_process-task-loop:** Defines the detailed task execution workflow including completion protocol,
  quality gate checkpoints, and deferred review. Operationalizes the Task Management Protocol defined
  here.

- **Quality Gates Strategy:** Defines the tiered quality gate system (Tier 1/2/3). This strategy
  defines the failure protocol; the quality gates strategy defines what to run and when.

- **Work Organization Strategy:** Defines work categories, branch coupling, and directory structure.
  Complements the task management and commit standards defined here.

- **Atomic Commit Workflow:** Detailed procedure for complex commit scenarios. Referenced from
  Commit Standards for multi-session or interleaved work.
