# Workflow: Session Initialization

**Audience:** Agent-executed — your agent follows this at the start of each session.

**Purpose**: Establish complete AI context at session start, ensuring the AI has all necessary environment information,
project context, and behavioral guidance before beginning work.

**When to use**: User-triggered at the start of every session (resuming features, starting new work, handling
incidental tasks, etc.). The agent does not initiate this workflow on its own.

**Session lifecycle assumption**: ARC sessions are bounded — they begin with this initialization workflow and end
with an explicit handoff (see `session-handoff.md`). If an agent's context fills mid-session, the correct response
is to complete the current work item and hand off, not to compact or summarize prior context.

**Design context**: Sessions implement P5 (Context Preservation) — structured document loading for agents with
ephemeral context. Agents with persistent memory may need lighter ceremonies; the principle (work context must
be recoverable) still applies. The session state mechanism is overridable via
[`arc-methods.md` § session-state][arc-methods-session].

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

**Read these documents to establish complete context (general → specific).** The document set below is the
[session-state method][arc-methods-session] default. If your project overrides session-state, follow the
override instead.

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
   - **Domain rule files**: Scan `constitution/` for additional `DEV-RULES.*.md` files (e.g.,
     `DEV-RULES.FRONTEND.md`). Note their domains — load on-demand when a task touches the
     relevant domain, not at init time.

5. `.arc/reference/strategies/STRATEGY-INDEX.md` - **MUST READ IN FULL**
   - Index of codified strategy guidance; establishes what domain-specific patterns exist

6. `.arc/reference/QUICK-REFERENCE.md` - **MUST READ IN FULL**
   - Environment context, command patterns, and quality gate commands

**Active work context:**

7. `.arc/active/WORK-STATUS.md` - **MUST READ IN FULL**
   - Project state: branch, task list path, next task, blockers, and next action
   - **"No active work" detection**: If Task List shows `[none]`, there is no active work unit.
     Skip step 9 (task list loading). Session orientation will report this state and surface
     the Next Action from WORK-STATUS.md (typically: create a PRD or plan new work).
   - **Task reference format**: Next Task uses triple-anchor format —
     `Task 5.5 — Implement validation (line ~1903)`: task number, title, approximate line.
     All three anchors should be present; any two are sufficient for reliable lookup.

8. `.arc/user/{identity}/SESSION-NOTES.md` - **READ IF EXISTS** (gitignored — may not be present)
   - Path: `.arc/user/{identity}/SESSION-NOTES.md` where `{identity}` is resolved from
     `git config arc.identity` (or slugified `git config user.name` as fallback)
   - Personal working context from prior session: approach, decisions, things tried, known risks
   - **Persistent context**: The `## Persistent Context` section carries entries that survive across
     handoffs (each with an explicit removal trigger). Treat these as active constraints for this session.
   - **If file doesn't exist or is stale**: Try restoring from git notes — run `arc user load` (or
     check `refs/notes/arc/user/{identity}` on HEAD, walking ancestors if needed). If no notes
     exist either, skip — the session starts with tracked state only (WORK-STATUS.md).
   - **Agent-switching note**: If SESSION-NOTES.md was written during a session with a different agent, extract factual
     content (decisions, file references, blockers) and disregard agent-specific references (tool syntax,
     capability assumptions)

> **Person-to-person handoff:** If bootstrapping from another developer's handoff, fetch their
> git notes namespace (`refs/notes/arc/user/{their-identity}`) and apply the agent-switching
> filter to their SESSION-NOTES.md content. See [Team Coordination Strategy][team-coordination]
> § Person-to-Person Task Handoff for the full incoming bootstrap protocol.

9. **Active task list** - **STRATEGIC PARTIAL READ** (often 500+ lines)

   **Skip if**: WORK-STATUS.md shows `Task List: [none]` — no task list to load.

