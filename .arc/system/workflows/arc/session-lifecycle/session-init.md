---
purpose: Establish AI context at session start — environment, project context, and behavioral guidance.
audience: agent
arc:
  methods:
    - session-state
  extensions:
    - post-context-load
---

# Workflow: Session Initialization

**When to use**: User-triggered at the start of every session (resuming features, starting new work, handling
incidental tasks, etc.). The agent does not initiate this workflow on its own.

**Session lifecycle assumption**: ARC sessions are bounded — they begin with this initialization workflow and
end with an explicit handoff (see `session-handoff.md`). If an agent's context fills mid-session, the correct
response is to complete the current work item and hand off, not to compact or summarize prior context.

**Design context**: Sessions implement P5 (Context Preservation) — structured document loading for agents with
ephemeral context. Agents with persistent memory may need lighter ceremonies; the principle (work context must
be recoverable) still applies. The session state mechanism is overridable via the
[session-state method][arc-methods-session].

## Steps

### 1. Verify Environment

```bash
pwd
# Expected: /home/andrew/dev/arc-framework (repo root)
```

Adopters: add project-specific runtime checks here if needed (services, build tools, env vars). If
working-directory verification is sufficient, leave as-is.

### 2. Probe ARC Domain

Run the composite probe:

```bash
arc status --session-init --json
```

Non-destructive. Returns a single JSON envelope the agent consumes:

| Field        | Contents                                                                                                                                      |
|--------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `identity`   | `{identity, role}` — either may be `null`                                                                                                     |
| `user`       | Remote notes state (`value.state`: clean / remote-ahead / conflict / disabled / remote-unavailable)                                           |
| `extensions` | `value.active`: the **active-extensions list** — consulted by fire-point directives in downstream workflows                                   |
| `config`     | `value.settings`: session-relevant settings (`session.remote_sync`, `branch.protection`, `pm.mode`, `commit.format`, `commit.context_footer`) |
| `active`     | Active status file resolution (`value.resolution`: single / multiple / none; `value.path`, `value.candidates`, `value.layout`)                |

Carry `config` values forward as behavioral awareness. Do not surface configuration in orientation — the
developer already knows their own settings; defaults and overrides reach the user at the operation that
consumes them, not as init-time status.

**Identity absent** (`identity.identity === null`): Skip all user workspace access — SESSION-NOTES,
ATOMIC-INBOX, and git notes all depend on identity for path resolution. Surface a warning in orientation (new
machine or incomplete setup). Sessions without identity cannot perform handoff.

**Role is `contributor`**: Follow the **Contributor Session Path** below — skip items 8, 10–11 in Step 4, skip
Step 6, and use the contributor orientation format in Step 7.

**Probe failure fallback**: If the composite call fails (CLI not on PATH, fresh clone pre-build), fall back to
direct commands: `git config arc.identity` / `arc.role`, `grep -l "^active: true" .arc/system/extensions/*.md`,
and a scan of `.arc/active/**/status-*.md`. Skip Step 3 (no user-sync state available) and note the
degradation in orientation. Downstream workflows load the config they need at their own trigger points.

### 3. Conditional Sync Pull

Inspect `user.value.state` from Step 2:

- `remote-ahead` or `conflict`: Surface in orientation and ask whether to run `arc user pull`. **Pull before
  Step 4** — context-doc loading reads SESSION-NOTES, which will be stale if the remote note has newer content.
- `remote-unavailable`: Note the degraded state. If the probe says the remote is unreachable, continue with local
  tracked state or retry once the remote is reachable. If it says the remote is reachable but full comparison is
  blocked in this environment, continue with local tracked state or retry session-init where `git fetch` / remote-ref
  writes are allowed.
- `clean`, `disabled`, or identity absent: Continue without prompting.

The agent owns the prompt — do not defer it to the CLI.

### 4. Load Context Documents

**Reading rule**: Read every document in the list below in full EXCEPT the active task list (item 10 —
reference material, often 500+ lines, strategic partial read).

