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
# Expected: <your-repo-root>
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

### 2. Load AI Context

**CRITICAL PRINCIPLE**: All documents are maintained to be lean, non-overlapping, and essential. Read everything
in full EXCEPT the active task list (item 10 — reference material, often 500+ lines). These docs are kept
minimal by design — there's more value in having complete context upfront than discovering missing rules
mid-session.

**Execution strategy:** Items 1–8, identity resolution, and configuration reads (Step 4) are independent —
batch them into a single parallel read. SESSION-NOTES (needs identity), the task list (needs WORK-STATUS
path), and conditionally the task execution workflow (item 11, needs WORK-STATUS) form a second batch after
the first completes. Within batches, `.ARC` files are listed before their `.PROJECT` counterparts for
comprehension order. Sequential execution (follow item numbers) is fine if your platform doesn't support
parallel reads.

The document set below is the [session-state method][arc-methods-session] default. If your project overrides
session-state, follow the override instead.

**Project identity and agent context:**

1. `.arc/system/agent/AGENT-BRIEFING.ARC.md` - **MUST READ IN FULL**
   - ARC framework orientation — methodology, key documents, directory structure

2. `.arc/system/agent/AGENT-BRIEFING.PROJECT.md` - **MUST READ IN FULL**
   - Project overview, technology stack, and collaboration context

3. **Agent-specific file** - **MUST READ IN FULL** (if one exists)
   - Path: `.arc/system/agent/[AGENT].ARC.md` (e.g., CLAUDE.ARC.md, GEMINI.ARC.md, CODEX.ARC.md)
   - Agent-specific operational guidance (context window thresholds, capabilities, deferred review notes)
   - **If no agent-specific file exists**: Skip — the framework is agent-agnostic by default

**Constitutional and process context:**

4. `.arc/reference/constitution/DEV-RULES.ARC.md` - **MUST READ IN FULL**
   - Framework development methodology: commit standards, verification, session/task management

5. `.arc/reference/constitution/DEV-RULES.PROJECT.md` - **MUST READ IN FULL**
   - Project quality gates, testing requirements, code quality, and architecture rules
   - **Domain rule files**: Scan `constitution/` for additional `DEV-RULES.*.md` files (e.g.,
     `DEV-RULES.FRONTEND.md`). Note their domains — load on-demand when a task touches the
     relevant domain, not at init time.

6. `.arc/reference/strategies/STRATEGY-INDEX.md` - **MUST READ IN FULL**
   - Index of codified strategy guidance; establishes what domain-specific patterns exist

7. `.arc/reference/QUICK-REFERENCE.md` - **MUST READ IN FULL**
   - Environment context, command patterns, and quality gate commands

**Active work context:**

8. `.arc/active/WORK-STATUS.md` - **MUST READ IN FULL**
   - Project state: branch, task list path, next task, blockers, and next action
   - **"No active work" detection**: If Task List shows `[none]`, there is no active work unit.
     Skip item 10 (task list loading). Session orientation will report this state and surface
     the Next Action from WORK-STATUS.md (typically: create a PRD or plan new work).
   - **Task reference format**: Next Task uses triple-anchor format —
     `Task 5.5 — Implement validation (line ~1903)`: task number, title, approximate line.
     All three anchors should be present; any two are sufficient for reliable lookup.

**Resolve identity** (run in Batch 1):

1. Run `git config arc.identity`
2. If non-empty, use this value as `{identity}`
3. If empty: **skip all user workspace access** — SESSION-NOTES (item 9), ATOMIC-INBOX, and
   git notes all depend on identity for path resolution. A wrong identity silently points at
   the wrong directory. Surface a warning in the orientation summary: `arc.identity` is
   configured during initial setup — if absent, the developer may be on a new machine or setup
   was incomplete. Proceed with tracked state only (WORK-STATUS.md + task list).
   **Note:** Sessions without identity cannot perform handoff — SESSION-NOTES.md and git notes
   both require identity for path resolution. Flag this in the orientation if work is underway.

**Resolve role** (run in Batch 1, alongside identity):

1. Run `git config arc.role`
2. If the value is `contributor`: follow the **Contributor Session Path** below — skip items
   8, 10–11, Step 5, and the maintainer orientation format in Step 6.
3. If empty or `maintainer`: continue with the standard document set below.

