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
# Or: relevant subdirectories if working in specific context
```

**Verify runtime status:**

```bash
# Project-specific verification (examples)
# Docker: docker ps | grep {{PROJECT_NAME}} | wc -l
# Venv: ls {{VENV_PATH}}/bin/ | grep -E "(ruff|pytest)" | wc -l
# Services: Check project-specific services are running
```

### 2. Load AI Context (read in order)

**CRITICAL PRINCIPLE**: All documents are maintained to be lean, non-overlapping, and essential. Read everything
in full EXCEPT the active task list (which is reference material). These docs are kept minimal by design - there's
more value in having complete context upfront than discovering missing rules mid-session.

**Read these documents to establish complete context:**

1. `.arc/reference/agent/AGENTS.md` - **MUST READ IN FULL**
   - Project overview and technology stack
   - Quick lookup guide for finding information
   - AI collaboration principles
   - **Why full read needed**: Short, maintained to be lean, provides essential project context

2. `.arc/active/CURRENT-SESSION.md` - **MUST READ IN FULL**
   - Session Startup Protocol (environment expectations: working directory, Docker, venv, paths)
   - Session Information (branch, task list, current task with line number, next action)
   - Last completed work and blockers
   - Session Context (detailed implementation notes)
   - **Why full read needed**: Critical for understanding current state, recent work, and avoiding conflicts
   - **VERIFY**: If following task list, "Current Task" field must include line number (e.g., "Task 5.5 (line 1903)")
   - **If missing line number**: Stop and ask user to provide it before proceeding

3. **Active task list** - **STRATEGIC PARTIAL READ** (often 500+ lines)
   - Path referenced in CURRENT-SESSION.md
   - Example: `.arc/active/feature/tasks-api-layer-modernization-p2.md`
   - **Reading strategy**:
     - **ALWAYS read**: Overview section + current phase summary (first ~100 lines)
     - **ALWAYS read**: Current task section identified in CURRENT-SESSION.md (the specific task being worked on)
       - **Use line number**: CURRENT-SESSION "Current Task" field includes line number (e.g., "Task 5.5 (line 1903)")
       - **Direct jump**: Use Read tool with offset parameter to jump directly to that task
       - **No scanning needed**: Line number enables precise navigation
     - **Read on-demand**: Other phases and tasks as needed during work
   - **Why partial read OK**: This is the ONLY exception - it's reference material, often 500+ lines, and too
     large to internalize upfront. But you MUST read the overview + current task context.
   - **What to extract**: Current phase, task details, acceptance criteria, implementation notes

4. `.arc/reference/workflows/3_process-task-loop.md` - **MUST READ IN FULL**
   - One-subtask-at-a-time workflow
   - Task execution protocol
   - Quality gate requirements per subtask
   - Documentation update protocol
   - **Why full read needed**: Defines workflow that governs ALL task execution - can't avoid violations if rules unknown

5. `.arc/reference/strategies/STRATEGY-INDEX.md` - **MUST READ IN FULL**
   - Index of available strategy documents by domain
   - Quick reference for where codified guidance exists
   - Protocol for checking strategies before implementation
   - **Why full read needed**: Establishes what guidance exists before reading rules about using it

6. `.arc/reference/constitution/DEVELOPMENT-RULES.md` - **MUST READ IN FULL**
   - Quality gate requirements (zero tolerance policies)
   - Commit standards and protocols
   - AI collaboration rules (CURRENT-SESSION control, manual commit control)
   - Verification Protocol (never assume, always verify)
   - Strategy Document Protocol (consult guidance before implementing)
   - Leave It Cleaner protocol
   - Test-first protocol
   - **Why full read needed**: Behavioral constraints - can't avoid violating rules you haven't read

7. `.arc/reference/QUICK-REFERENCE.md` - **MUST READ IN FULL**
   - Environment-specific command patterns
   - Quality gate commands
   - Path context and common workflows
   - **Why full read needed**: Incorrect command patterns = broken operations, wrong paths = failures

8. **Agent-specific file** - **MUST READ IN FULL**
   - Path: `.arc/reference/agent/[AGENT].md` (e.g., CLAUDE.md, GEMINI.md, etc.)
   - Agent-specific operational guidance (context window management, capabilities, limitations)
   - Contains details extracted from shared docs to maintain agent-agnostic framework
   - **Why full read needed**: Agent-specific thresholds, protocols, and optimizations vary significantly
   - **If no agent-specific file exists**: Skip this step (framework is agent-agnostic by default)

**Rationale**: These docs are actively maintained to stay lean and avoid overlap. Reading all of them upfront
(except task list details) ensures complete context without wasted effort. The task list is the only document
large enough to warrant partial reading - but you must still read the overview and current task sections.

### 3. Acknowledge Orientation

State your understanding to confirm successful initialization:

- **Working directory**: Repository root (`{{REPO_ROOT}}/`)
- **Runtime status**: Project-specific services running (per QUICK-REFERENCE.md)
- **Tool availability**: Required tools available (per QUICK-REFERENCE.md)
- **Quality policy**: Zero-tolerance for linting violations, 100% test pass rate
- **Reference versions**: DEVELOPMENT-RULES v2.15 (hash: r8n4q1x3), QUICK-REFERENCE v1.1
- **Documents read in full**: Confirm that AGENTS, CURRENT-SESSION, 3-process-task-loop, STRATEGY-INDEX,
  DEVELOPMENT-RULES, QUICK-REFERENCE, and agent-specific file were read completely (not skimmed)
- **Task list context loaded**: Confirm that task list overview + current task section were read (from CURRENT-SESSION)

### 4. Ready to Proceed

With context loaded:

1. Review next action from CURRENT-SESSION.md
2. Check for blockers that need resolution
3. Await user instruction - do not start work until user provides direction

### 5. If Context Seems Mismatched

If documented state (CURRENT-SESSION.md) doesn't match reality (git status, task list checkboxes, file state):

1. **Stop immediately** - do not proceed with work
2. **Report the mismatch** to user with specific details
3. **Ask for guidance** on how to resolve the discrepancy
4. **Wait for explicit direction** before taking any corrective action

**Examples of mismatches:**

- CURRENT-SESSION says "uncommitted files" but `git status` shows clean tree
- CURRENT-SESSION references "Task 3.3" but task list shows it's already marked `[x]` complete
- CURRENT-SESSION describes work in progress but git log shows it's been committed

**Do not attempt to "fix" state on your own** - always involve the user when state is unclear.

---

**Version**: 2025-11-11 (Added Current Task line number verification. Added context mismatch guidance. Streamlined
CURRENT-SESSION references to focus on state not procedure.)