**Parallelism**: Framework docs (items 1–7), SESSION-NOTES (item 9), and — when `active.resolution === "single"` —
the active status file can load in parallel. Task list (item 10) and task execution workflow (item 11) wait
for the status file to resolve. Sequential execution is fine if your platform doesn't support parallel reads.

The document set below is the [session-state method][arc-methods-session] default. If your project overrides
session-state, follow the override instead.

**Project identity and agent context:**

1. `.arc/system/agent/AGENT-BRIEFING.ARC.md` — ARC framework orientation
2. `.arc/system/agent/AGENT-BRIEFING.PROJECT.md` — project overview, tech stack, collaboration context
3. Agent-specific file `.arc/system/agent/[AGENT].ARC.md` (e.g., CLAUDE.ARC.md) — **if one exists**. Skip if
   absent (framework is agent-agnostic by default)

**Constitutional and process context:**

4. `.arc/reference/constitution/DEV-RULES.ARC.md`
5. `.arc/reference/constitution/DEV-RULES.PROJECT.md`
    - Scan `constitution/` for additional `DEV-RULES.*.md` domain files (e.g., `DEV-RULES.FRONTEND.md`). Note
      their domains — load on-demand when a task touches the relevant domain, not at init time
6. `.arc/reference/strategies/STRATEGY-INDEX.md`
7. `.arc/reference/QUICK-REFERENCE.md`

**Active work context:**

8. **Active status file** — resolve from `active.value` and read in full:
    - `resolution: "single"`: path is `active.value.path`
    - `resolution: "none"`: no active work unit. Skip items 10–11; Step 6 handles next-work discovery
    - `resolution: "multiple"` (full mode only): apply disambiguation after SESSION-NOTES loads (item 9) —
      precedence:
        1. SESSION-NOTES `**Working On:**` value matches a candidate filename
        2. Candidate `**Branch:**` matches the current git branch
        3. Candidate `**State:** In Progress`
        4. Prompt the user:

            ```text
            Multiple status files matched. Select one:
              [1] status-work-status-restructure.md · technical/work-status-restructure
                  Next Task: 2.2 — Status file template (new) — retire the old
                  State:    In Progress
              [2] status-arcd-rebrand.md · feature/arcd-rebrand
                  Next Task: 1.3 — Rename CLI package
                  State:    Paused (2026-04-12) — waiting for restructure
              [q] Abort session-init
            Your choice:
            ```

        Each candidate shows filename, `**Branch:**`, truncated `**Next Task:**`, and `**State:**`. If the
        user aborts, surface the candidate list and halt session-init.
    - **Task reference format**: `**Next Task:**` uses triple-anchor format —
      `Task 5.5 — Implement validation (line ~1903)`. All three anchors should be present; any two are
      sufficient for reliable lookup.

9. `.arc/user/{identity}/SESSION-NOTES.md` — **read if exists**. Uses `{identity}` from Step 2
    - Personal working context from prior session: approach, decisions, things tried, known risks
    - **Persistent context**: The `## Persistent Context` section carries entries that survive across handoffs
      (each has an explicit removal trigger). Treat these as active constraints for this session
    - **If absent or stale**: Try `arc user load` (walks ancestors for `refs/notes/arc/user/{identity}`). If no
      notes either, fall back to `git log --oneline -10`. Tracked state (active status file + task list) plus
      git history is sufficient
    - **Load errors:**
        - **No note found** (null result): Normal on first session, re-clone without notes, or when the noted
          commit is beyond the shallow clone boundary. Proceed with tracked state
        - **Corrupt note** (JSON parse error): Run `arc user save` to overwrite, or inspect
          `git notes --ref arc/user/{identity} list` for a different ancestor
        - **Pull failure** (remote ref not found): Identity may not have pushed, or the name may be wrong.
          Verify via `git ls-remote origin 'refs/notes/arc/user/*'`
        - **Stale file warnings**: Load reports local files absent from the saved manifest. Preserved in
          `.pre-load-backup.json` — review and either re-create or discard