> **Contributor Session Path**
>
> When `arc.role = contributor`, the session loads a reduced document set. Items 1–7 (project
> identity, constitution, strategies, quick reference) are universal — load them normally.
> Then:
>
> - **Load** `.arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md` — contributor role orientation
>   (boundaries, commit convention, session workflow differences)
> - **Load** `.arc/user/{identity}/SESSION-NOTES.md` if identity resolved and file exists —
>   personal context is role-agnostic
> - **Check** `.arc/user/{identity}/WORK-STATUS.md` if identity resolved — optional local
>   planning state. If present, note it in the orientation; if absent, that's normal
>   (contributors often don't maintain one)
> - **Skip** items 8, 10–11 (project-level WORK-STATUS, task list, task execution workflow)
> - **Skip** Step 5 (next work unit discovery — maintainer concern)
> - **Proceed to** Step 3 (extensions), Step 4 (configuration), then Step 6 with contributor
>   orientation format:
>
> **Contributor orientation format:**
>
> **ARC session initialized** · `{branch-name}` · contributor · {clean | uncommitted changes}
>
> **Context:** Contributor session — working on project code, not managing ARC planning artifacts.
>
> **Next action:** Ready for work. Use `Context: contribution (...)` commit footer.
>
> If local WORK-STATUS exists, include its state. If blockers or configuration issues were
> detected, include them. Otherwise, keep it minimal — contributors don't need the full
> maintainer state summary.

9. `.arc/user/{identity}/SESSION-NOTES.md` - **READ IF EXISTS** (Batch 2 — gitignored, may not be present)
   - Uses `{identity}` resolved above
   - Personal working context from prior session: approach, decisions, things tried, known risks
   - **Persistent context**: The `## Persistent Context` section carries entries that survive across
     handoffs (each with an explicit removal trigger). Treat these as active constraints for this session.
   - **If file doesn't exist or is stale**: Try restoring from git notes — run `arc user load` (or
     check `refs/notes/arc/user/{identity}` on HEAD, walking ancestors if needed). If no notes
     exist either, fall back to `git log --oneline -10` for recent commit context — commit
     messages and context footers provide a lightweight record of recent work. The session
     starts with tracked state (WORK-STATUS.md + task list) supplemented by git history.
   - **Load error handling:**
       - **No note found** (null result): Normal on first session, after repo re-clone without
         pulling notes, or when the noted commit is beyond the shallow clone boundary. Proceed
         with tracked state only — WORK-STATUS.md and task list are sufficient.
       - **Corrupt note** (JSON parse error): The note was manually edited or partially written.
         Run `arc user save` to overwrite with current local state, or try loading from a
         different ancestor by inspecting `git notes --ref arc/user/{identity} list`.
       - **Pull failure** (remote ref not found): The identity may not have pushed notes, or the
         identity name may be incorrect. Verify with `git ls-remote origin 'refs/notes/arc/user/*'`
         to see which identities have pushed notes. Use `--identity` to pull another developer's
         notes for bootstrapping.
       - **Stale file warnings**: Load reports local files not present in the saved manifest. These
         files are preserved in `.pre-load-backup.json` — review and either re-create them or
         discard the backup.

> **Person-to-person handoff:** If bootstrapping from another developer's handoff, fetch their
> git notes namespace (`refs/notes/arc/user/{their-identity}`). See
> [Team Coordination Strategy][team-coordination] § Person-to-Person Task Handoff for the full
> incoming bootstrap protocol.

10. **Active task list** - **STRATEGIC PARTIAL READ** (Batch 2 — often 500+ lines)

    **Skip if**: WORK-STATUS.md shows `Task List: [none]` — no task list to load.

    - Path referenced in WORK-STATUS.md
    - Example: `.arc/active/feature/tasks-[work-unit-name].md`
    - **Reading strategy**:
        - **ALWAYS read**: Overview section + current phase summary (first ~100 lines)
        - **ALWAYS read**: Current task section identified in WORK-STATUS.md (the specific task
          being worked on)
            - **Graduated lookup** using the triple-anchor reference from WORK-STATUS.md:
                1. Jump to line hint (`line ~N`) — if task number matches at that location, done
                2. Search for task number (e.g., `**4.2`) if line hint is stale
                3. Search for title fragment if task was renumbered
            - If none of the anchors resolve, report the mismatch (Step 6)
        - **Read on-demand**: Other phases and tasks as needed during work
    - **Why partial read OK**: This is the ONLY exception — reference material, often 500+ lines,
      too large to internalize upfront. But you MUST read the overview + current task context.
    - **What to extract**: Current phase, task details, acceptance criteria
    - **Companion file awareness**: Check the task list's directory for companion files
      (`notes-[name].md`, `atomic-[name].md`). Note their existence so task references to
      "notes file" or "atomic companion" resolve immediately during execution. **Do NOT read
      these files during init** — they are on-demand reference material, often large, loaded
      only when a specific task references them or SESSION-NOTES indicates context from them
      is needed for the current task.

11. **Task execution workflow** - **READ IN FULL** (Batch 2 — conditional)

    **Skip if**: WORK-STATUS.md shows `Task List: [none]` — no task execution expected.

    - Path: `.arc/system/workflows/arc/3_process-task-loop.md`
    - Contains: completion protocol, quality gate checkpoints, mandatory stops, deferred review,
      incidental work routing, and method dependency triggers (issue-triage, quality-gate-commands,
      test-first)
    - **Why conditional**: This is procedural content (T3) that promotes to session-init when
      WORK-STATUS confirms active task work. Without it, the agent skips completion protocol and
      quality gates. Sessions without an active task list (planning, exploratory) skip this —
      if the session pivots to task execution later, load it then.

### 3. Post-Context-Load Extensions · `#post-context-load`

