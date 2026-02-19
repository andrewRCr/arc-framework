# Workflow: Session Initialization

**Audience:** Agent-executed — your agent follows this at the start of each session.

**Purpose**: Establish complete AI context at session start, ensuring the AI has all necessary environment information,
project context, and behavioral guidance before beginning work.

**When to use**: User-triggered at the start of every session (resuming features, starting new work, handling
incidental tasks, etc.). The agent does not initiate this workflow on its own.

**Session lifecycle assumption**: ARC sessions are bounded — they begin with this initialization workflow and end
with an explicit handoff (see `session-handoff.md`). If an agent's context fills mid-session, the correct response
is to complete the current work item and hand off, not to compact or summarize prior context.

## Steps

### 1. Verify Environment

**Check working directory:**

```bash
pwd
# Expected: {{REPO_ROOT}} (repo root)
# Or: relevant subdirectories if working in specific context
```

**Verify runtime status (if applicable):**

```bash
# Check whatever your project requires before work can begin (examples):
# Build tools: Verify compiler, bundler, or linter is available
# Services: Confirm databases, containers, or dev servers are running
# Environments: Confirm expected tools are on PATH
# Some projects (documentation-only, config repos) may need nothing beyond git
```

### 2. Load AI Context (read in order)

**CRITICAL PRINCIPLE**: All documents are maintained to be lean, non-overlapping, and essential. Read everything
in full EXCEPT the active task list (which is reference material). These docs are kept minimal by design - there's
more value in having complete context upfront than discovering missing rules mid-session.

**Read these documents to establish complete context (general → specific):**

**Project identity and agent context:**

1. `.arc/reference/agent/AGENTS.md` - **MUST READ IN FULL**
   - Project overview, technology stack, and AI collaboration principles

2. **Agent-specific file** - **MUST READ IN FULL** (if one exists)
   - Path: `.arc/reference/agent/[AGENT].md` (e.g., CLAUDE.md, GEMINI.md, etc.)
   - Agent-specific operational guidance (context window thresholds, capabilities, deferred review notes)
   - **If no agent-specific file exists**: Skip — the framework is agent-agnostic by default

**Constitutional and process context:**

3. `.arc/reference/constitution/DEVELOPMENT-RULES.md` - **MUST READ IN FULL**
   - Quality gates, commit standards, verification protocol, and all behavioral constraints

4. `.arc/reference/strategies/STRATEGY-INDEX.md` - **MUST READ IN FULL**
   - Index of codified strategy guidance; establishes what domain-specific patterns exist

5. `.arc/reference/QUICK-REFERENCE.md` - **MUST READ IN FULL**
   - Environment context, command patterns, and quality gate commands

6. `.arc/reference/workflows/3_process-task-loop.md` - **MUST READ IN FULL**
   - Task execution protocol, quality gates, and documentation update requirements

**Active work context:**

7. `.arc/active/CURRENT-SESSION.md` - **MUST READ IN FULL**
   - Current state: branch, task context, last completed work, blockers, and implementation notes
   - **VERIFY**: If following task list, "Current Task" field must include line number (e.g., "Task 5.5 (line 1903)")
   - **If missing line number**: Stop and ask user to provide it before proceeding

8. **Active task list** - **STRATEGIC PARTIAL READ** (often 500+ lines)
   - Path referenced in CURRENT-SESSION.md
   - Example: `.arc/active/feature/tasks-[work-unit-name].md`
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

### 3. Confirm Orientation

Confirm successful initialization with a brief structured summary:

**Environment and context:**

- Working directory, runtime status, and quality policy (per QUICK-REFERENCE.md)
- Documents read in full; task list overview + current task loaded

**Active work understanding:**

- **Current branch and task**: From CURRENT-SESSION.md
- **Last completed**: What was finished and its current state (committed, uncommitted, etc.)
- **Next action**: What comes next per CURRENT-SESSION.md
- **Blockers**: Any blockers or mismatches detected during initialization

Then await user direction — do not start work until the user provides it.

### 4. If Context Seems Mismatched

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