> **Person-to-person handoff:** If bootstrapping from another developer's handoff, fetch their git notes
> namespace (`refs/notes/arc/user/{their-identity}`). See [Team Coordination Strategy][team-coordination]
> § Person-to-Person Task Handoff for the incoming bootstrap protocol.

10. **Active task list** — **strategic partial read** (often 500+ lines).

    **Skip if** the active status file is not resolved or shows `**Task List:** [none]`.

    - Path from the active status file (e.g., `.arc/active/feature/tasks-[name].md`)
    - **Always read**: overview + current phase summary (first ~100 lines) and the current task section
    - **Graduated lookup** using the triple-anchor reference from `**Next Task:**`:
        1. Jump to the line hint (`line ~N`) — if the task number matches there, done
        2. Search for the task number (e.g., `**4.2`) if the line hint is stale
        3. Search for the title fragment if the task was renumbered
        4. If none resolve, report the mismatch (Step 8)
    - **Why partial read OK**: Reference material too large to internalize upfront. Read other sections
      on-demand during work
    - **Companion file awareness**: Check the task list directory for `notes-[name].md` / `atomic-[name].md`.
      Note their existence so references during execution resolve immediately. **Do not read these at init** —
      on-demand reference material, often large

11. **Task execution workflow** `.arc/system/workflows/arc/3_process-task-loop.md` — **read in full**.

    **Skip if** the active status file is not resolved or shows `**Task List:** [none]`.

    - Procedural content (T3) that promotes to session-init when the active status file confirms active task
      work. Without it, the agent skips completion protocol and quality gates. Sessions without an active task
      list (planning, exploratory) skip this — if the session pivots to task execution later, load it then

> **Contributor Session Path**
>
> When `arc.role = contributor`, the session loads a reduced document set. Items 1–7 are universal — load them
> normally. Then:
>
> - **Load** `.arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md`
> - **Load** `.arc/user/{identity}/SESSION-NOTES.md` if identity resolved and the file exists
> - **Check** `.arc/user/{identity}/status-contributor.md` if identity resolved — optional local planning
>   state; note in orientation if present
> - **Skip** items 8, 10–11
> - **Skip** Step 6 (next-work discovery — maintainer concern)
> - **Proceed to** Step 5 (extensions) → Step 7 with contributor orientation format:
>
> **Contributor orientation format:**
>
> **ARC session initialized** · `{branch-name}` · contributor · {clean | uncommitted changes}
>
> **Context:** Contributor session — working on project code, not managing ARC planning artifacts.
>
> **Next action:** Ready for work. Use `Context: contribution (...)` commit footer.
>
> Include status-contributor.md state if present and any blockers or configuration issues detected. Otherwise
> keep it minimal — contributors don't need the full maintainer state summary.

### 5. Post-Context-Load Extensions · `#post-context-load`

If `post-context-load` appears in the active-extensions list (from Step 2), load and execute its
[`.actions`][arc-ext-post-context-load]. Otherwise, skip. Use for team-specific documents, external tool
state, or environment checks before orientation.

### 6. Assess Readiness

**Skip entirely** when `identity.role === "contributor"` — freshness and work-unit discovery are maintainer
concerns. Proceed directly to Step 7.

#### Freshness check

**Skip if** SESSION-NOTES `Commit at Handoff` hash matches current HEAD — documents are current.

Otherwise, or if no handoff hash exists (first session, crash, fresh clone without notes):

```bash
# Current HEAD
git log -1 --format=%h

# Commits since handoff (skip if no handoff hash — no baseline)
git log --oneline <handoff-hash>..HEAD

# Active status file freshness (skip if no status file resolved)
git log -1 --format=%h -- <status-file-path>
# Differing from HEAD means the status file hasn't been updated across recent commits
```

A gap doesn't mean state is wrong — it means verify more carefully before trusting session documents. **Only
mention gaps in orientation if they exist.** A clean check produces no output.

#### Next work unit discovery

**Skip if** an active status file was resolved and its `**Task List:**` is not `[none]` — discovery only
applies between work units.