- Path referenced in WORK-STATUS.md
- Example: `.arc/active/feature/tasks-[work-unit-name].md`
- **Reading strategy**:
    - **ALWAYS read**: Overview section + current phase summary (first ~100 lines)
    - **ALWAYS read**: Current task section identified in WORK-STATUS.md (the specific task being worked on)
        - **Graduated lookup** using the triple-anchor reference from WORK-STATUS.md:
          1. Jump to line hint (`line ~N`) — if task number matches at that location, done
          2. Search for task number (e.g., `**4.2`) if line hint is stale
          3. Search for title fragment if task was renumbered
        - If none of the anchors resolve, report the mismatch (Step 6)
    - **Read on-demand**: Other phases and tasks as needed during work
- **Why partial read OK**: This is the ONLY exception - it's reference material, often 500+ lines, and too
     large to internalize upfront. But you MUST read the overview + current task context.
- **What to extract**: Current phase, task details, acceptance criteria

### 3. Post-Context-Load Extensions · `#post-context-load`

If the `post-context-load` section in [`arc-extensions.md`][arc-ext-post-context-load] has steps
(not the default placeholder), follow those steps now. Use for team-specific documents, external
tool state, or environment checks before orientation.

See: [`arc-extensions.md` § post-context-load][arc-ext-post-context-load]

### 4. Check Active Configuration

Read `arc-config.yml` and scan `arc-methods.md` for active overrides. This is a read-and-note step — carry
the awareness through the session and apply it when encountering method references or platform-specific
operations.

1. **Config values**: Read `.arc/system/arc-config.yml`. Note any settings that differ from defaults
   (defaults are documented as inline comments in the file)
2. **Method overrides**: Scan `.arc/system/workflows/arc-methods.md`. For each method, check if the
   `.override` section is populated — if so, follow the override instead of the default when that
   method is encountered in workflows
3. **Platform awareness**: If `platform.type` differs from `github`, reference QUICK-REFERENCE for
   platform-appropriate commands
4. **Custom commit patterns**: If `commit.format: custom` or `commit.context_footer: custom`, note the
   active patterns from `commit.custom_pattern` / `commit.context_pattern`

Include non-default configuration in the orientation summary only when present. Default configuration
needs no mention — the agent already follows default conventions from loaded documents.

### 5. Confirm Orientation

**Freshness check** (run before producing orientation — informational, not blocking):

Assess how current the session documents are. This feeds confidence into mismatch
recovery (Step 6).

- **SESSION-NOTES.md**: If it has a `Commit at Handoff` field, compare that hash against
  current HEAD. Report the gap count if commits have landed since handoff (e.g.,
  "SESSION-NOTES written at abc1234, 3 commits behind HEAD").
- **WORK-STATUS.md**: Run `git log -1 --format=%h -- {{WORK-STATUS-path}}` and compare
  against HEAD. Report if WORK-STATUS.md hasn't been updated across recent commits.

Include freshness gaps in the orientation summary only when detected. A gap doesn't mean
state is wrong — it means verify more carefully before trusting session documents.

Confirm successful initialization. Use this structure:

**ARC session initialized** · `{branch-name}` · {clean | uncommitted changes}

**Active work state:**

- **Last completed**: What was finished and its current state (committed, uncommitted, etc.)
- **Next task**: Task to work on per WORK-STATUS.md (or "none" when no task list / all tasks complete)
- **Blockers**: Any blockers or mismatches detected during initialization, or "none"

**Next action:** What comes next per WORK-STATUS.md

Awaiting direction — proceed to Next Action?

**"No active work" variant:** When WORK-STATUS.md shows `Task List: [none]`, there is no active
work unit. Use the same format — Next task is "none", Next action comes from WORK-STATUS.md.
This is the normal state after initialization or between work units.

**Next work unit discovery:** When no active work exists, assess readiness for the next work
unit before producing the orientation summary. The discovery process depends on your PM mode
([`arc-config.yml`][arc-config] → `pm.mode`):

**`pm.mode: arc-in-git`:**

