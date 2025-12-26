# Workflow: Session Initialization

**Purpose**: Establish complete AI context at session start, ensuring the AI has all necessary environment information,
project context, and behavioral guidance before beginning work.

**When to use**: Every session start (resuming features, starting new work, handling incidental tasks, etc.)

## Steps

### 1. Verify Environment

**Check working directory:**

```bash
pwd
# Expected: {{REPO_ROOT}} (repo root)
# Or: subdirectories if working in specific context
```

**Verify runtime environment status:**

```bash
# Example: Check Docker containers (if using Docker)
docker ps | grep {{PROJECT_CONTAINER_PREFIX}} | wc -l
# Expected: {{EXPECTED_CONTAINER_COUNT}} (adjust for your project)

# Example: Verify venv availability (if using Python venv)
ls {{VENV_PATH}}/bin/ | grep -E "({{LINTER}}|{{TEST_RUNNER}})" | wc -l
# Expected: 2+ (linter and test runner at minimum)
```

**Confirm tool availability:**

```bash
# Verify key development tools are available
# Examples: linters, type checkers, test runners
```

### 2. Load AI Context (read in order)

**CRITICAL PRINCIPLE**: All documents are maintained to be lean, non-overlapping, and essential. Read everything
in full EXCEPT the active task list (which is reference material). These docs are kept minimal by design - there's
more value in having complete context upfront than discovering missing rules mid-session.

**Read these documents to establish complete context:**

1. `.arc/reference/ai-instructions/AGENTS.md` - **MUST READ IN FULL**
   - Project overview and technology stack
   - Quick lookup guide for finding information
   - AI collaboration principles
   - **Why full read needed**: Short, maintained to be lean, provides essential project context

2. `.arc/active/CURRENT-SESSION.md` - **MUST READ IN FULL**
   - Session Startup Protocol (working directory, runtime status, path context)
   - Session Information (branch, feature docs, work type)
   - Last completed work and next action
   - Blockers and Outstanding Questions
   - Session Context (detailed implementation notes)
   - **Why full read needed**: Critical for understanding current state, recent work, and avoiding conflicts

3. **Active task list** - **STRATEGIC PARTIAL READ** (often 500+ lines)
   - Path referenced in CURRENT-SESSION.md
   - Example: `.arc/active/feature/tasks-{{FEATURE_NAME}}.md`
   - **Reading strategy**:
     - **ALWAYS read**: Overview section + current phase summary (first ~100 lines)
     - **ALWAYS read**: Current task section identified in CURRENT-SESSION.md (the specific task being worked on)
     - **Read on-demand**: Other phases and tasks as needed during work
   - **Why partial read OK**: This is the ONLY exception - it's reference material, often 500+ lines, and too
     large to internalize upfront. But you MUST read the overview + current task context.
   - **What to extract**: Current phase, next task, overall completion status, key patterns, current task details

4. `.arc/reference/workflows/3-process-task-loop.md` - **MUST READ IN FULL**
   - One-subtask-at-a-time workflow
   - Task execution protocol
   - Quality gate requirements per subtask
   - Documentation update protocol
   - **Why full read needed**: Defines workflow that governs ALL task execution - can't avoid violations if rules unknown

5. `.arc/reference/constitution/DEVELOPMENT-RULES.md` - **MUST READ IN FULL**
   - Quality gate requirements (zero tolerance policies)
   - Commit standards and protocols
   - AI collaboration rules (CURRENT-SESSION control, manual commit control)
   - Leave It Cleaner protocol
   - Test-first protocol
   - **Why full read needed**: Behavioral constraints - can't avoid violating rules you haven't read

6. `.arc/reference/QUICK-REFERENCE.md` - **MUST READ IN FULL**
   - Environment-specific command patterns
   - Quality gate commands
   - Path context and common workflows
   - **Why full read needed**: Incorrect command patterns = broken operations, wrong paths = failures

**Rationale**: These docs are actively maintained to stay lean and avoid overlap. Reading all of them upfront
(except task list details) ensures complete context without wasted effort. The task list is the only document
large enough to warrant partial reading - but you must still read the overview and current task sections.

### 3. Acknowledge Orientation

State your understanding to confirm successful initialization:

- **Working directory**: Repository root (`{{REPO_ROOT}}`)
- **Runtime status**: {{RUNTIME_STATUS}} (e.g., Docker containers running, services available)
- **Tool availability**: {{TOOL_AVAILABILITY}} (e.g., venv tools available, linters accessible)
- **Quality policy**: Zero-tolerance for linting violations, 100% test pass rate
- **Reference versions**: DEVELOPMENT-RULES v{{VERSION}} (hash: {{HASH}}), QUICK-REFERENCE v{{VERSION}}
- **Documents read in full**: Confirm that AGENTS, CURRENT-SESSION, DEVELOPMENT-RULES, 3-process-task-loop, and
  QUICK-REFERENCE were read completely (not skimmed)
- **Task list context loaded**: Confirm that task list overview + current task section were read (from CURRENT-SESSION)

### 4. Ready to Proceed

With context loaded:

1. Review next action from CURRENT-SESSION.md
2. Check for blockers that need resolution
3. Await user instruction - do not start work until user provides direction

---

**Version**: 2025-10-20.2 (Refined reading strategy: ALL docs read in full except task list; task list requires
overview + current task section + on-demand details. Emphasizes docs are maintained lean by design.)