When no active status file was resolved, or the resolved file shows `**Task List:** [none]`, assess readiness
for the next unit:

1. Read ROADMAP.md — identify the next queued or suggested item
2. Check the backlog directory for existing artifacts (PRDs, `plan-*` docs) matching that item
3. Report what exists and its readiness state in orientation
4. Propose next steps; ask for confirmation before proceeding

Planning readiness varies: a completed PRD may be ready for task generation, a draft PRD may need refinement,
a `plan-*` doc may need development before a PRD can be created, a roadmap entry may have no artifacts yet,
or there may be no roadmap entry at all. The agent discovers and reports — the user decides how to proceed.

> **Full protection (`branch.protection: full`):** Planning work requires a branch. When the user confirms
> next steps, run [activate-planning-branch][activate-planning-branch] before creating plan documents or PRDs.
> Under partial protection (the default), proceed directly to [1_create-prd.md][create-prd] — no planning
> branch needed.

### 7. Confirm Orientation

Produce the orientation summary — the user's first view of session state. Keep it focused on what matters.

**Output format:**

**ARC session initialized** · `{branch-name}` · {clean | uncommitted changes}

**Active work state:**

- **Last completed**: What was finished and its current state (committed, uncommitted, etc.)
- **Current task**: Task being worked on per the active status file (or "none" between work units)
- **Blockers**: Any blockers or mismatches detected during initialization, or "none"

**Next action:** What comes next per the active status file (or discovery result when between work units)

Awaiting direction — proceed to Next Action?

**Include only if actionable**: freshness gaps, missing identity, environment issues, sync states other than
`clean`, probe-failure fallback.

**Never include**: configuration overrides, active-extensions list (any state), defaults active, freshness
clean, environment checks passed. The developer already knows their configuration; reference state belongs in
`arc-config.yml`, not orientation.

### 8. If Context Seems Mismatched

If documented state doesn't match reality during initialization, use the trust hierarchy.

**Trust hierarchy** (highest to lowest):

1. **Git state** — `git status`, `git log`, file contents on disk
2. **Task list** — checkbox state, task descriptions
3. **Active status file** — tracked project pointer
4. **SESSION-NOTES.md** — personal session context (gitignored, most volatile)

**Tier 1 — Auto-recover with notice:**

When higher-trust sources agree and a lower-trust source is the outlier, proceed with the ground truth and
report the discrepancy in orientation.

Report format: "Active status file said X. Git/task list show Y. Proceeding with Y."

Examples:

- Active status file says "Task 3.3 in progress" but task list shows 3.3 marked `[x]` and git log confirms the
  commit → proceed with Task 3.4 as current
- SESSION-NOTES describes uncommitted work but `git status` is clean and git log shows it committed → proceed
  with committed state
- Active status file says "Last Completed: Task 3.2" but task list shows 3.3 also marked `[x]` → proceed with
  3.3 as last completed
- (Team mode) Active status file shows "Next Task: 3.4" but task list shows 3.4 marked `[x]` by a teammate's
  commit → another developer completed it; proceed with 3.5 as current

**Tier 2 — Stop and ask:**

When the mismatch is ambiguous — multiple plausible explanations, or sources at the same trust tier disagree.

1. **Stop immediately** — do not proceed with work
2. **Report the mismatch** with specific details from each source
3. **Ask for guidance**; wait for explicit direction before taking any corrective action

Examples:

- Git shows uncommitted changes to files not mentioned in any session doc — could be co-development, a
  partial task, or an interrupted session
- The active status file references a task that doesn't exist in the task list — renumbered, removed, or the
  status file points to the wrong task list
- Task list shows Task 3.3 incomplete but git log has a commit referencing Task 3.3 — conflicting signals at
  the same trust tier

---

[activate-planning-branch]: ../work-unit-lifecycle/planning/activate-planning-branch.md
[create-prd]: ../1_create-prd.md
[arc-methods-session]: ../../../methods/session-state.md
[arc-ext-post-context-load]: ../../../extensions/post-context-load.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
