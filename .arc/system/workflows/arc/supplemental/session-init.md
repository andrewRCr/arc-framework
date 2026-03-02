# Workflow: Session Initialization

**Audience:** Agent-executed — your agent follows this at the start of each session.

**Purpose**: Establish complete AI context at session start, ensuring the AI has all necessary environment information,
project context, and behavioral guidance before beginning work.

**When to use**: User-triggered at the start of every session (resuming features, starting new work, handling
incidental tasks, etc.). The agent does not initiate this workflow on its own.

**Session lifecycle assumption**: ARC sessions are bounded — they begin with this initialization workflow and end
with an explicit handoff (see `session-handoff.md`). If an agent's context fills mid-session, the correct response
is to complete the current work item and hand off, not to compact or summarize prior context.

**Design context**: Sessions implement P5 (Context Preservation) — the principle that work context must be
recoverable across work boundaries. This workflow is the *mechanism*: structured document loading optimized for
agents with ephemeral context (CLI and IDE conversational agents that start each session without memory of
previous work). Agents with persistent memory or project-indexed context may need lighter initialization
ceremonies; the principle still applies regardless of mechanism. The session state mechanism (what to read at
init, what to write at handoff) is overridable via [`arc-methods.md` § session-state][arc-methods-session].

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

1. `.arc/system/agent/AGENTS.md` - **MUST READ IN FULL**
   - Project overview, technology stack, and AI collaboration principles

2. **Agent-specific file** - **MUST READ IN FULL** (if one exists)
   - Path: `.arc/system/agent/[AGENT].md` (e.g., CLAUDE.md, GEMINI.md, CODEX.md)
   - Agent-specific operational guidance (context window thresholds, capabilities, deferred review notes)
   - **If no agent-specific file exists**: Skip — the framework is agent-agnostic by default

**Constitutional and process context:**

3. `.arc/reference/constitution/DEV-RULES.ARC.md` - **MUST READ IN FULL**
   - Framework development methodology: commit standards, verification, session/task management

4. `.arc/reference/constitution/DEV-RULES.PROJECT.md` - **MUST READ IN FULL**
   - Project quality gates, testing requirements, code quality, and architecture rules

5. `.arc/reference/strategies/STRATEGY-INDEX.md` - **MUST READ IN FULL**
   - Index of codified strategy guidance; establishes what domain-specific patterns exist

6. `.arc/reference/QUICK-REFERENCE.md` - **MUST READ IN FULL**
   - Environment context, command patterns, and quality gate commands

**Active work context:**

7. `.arc/active/WORK-STATUS.md` - **MUST READ IN FULL**
   - Project state: branch, task list path, current task, blockers, and next action
   - **VERIFY**: If following task list, "Current Task" field must include line number (e.g., "Task 5.5 (line 1903)")
   - **If missing line number**: Stop and ask user to provide it before proceeding

8. `.arc/active/SESSION.md` - **READ IF EXISTS** (gitignored — may not be present)
   - Personal working context from prior session: approach, decisions, things tried, known risks
   - If this file doesn't exist, skip — the session starts with tracked state only (WORK-STATUS.md)
   - **Agent-switching note**: If SESSION.md was written during a session with a different agent, extract factual
     content (decisions, file references, blockers) and disregard agent-specific references (tool syntax,
     capability assumptions)

9. **Active task list** - **STRATEGIC PARTIAL READ** (often 500+ lines)

- Path referenced in WORK-STATUS.md
- Example: `.arc/active/feature/tasks-[work-unit-name].md`
- **Reading strategy**:
    - **ALWAYS read**: Overview section + current phase summary (first ~100 lines)
    - **ALWAYS read**: Current task section identified in WORK-STATUS.md (the specific task being worked on)
        - **Use line number**: WORK-STATUS "Current Task" field includes line number (e.g., "Task 5.5 (line 1903)")
        - **Direct jump**: Use Read tool with offset parameter to jump directly to that task
        - **No scanning needed**: Line number enables precise navigation
    - **Read on-demand**: Other phases and tasks as needed during work
- **Why partial read OK**: This is the ONLY exception - it's reference material, often 500+ lines, and too
     large to internalize upfront. But you MUST read the overview + current task context.
- **What to extract**: Current phase, task details, acceptance criteria

### 3. Confirm Orientation

Confirm successful initialization. Use this structure:

**ARC session initialized** · `{branch-name}` · {clean | uncommitted changes}

**Active work state:**

- **Last completed**: What was finished and its current state (committed, uncommitted, etc.)
- **Current task**: Task being worked on per WORK-STATUS.md
- **Blockers**: Any blockers or mismatches detected during initialization, or "none"

**Next action:** What comes next per WORK-STATUS.md

Awaiting direction — proceed to Next Action?

**Formatting guidance:**

- The header line confirms: protocol ran, active branch, and tree status — at a glance
- **Next action** is standalone and prominent — it's the user's primary scanning target
- Environment details (working directory, runtime, documents loaded) are implicit in a
  successful initialization. Only surface environment information when something is wrong
  (missing tools, failed verification, documents that couldn't be loaded)

### 4. If Context Seems Mismatched

If documented state (WORK-STATUS.md) doesn't match reality (git status, task list checkboxes, file state):

1. **Stop immediately** - do not proceed with work
2. **Report the mismatch** to user with specific details
3. **Ask for guidance** on how to resolve the discrepancy
4. **Wait for explicit direction** before taking any corrective action

**Examples of mismatches:**

- WORK-STATUS says "uncommitted files" but `git status` shows clean tree
- WORK-STATUS references "Task 3.3" but task list shows it's already marked `[x]` complete
- WORK-STATUS describes work in progress but git log shows it's been committed

**Do not attempt to "fix" state on your own** - always involve the user when state is unclear.

[arc-methods-session]: ../../arc-methods.md#session-state