1. Read ROADMAP.md — identify the next queued or suggested item
2. Check the backlog directory for existing artifacts matching that item (PRDs, `plan-*` docs)
3. Check `user/{identity}/ATOMIC-INBOX.md` — if it exists with items, report the count in the
   orientation summary (e.g., "3 inbox items pending triage")
4. Report what exists and its readiness state in the orientation summary
5. Propose next steps based on what was found — ask for confirmation before proceeding

Planning readiness varies: a completed PRD may be ready for task generation, a draft PRD may
need refinement, a `plan-*` doc may need development before a PRD can be created, a roadmap
entry may have no artifacts yet, or there may be no roadmap entry at all. The agent discovers
and reports — the user decides how to proceed.

**`pm.mode: none` or `external`:**

1. Check `active/` for any existing planning artifacts (PRDs, `plan-*` docs, task lists)
2. If artifacts exist, report their readiness state (draft PRD → needs refinement; complete
   PRD → ready for task generation; task list present → ready for activation) and propose
   next steps
3. If no artifacts exist, the next action is to create a PRD when ready →
   [1_create-prd.md][create-prd]

> **Full protection (`branch.protection: full`):** Planning work requires a branch. When the
> user confirms next steps, run [activate-planning-branch][activate-planning-branch] before
> creating plan documents or PRDs. Under partial protection (the default), proceed directly
> to [1_create-prd.md][create-prd] — no planning branch needed.

**Formatting guidance:**

- The header line confirms: protocol ran, active branch, and tree status — at a glance
- **Next action** is standalone and prominent — it's the user's primary scanning target
- Environment details (working directory, runtime, documents loaded) are implicit in a
  successful initialization. Only surface environment information when something is wrong
  (missing tools, failed verification, documents that couldn't be loaded)

### 6. If Context Seems Mismatched

If documented state doesn't match reality during initialization, use the trust hierarchy to
determine the correct response.

**Trust hierarchy** (highest to lowest):

1. **Git state** — `git status`, `git log`, file contents on disk
2. **Task list** — checkbox state, task descriptions
3. **WORK-STATUS.md** — tracked project pointer
4. **SESSION-NOTES.md** — personal session context (gitignored, most volatile)

**Tier 1 — Auto-recover with notice:**

When higher-trust sources agree and a lower-trust source is the outlier, proceed with the
ground truth and report the discrepancy in the orientation summary.

Report format: "WORK-STATUS said X. Git/task list show Y. Proceeding with Y."

Examples:

- WORK-STATUS says "Task 3.3 in progress" but task list shows 3.3 marked `[x]` and git log
  confirms the commit → proceed with Task 3.4 as current
- SESSION-NOTES describes uncommitted work but `git status` is clean and git log shows
  the work committed → proceed with committed state
- WORK-STATUS says "Last Completed: Task 3.2" but task list shows 3.3 also marked `[x]` →
  proceed with 3.3 as last completed

**Tier 2 — Stop and ask:**

When the mismatch is ambiguous — multiple plausible explanations, or sources at the same
trust tier disagree with each other.

1. **Stop immediately** — do not proceed with work
2. **Report the mismatch** with specific details from each source
3. **Ask for guidance** on how to resolve the discrepancy
4. **Wait for explicit direction** before taking any corrective action

Examples:

- Git shows uncommitted changes to files not mentioned in any session doc — could be
  co-development work, a partial task, or an interrupted session
- WORK-STATUS references a task that doesn't exist in the task list — task may have been
  renumbered, removed, or WORK-STATUS points to wrong task list
- Task list shows Task 3.3 incomplete but git log has a commit referencing Task 3.3 —
  conflicting signals at the same trust tier

[activate-planning-branch]: ../work-unit-lifecycle/planning/activate-planning-branch.md
[create-prd]: ../1_create-prd.md
[arc-config]: ../../../arc-config.yml
[arc-methods-session]: ../../arc-methods.md#session-state
[arc-ext-post-context-load]: ../../arc-extensions.md#post-context-load
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
