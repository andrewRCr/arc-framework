# Workflow: Session Initialization (Framework Development)

**Purpose**: Establish complete AI context at session start for ARC framework development work.

**When to use**: Every framework development session (documentation improvements, CineXplorer syncs, workflow
enhancements, etc.)

## Steps

### 1. Verify Environment

**Check working directory:**

```bash
pwd
# Expected: /home/andrew/dev/arc-agentic-dev-framework
```

**Verify runtime environment status:**

```bash
# This is a documentation-only framework (no runtime containers)
# Verification: N/A
```

**Confirm tool availability:**

```bash
# Markdown linting is the primary quality gate tool
npx --yes markdownlint-cli --version
# Expected: markdownlint-cli available
```

### 2. Load AI Context (read in order)

**CRITICAL PRINCIPLE**: All documents are maintained to be lean, non-overlapping, and essential. Read everything
in full EXCEPT the active task list (which is reference material). These docs are kept minimal by design - there's
more value in having complete context upfront than discovering missing rules mid-session.

**Read these documents to establish complete context:**

1. `.arc-internal/reference/agent/AGENTS.md` - **MUST READ IN FULL**
   - Framework overview (documentation-only, template system)
   - Quick lookup guide (workflows, constitution docs)
   - AI collaboration principles
   - **Why full read needed**: Short, maintained to be lean, provides essential project context

2. `.arc-internal/active/CURRENT-SESSION.md` - **MUST READ IN FULL**
   - Session Startup Protocol (working directory context)
   - Session Information (branch, work type, task reference)
   - Last completed work and next action
   - Blockers and Outstanding Questions
   - Session Context (detailed work notes)
   - **Why full read needed**: Critical for understanding current state, recent work, and avoiding conflicts

3. **Active task list** - **STRATEGIC PARTIAL READ** (often 500+ lines)
   - Path referenced in CURRENT-SESSION.md
   - Example: `.arc-internal/active/feature/tasks-enhance-docs-content-p1.md`
   - **Reading strategy**:
     - **ALWAYS read**: Overview section + current phase summary (first ~100 lines)
     - **ALWAYS read**: Current task section identified in CURRENT-SESSION.md (the specific task being worked on)
     - **Read on-demand**: Other phases and tasks as needed during work
   - **Why partial read OK**: This is the ONLY exception - it's reference material, often 500+ lines, and too
     large to internalize upfront. But you MUST read the overview + current task context.
   - **What to extract**: Current phase, next task, overall completion status, key patterns, current task details

4. `.arc/reference/workflows/3_process-task-loop.md` - **MUST READ IN FULL**
   - One-subtask-at-a-time workflow
   - Task execution protocol
   - Quality gate requirements per subtask
   - Documentation update protocol
   - **Why full read needed**: Defines workflow that governs ALL task execution - can't avoid violations if rules unknown

5. `.arc-internal/reference/constitution/DEVELOPMENT-RULES.md` - **MUST READ IN FULL**
   - Quality gate requirements (markdown linting zero-tolerance)
   - Commit standards and protocols
   - AI collaboration rules
   - Template-first approach and framework-specific rules
   - **Why full read needed**: Behavioral constraints - can't avoid violating rules you haven't read

6. `.arc-internal/reference/QUICK-REFERENCE.md` - **MUST READ IN FULL**
   - Framework-specific command patterns
   - Path context (template vs. internal directories)
   - Quality gate commands and anti-patterns
   - **Why full read needed**: Incorrect command patterns = broken operations, wrong paths = failures

**Rationale**: These docs are actively maintained to stay lean and avoid overlap. Reading all of them upfront
(except task list details) ensures complete context without wasted effort. The task list is the only document
large enough to warrant partial reading - but you must still read the overview and current task sections.

### 3. Acknowledge Orientation

State your understanding to confirm successful initialization:

- **Working directory**: Repository root (`/home/andrew/dev/arc-agentic-dev-framework/`)
- **Runtime status**: Documentation-only framework (no runtime)
- **Tool availability**: Markdown linting available via npx
- **Quality policy**: Zero-tolerance quality policy for documentation
- **Reference versions**: DEVELOPMENT-RULES v0.2.0-dev (hash: 4b3d89f2), QUICK-REFERENCE v0.2.0-dev
- **Documents read in full**: Confirm that AGENTS, CURRENT-SESSION, DEVELOPMENT-RULES, 3-process-task-loop, and
  QUICK-REFERENCE were read completely (not skimmed)
- **Task list context loaded**: Confirm that task list overview + current task section were read (from CURRENT-SESSION)

### 4. Ready to Proceed

With context loaded:

1. Review next action from CURRENT-SESSION.md
2. Check for blockers that need resolution
3. Await user instruction - do not start work until user provides direction

---

**Version**: 2025-10-24 (Framework-internal version - Refined reading strategy: ALL docs read in full except
task list; task list requires overview + current task section + on-demand details.)