If the `post-context-load` section in [`arc-extensions.md`][arc-ext-post-context-load] has steps
(not the default placeholder), follow those steps now. Use for team-specific documents, external
tool state, or environment checks before orientation.

See: [`arc-extensions.md` § post-context-load][arc-ext-post-context-load]

### 4. Check Active Configuration

The reads in this step (arc-config.yml, arc-methods.md) have no dependency on context documents —
batch them with Batch 1 in Step 2 where your platform supports parallel reads, then process the
results here.

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

**Do not mention defaults in the orientation.** Only surface non-default config values and active
method overrides. "All methods at defaults" and "all config at defaults" are the expected state —
reporting them is noise.

### 5. Assess Readiness

**Skip this step entirely** when `arc.role = contributor` — freshness checks and work unit
discovery are maintainer concerns. Proceed directly to Step 6.

Run the freshness check and, when no active work exists, discover what's next. Both feed
into the orientation summary in Step 6.

#### Freshness check

**Skip if** SESSION-NOTES `Commit at Handoff` hash matches current HEAD — documents are current.

Otherwise, or if no handoff hash exists (first session, crash, new clone without notes):

```bash
# Get current HEAD hash
git log -1 --format=%h

# Count commits since SESSION-NOTES handoff (substitute the actual hash)
# Skip this command if no handoff hash exists — there's no baseline to compare against.
# Instead, rely on WORK-STATUS freshness check below.
git log --oneline <handoff-hash>..HEAD

# Check WORK-STATUS freshness
git log -1 --format=%h -- .arc/active/WORK-STATUS.md
# If this differs from HEAD, WORK-STATUS hasn't been updated across recent commits
```

A freshness gap doesn't mean state is wrong — it means verify more carefully before trusting
session documents. **Only mention gaps in the orientation if they exist.** A clean check
produces no output.

#### ATOMIC-INBOX check

If identity resolved and `user/{identity}/ATOMIC-INBOX.md` exists and has incomplete items, note the count in the
orientation summary (e.g., "3 inbox items pending triage"). This is a lightweight reminder —
the primary triage point is during [integration][integrate-work-unit], but surfacing the count
at session start prevents items from accumulating unnoticed across many small work units.

#### Next work unit discovery

**Skip if** WORK-STATUS.md shows an active task list — discovery only applies between work units.

When WORK-STATUS.md shows `Task List: [none]`, assess readiness for the next work unit:

1. Read ROADMAP.md — identify the next queued or suggested item
2. Check the backlog directory for existing artifacts matching that item (PRDs, `plan-*` docs)
3. If identity resolved, check `user/{identity}/ATOMIC-INBOX.md` — if it exists with items, note the count
   (e.g., "3 inbox items pending triage")
4. Report what exists and its readiness state in the orientation summary
5. Propose next steps based on what was found — ask for confirmation before proceeding

Planning readiness varies: a completed PRD may be ready for task generation, a draft PRD may
need refinement, a `plan-*` doc may need development before a PRD can be created, a roadmap
entry may have no artifacts yet, or there may be no roadmap entry at all. The agent discovers
and reports — the user decides how to proceed.

> **Full protection (`branch.protection: full`):** Planning work requires a branch. When the
> user confirms next steps, run [activate-planning-branch][activate-planning-branch] before
> creating plan documents or PRDs. Under partial protection (the default), proceed directly
> to [1_create-prd.md][create-prd] — no planning branch needed.

### 6. Confirm Orientation

Produce the orientation summary. This is the user's first view of session state — keep it
focused on what matters and suppress anything that resolved cleanly.

**Output format:**

**ARC session initialized** · `{branch-name}` · {clean | uncommitted changes}

**Active work state:**

- **Last completed**: What was finished and its current state (committed, uncommitted, etc.)
- **Current task**: Task being worked on per WORK-STATUS.md (or "none" between work units)
- **Blockers**: Any blockers or mismatches detected during initialization, or "none"

**Next action:** What comes next per WORK-STATUS.md

Awaiting direction — proceed to Next Action?

**What to include and what to suppress:**

The orientation should surface *problems and decisions*, not a log of checks that passed.

- **Always include**: active work state, next action, blockers, and discovery results
  (when between work units)
- **Include only if non-default or actionable**: configuration overrides, freshness gaps,
  method overrides, missing identity, environment issues
- **Never include**: confirmation that defaults are active, that freshness is clean, that
  no overrides were found, that extensions had no steps, or that environment checks passed.
  These are the expected state — reporting them is noise.

### 7. If Context Seems Mismatched

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
- (Team mode) WORK-STATUS shows "Next Task: 3.4" but task list shows 3.4 marked `[x]` by
  a teammate's commit → another developer completed it; proceed with 3.5 as current

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

---

[activate-planning-branch]: ../work-unit-lifecycle/planning/activate-planning-branch.md
[create-prd]: ../1_create-prd.md
[arc-methods-session]: ../../arc-methods.md#session-state
[arc-ext-post-context-load]: ../../arc-extensions.md#post-context-load
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
[integrate-work-unit]: ../work-unit-lifecycle/integrate-work-unit.md
